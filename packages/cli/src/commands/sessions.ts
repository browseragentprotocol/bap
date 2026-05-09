/**
 * bap sessions — List live and recently-known sessions without auto-starting a browser
 */

import type { BAPClient } from "@browseragentprotocol/client";
import type { SessionInfo } from "@browseragentprotocol/protocol";
import type { GlobalFlags } from "../config/state.js";
import type { SessionListEntry } from "../output/formatter.js";
import { printSessionList } from "../output/formatter.js";
import { getCliSessionId, listKnownSessions } from "../session-state.js";
import { connectIfServerRunning, resolveProfile } from "../server/manager.js";
import { register } from "./registry.js";

function mapLiveSession(entry: SessionInfo, currentSessionId: string): SessionListEntry {
  return {
    sessionId: entry.sessionId,
    lifecycle: entry.handoffPending ? "handoff" : entry.state,
    pageCount: entry.pageCount,
    ...(entry.browser ? { browser: entry.browser } : {}),
    ...(entry.channel ? { channel: entry.channel } : {}),
    ...(entry.headless !== undefined ? { headless: entry.headless } : {}),
    ...(entry.activePageUrl ? { activePageUrl: entry.activePageUrl } : {}),
    ...(entry.activePageTitle ? { activePageTitle: entry.activePageTitle } : {}),
    ...(entry.handoffPending !== undefined ? { handoffPending: entry.handoffPending } : {}),
    ...(entry.lastActivityAt ? { lastSeenAt: entry.lastActivityAt } : {}),
    ...(entry.expiresAt ? { expiresAt: entry.expiresAt } : {}),
    isCurrent: entry.sessionId === currentSessionId,
    sources: [entry.state],
    ...(entry.trust ? { trust: entry.trust } : {}),
  };
}

async function sessionsCommand(
  _args: string[],
  flags: GlobalFlags,
  _client: BAPClient,
): Promise<void> {
  const currentSessionId = getCliSessionId(flags);
  const entries = new Map<string, SessionListEntry>();

  const remember = (entry: SessionListEntry): void => {
    const existing = entries.get(entry.sessionId);
    if (!existing) {
      entries.set(entry.sessionId, entry);
      return;
    }

    entries.set(entry.sessionId, {
      ...existing,
      ...entry,
      sources: Array.from(new Set([...(existing.sources ?? []), ...(entry.sources ?? [])])),
      lastSeenAt: Math.max(existing.lastSeenAt ?? 0, entry.lastSeenAt ?? 0) || undefined,
      isCurrent: existing.isCurrent || entry.isCurrent,
    });
  };

  const client = await connectIfServerRunning({
    port: flags.port,
    host: flags.host,
    timeout: flags.timeout,
  });

  try {
    if (client) {
      const result = await client.listSessions();
      result.sessions.forEach((session) => remember(mapLiveSession(session, currentSessionId)));
    }

    listKnownSessions(resolveProfile).forEach((session) => {
      remember({
        sessionId: session.sessionId,
        lifecycle: session.handoff ? "handoff" : "recorded",
        ...(session.traceEntries !== undefined ? { traceEntries: session.traceEntries } : {}),
        ...(session.lastSeenAt ? { lastSeenAt: session.lastSeenAt } : {}),
        ...(session.handoff
          ? {
              browser: session.handoff.launch.browser,
              headless: session.handoff.launch.headless,
              handoffPending: true,
              expiresAt: Date.parse(session.handoff.createdAt) + (24 * 60 * 60 * 1000),
            }
          : {}),
        isCurrent: session.sessionId === currentSessionId,
        sources: session.sources,
      });
    });
  } finally {
    await client?.close();
  }

  printSessionList(
    Array.from(entries.values()).sort(
      (left, right) => (right.lastSeenAt ?? 0) - (left.lastSeenAt ?? 0)
    )
  );
}

register("sessions", sessionsCommand);
