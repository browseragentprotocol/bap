/**
 * @fileoverview Session inspection handlers
 * @module @browseragentprotocol/server-playwright/handlers/session
 */

import type { SessionInfo, SessionListResult } from "@browseragentprotocol/protocol";
import type { BAPScope, TrustSurface } from "@browseragentprotocol/protocol";
import type { ClientState, DormantSession, HandlerContext } from "../types.js";

function deriveApprovalMode(scopes: BAPScope[]): TrustSurface["approvalMode"] {
  if (
    scopes.includes("*") ||
    scopes.some((scope) => scope.startsWith("storage:") || scope.startsWith("network:"))
  ) {
    return "privileged";
  }

  const readonlyScopes = new Set(["page:read", "observe:*"]);
  if (scopes.every((scope) => readonlyScopes.has(scope))) {
    return "readonly";
  }

  return "standard";
}

function buildTrustSurface(ctx: HandlerContext): TrustSurface {
  const scopes = ctx.getClientScopes();
  return {
    approvalMode: deriveApprovalMode(scopes),
    ...(ctx.options.security.allowedHosts ? { allowedDomains: ctx.options.security.allowedHosts } : {}),
    redaction: {
      content: ctx.options.security.redactSensitiveContent,
      passwordValues: ctx.options.security.blockPasswordValueExtraction,
      screenshots: ctx.options.security.redactPasswordsInScreenshots,
      storageState: ctx.options.security.blockStorageStateExtraction,
    },
  };
}

async function summarizeActivePage(
  pageId: string | null,
  pages: Map<string, import("playwright").Page>
): Promise<Pick<SessionInfo, "activePageId" | "activePageUrl" | "activePageTitle">> {
  if (!pageId) {
    return {};
  }

  const page = pages.get(pageId);
  if (!page) {
    return {};
  }

  try {
    return {
      activePageId: pageId,
      activePageUrl: page.url(),
      activePageTitle: await page.title(),
    };
  } catch {
    return {
      activePageId: pageId,
      activePageUrl: page.url(),
    };
  }
}

async function summarizeClientSession(state: ClientState): Promise<SessionInfo | null> {
  if (!state.sessionId) {
    return null;
  }

  return {
    sessionId: state.sessionId,
    clientId: state.clientId,
    state: "active",
    pageCount: state.pages.size,
    ...(await summarizeActivePage(state.activePage, state.pages)),
    ...(state.launchState?.browser ? { browser: state.launchState.browser } : {}),
    ...(state.launchState?.channel ? { channel: state.launchState.channel } : {}),
    ...(state.launchState?.headless !== undefined ? { headless: state.launchState.headless } : {}),
    isPersistent: state.isPersistent,
    ...(state.handoffPending !== undefined ? { handoffPending: state.handoffPending } : {}),
    lastActivityAt: state.lastActivityTime,
  };
}

async function summarizeDormantSession(dormant: DormantSession): Promise<SessionInfo> {
  return {
    sessionId: dormant.sessionId,
    state: "dormant",
    pageCount: dormant.pages.size,
    ...(await summarizeActivePage(dormant.activePage, dormant.pages)),
    ...(dormant.launchState?.browser ? { browser: dormant.launchState.browser } : {}),
    ...(dormant.launchState?.channel ? { channel: dormant.launchState.channel } : {}),
    ...(dormant.launchState?.headless !== undefined ? { headless: dormant.launchState.headless } : {}),
    isPersistent: dormant.isPersistent,
    ...(dormant.handoffPending !== undefined ? { handoffPending: dormant.handoffPending } : {}),
    parkedAt: dormant.parkedAt,
    ...(dormant.dormantTtlMs !== undefined
      ? { expiresAt: dormant.parkedAt + dormant.dormantTtlMs }
      : {}),
  };
}

export async function handleSessionList(ctx: HandlerContext): Promise<SessionListResult> {
  const sessions: SessionInfo[] = [];
  const trust = buildTrustSurface(ctx);

  for (const state of ctx.clients.values()) {
    const summary = await summarizeClientSession(state);
    if (summary) {
      sessions.push({ ...summary, trust });
    }
  }

  for (const dormant of ctx.dormantSessions.values()) {
    sessions.push({ ...(await summarizeDormantSession(dormant)), trust });
  }

  sessions.sort((left, right) => {
    const leftTs = left.lastActivityAt ?? left.parkedAt ?? 0;
    const rightTs = right.lastActivityAt ?? right.parkedAt ?? 0;
    return rightTs - leftTs;
  });

  return { sessions };
}
