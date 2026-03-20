/**
 * @fileoverview Session timeout management
 * @module @browseragentprotocol/server-playwright/session/timeouts
 */

import type { WebSocket } from "ws";
import type { ResolvedOptions } from "../config.js";
import type { ClientState } from "../types.js";

export interface TimeoutDeps {
  logSecurity: (event: string, details: Record<string, unknown>) => void;
}

/**
 * Set up session timeouts for a client connection.
 */
export function setupSessionTimeouts(
  ws: WebSocket,
  state: ClientState,
  options: ResolvedOptions,
  deps: TimeoutDeps
): void {
  const { maxDuration, idleTimeout } = options.session;

  state.sessionTimeoutHandle = setTimeout(() => {
    deps.logSecurity("SESSION_EXPIRED", {
      reason: "max_duration",
      duration: maxDuration,
    });
    ws.close(1008, "Session expired: maximum duration exceeded");
  }, maxDuration * 1000);

  state.idleTimeoutHandle = setTimeout(() => {
    deps.logSecurity("SESSION_EXPIRED", {
      reason: "idle_timeout",
      timeout: idleTimeout,
    });
    ws.close(1008, "Session expired: idle timeout");
  }, idleTimeout * 1000);
}

/**
 * Reset idle timeout on activity.
 */
export function resetIdleTimeout(
  ws: WebSocket,
  state: ClientState,
  options: ResolvedOptions,
  deps: TimeoutDeps
): void {
  state.lastActivityTime = Date.now();

  if (state.idleTimeoutHandle) {
    clearTimeout(state.idleTimeoutHandle);
  }

  state.idleTimeoutHandle = setTimeout(() => {
    deps.logSecurity("SESSION_EXPIRED", {
      reason: "idle_timeout",
      timeout: options.session.idleTimeout,
    });
    ws.close(1008, "Session expired: idle timeout");
  }, options.session.idleTimeout * 1000);
}

/**
 * Clear all session timeouts.
 */
export function clearSessionTimeouts(state: ClientState): void {
  if (state.sessionTimeoutHandle) {
    clearTimeout(state.sessionTimeoutHandle);
    state.sessionTimeoutHandle = undefined;
  }
  if (state.idleTimeoutHandle) {
    clearTimeout(state.idleTimeoutHandle);
    state.idleTimeoutHandle = undefined;
  }
}
