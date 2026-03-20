/**
 * @fileoverview Lifecycle handlers (initialize, shutdown)
 * @module @browseragentprotocol/server-playwright/handlers/lifecycle
 */

import { WebSocket } from "ws";
import {
  BAP_VERSION,
  type InitializeParams,
  type InitializeResult,
  type ServerCapabilities,
  ErrorCodes,
} from "@browseragentprotocol/protocol";
import { BAPServerError } from "../errors.js";
import type { HandlerContext, ClientState } from "../types.js";

export async function handleInitialize(
  state: ClientState,
  params: InitializeParams,
  ctx: HandlerContext
): Promise<InitializeResult> {
  if (state.initialized) {
    throw new BAPServerError(ErrorCodes.AlreadyInitialized, "Already initialized");
  }

  const sessionId = params.sessionId;

  // Session persistence: check for conflicts and restore dormant sessions
  if (sessionId) {
    for (const [existingWs, existingState] of ctx.clients) {
      if (
        existingState !== state &&
        existingState.sessionId === sessionId &&
        existingState.initialized
      ) {
        ctx.log("Force-parking stale session from previous connection", { sessionId });
        const isAlive = existingState.isPersistent
          ? ctx.isContextAlive(existingState.context)
          : Boolean(existingState.browser?.isConnected());
        if (isAlive) {
          await ctx.parkSession(existingState);
        }
        if (
          existingWs.readyState === WebSocket.OPEN ||
          existingWs.readyState === WebSocket.CONNECTING
        ) {
          existingWs.close(4001, "Session replaced by newer connection");
        }
        ctx.clients.delete(existingWs);
        break;
      }
    }

    state.sessionId = sessionId;

    const dormant = ctx.dormantSessions.get(sessionId);
    if (dormant) {
      const restored = ctx.restoreSession(dormant, state);
      if (restored) {
        ctx.log("Restored dormant session", { sessionId, clientId: state.clientId });
      }
    }
  }

  state.initialized = true;

  const capabilities: ServerCapabilities = {
    browsers: ["chromium", "firefox", "webkit"],
    events: ["page", "network", "console", "dialog", "download"],
    observations: ["screenshot", "accessibility", "dom", "element", "pdf", "content"],
    actions: [
      "click",
      "dblclick",
      "type",
      "fill",
      "clear",
      "press",
      "hover",
      "scroll",
      "select",
      "check",
      "uncheck",
      "upload",
      "drag",
    ],
    features: {
      autoWait: true,
      tracing: true,
      storageState: true,
      networkInterception: true,
      semanticSelectors: false,
      multiPage: true,
    },
    limits: {
      maxPages: 100,
      maxTimeout: 300000,
      maxScreenshotSize: 50 * 1024 * 1024,
    },
  };

  return {
    protocolVersion: BAP_VERSION,
    serverInfo: {
      name: "bap-playwright",
      version: "0.6.0",
    },
    capabilities,
    sessionId,
  };
}

export async function handleShutdown(state: ClientState, ctx: HandlerContext): Promise<void> {
  await ctx.cleanupClient(state);
}
