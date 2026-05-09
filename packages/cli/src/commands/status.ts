/**
 * bap status — Show current execution-cockpit status without auto-starting a browser
 */

import type { BAPClient } from "@browseragentprotocol/client";
import type { SessionInfo } from "@browseragentprotocol/protocol";
import type { GlobalFlags } from "../config/state.js";
import { printStatusSummary } from "../output/formatter.js";
import { getCliSessionId, listKnownSessions } from "../session-state.js";
import { connectIfServerRunning, resolveProfile } from "../server/manager.js";
import { register } from "./registry.js";

function mapLifecycle(session?: SessionInfo, hasLocalHandoff?: boolean): "active" | "dormant" | "handoff" | "stopped" {
  if (session) {
    if (session.handoffPending) {
      return "handoff";
    }
    return session.state;
  }

  if (hasLocalHandoff) {
    return "handoff";
  }

  return "stopped";
}

export async function statusCommand(
  _args: string[],
  flags: GlobalFlags,
  _client: BAPClient
): Promise<void> {
  const sessionId = getCliSessionId(flags);
  const known = listKnownSessions(resolveProfile).find((entry) => entry.sessionId === sessionId);
  const client = await connectIfServerRunning({
    port: flags.port,
    host: flags.host,
    timeout: flags.timeout,
  });

  try {
    if (!client) {
      printStatusSummary({
        server: "stopped",
        sessionId,
        lifecycle: mapLifecycle(undefined, Boolean(known?.handoff)),
      });
      return;
    }

    const { sessions } = await client.listSessions();
    const session = sessions.find((entry) => entry.sessionId === sessionId);

    printStatusSummary({
      server: "running",
      sessionId,
      lifecycle: mapLifecycle(session, Boolean(known?.handoff)),
      ...(session?.browser ? { browser: session.browser } : {}),
      ...(session?.channel ? { channel: session.channel } : {}),
      ...(session?.headless !== undefined ? { headless: session.headless } : {}),
      ...(session?.pageCount !== undefined ? { pageCount: session.pageCount } : {}),
      ...(session?.activePageUrl ? { activePageUrl: session.activePageUrl } : {}),
      ...(session?.activePageTitle ? { activePageTitle: session.activePageTitle } : {}),
      ...(session?.handoffPending !== undefined ? { handoffPending: session.handoffPending } : {}),
      ...(session?.expiresAt ? { expiresAt: session.expiresAt } : {}),
      ...(session?.trust ? { trust: session.trust } : {}),
    });
  } finally {
    await client?.close();
  }
}

register("status", statusCommand);
