/**
 * @fileoverview Dormant session park/restore/expire
 * @module @browseragentprotocol/server-playwright/session/dormant-store
 */

import type { BrowserContext } from "playwright";
import type { ResolvedOptions } from "../config.js";
import type { ClientState, DormantSession } from "../types.js";

export interface DormantStoreDeps {
  dormantSessions: Map<string, DormantSession>;
  options: ResolvedOptions;
  log: (message: string, context?: Record<string, unknown>) => void;
  isContextAlive: (context: BrowserContext | null) => boolean;
  clearConnectionScopedState: (state: ClientState, errorMessage: string) => void;
}

/**
 * Park a client's browser state into the dormant store.
 */
export async function parkSession(state: ClientState, deps: DormantStoreDeps): Promise<void> {
  const sessionId = state.sessionId!;

  deps.clearConnectionScopedState(state, "Client disconnected");

  // Expire existing dormant session with same ID if any
  const existing = deps.dormantSessions.get(sessionId);
  if (existing) {
    clearTimeout(existing.ttlHandle);
    // Fire-and-forget cleanup — .catch() prevents unhandled rejection
    if (existing.browserOwnership === "borrowed") {
      // CDP attach: drop reference only, never close the external browser
    } else if (existing.isPersistent) {
      existing.context?.close().catch(() => {});
    } else {
      existing.browser?.close().catch(() => {});
    }
    deps.dormantSessions.delete(sessionId);
  }

  const ttl = deps.options.session.dormantSessionTtl * 1000;
  const ttlHandle = setTimeout(() => {
    expireDormantSession(sessionId, deps);
  }, ttl);

  // Snapshot storage state for crash recovery (best-effort, non-blocking)
  let storageStateSnapshot: string | undefined;
  try {
    if (state.context) {
      const ss = await state.context.storageState();
      storageStateSnapshot = JSON.stringify(ss);
    }
  } catch {
    // Context may be closed or corrupted — skip snapshot
  }

  const dormant: DormantSession = {
    sessionId,
    browser: state.browser,
    isPersistent: state.isPersistent,
    browserOwnership: state.browserOwnership,
    context: state.context,
    contexts: new Map(state.contexts),
    defaultContextId: state.defaultContextId,
    pages: new Map(state.pages),
    pageToContext: new Map(state.pageToContext),
    activePage: state.activePage,
    elementRegistries: new Map(state.elementRegistries),
    frameContexts: new Map(state.frameContexts),
    sessionApprovals: new Set(state.sessionApprovals),
    ttlHandle,
    parkedAt: Date.now(),
    storageStateSnapshot,
  };

  deps.dormantSessions.set(sessionId, dormant);
  deps.log("Session parked", { sessionId, ttl: `${deps.options.session.dormantSessionTtl}s` });

  // Nullify state so cleanupClient() won't destroy the browser/pages
  state.browser = null;
  state.isPersistent = false;
  state.browserOwnership = "owned";
  state.context = null;
  state.pages = new Map();
  state.pageToContext = new Map();
  state.activePage = null;
  state.elementRegistries = new Map();
  state.frameContexts = new Map();
  state.contexts = new Map();
  state.defaultContextId = null;
}

/**
 * Restore a dormant session into a new client's state.
 * Returns true if restoration succeeded, false if browser crashed during dormancy.
 */
export function restoreSession(
  dormant: DormantSession,
  state: ClientState,
  deps: DormantStoreDeps
): boolean {
  clearTimeout(dormant.ttlHandle);
  deps.dormantSessions.delete(dormant.sessionId);

  const isAlive = dormant.isPersistent
    ? deps.isContextAlive(dormant.context)
    : Boolean(dormant.browser?.isConnected());
  if (!isAlive) {
    deps.log("Dormant session browser crashed, starting fresh", {
      sessionId: dormant.sessionId,
    });
    // Fire-and-forget close — .catch() prevents unhandled rejection
    if (dormant.isPersistent) {
      dormant.context?.close().catch(() => {});
    } else {
      dormant.browser?.close().catch(() => {});
    }
    return false;
  }

  state.browser = dormant.browser;
  state.isPersistent = dormant.isPersistent;
  state.browserOwnership = dormant.browserOwnership;
  state.context = dormant.context;
  state.contexts = dormant.contexts;
  state.defaultContextId = dormant.defaultContextId;
  state.pages = dormant.pages;
  state.pageToContext = dormant.pageToContext;
  state.activePage = dormant.activePage;
  state.elementRegistries = dormant.elementRegistries;
  state.frameContexts = dormant.frameContexts;
  state.sessionApprovals = dormant.sessionApprovals;

  return true;
}

/**
 * Expire and destroy a dormant session after TTL.
 */
export function expireDormantSession(sessionId: string, deps: DormantStoreDeps): void {
  const dormant = deps.dormantSessions.get(sessionId);
  if (!dormant) return;

  deps.log("Dormant session expired", { sessionId });
  deps.dormantSessions.delete(sessionId);

  // Fire-and-forget cleanup — .catch() prevents unhandled rejection
  if (dormant.browserOwnership === "borrowed") {
    // CDP attach: drop reference only, never close the external browser
  } else if (dormant.isPersistent) {
    dormant.context?.close().catch(() => {});
  } else {
    dormant.browser?.close().catch(() => {});
  }
}
