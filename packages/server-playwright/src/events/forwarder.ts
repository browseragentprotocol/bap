/**
 * @fileoverview Page event listener setup and event forwarding
 * @module @browseragentprotocol/server-playwright/events/forwarder
 */

import { WebSocket } from "ws";
import type {
  Page as PlaywrightPage,
  ConsoleMessage,
  Dialog,
  Download,
  Request,
  Response,
} from "playwright";
import { createNotification } from "@browseragentprotocol/protocol";
import type { ClientState, DormantSession, PageOwner } from "../types.js";

export interface EventForwarderDeps {
  findConnectedClientForPage: (pageId: string) => { ws: WebSocket; state: ClientState } | null;
  findPageOwner: (pageId: string) => PageOwner | null;
  removePageFromOwner: (state: ClientState | DormantSession, pageId: string) => void;
  log: (message: string, context?: Record<string, unknown>) => void;
}

/**
 * Send an event notification to a specific WebSocket client.
 */
export function sendEvent(ws: WebSocket, method: string, params: Record<string, unknown>): void {
  if (ws.readyState !== WebSocket.OPEN) {
    return;
  }
  const notification = createNotification(method, params);
  ws.send(JSON.stringify(notification));
}

/**
 * Emit an event to the active owner of a page if it is subscribed.
 */
function emitOwnedEvent(
  pageId: string,
  subscription: string,
  method: string,
  params: Record<string, unknown>,
  deps: EventForwarderDeps
): void {
  const owner = deps.findConnectedClientForPage(pageId);
  if (!owner || !owner.state.eventSubscriptions.has(subscription)) {
    return;
  }
  sendEvent(owner.ws, method, params);
}

/**
 * Set up event listeners for a page.
 */
export function setupPageListeners(
  page: PlaywrightPage,
  pageId: string,
  deps: EventForwarderDeps
): void {
  // Page events
  page.on("load", () => {
    emitOwnedEvent(
      pageId,
      "page",
      "events/page",
      {
        type: "load",
        pageId,
        url: page.url(),
        timestamp: Date.now(),
      },
      deps
    );
  });

  page.on("domcontentloaded", () => {
    emitOwnedEvent(
      pageId,
      "page",
      "events/page",
      {
        type: "domcontentloaded",
        pageId,
        url: page.url(),
        timestamp: Date.now(),
      },
      deps
    );
  });

  // Console events
  page.on("console", (msg: ConsoleMessage) => {
    emitOwnedEvent(
      pageId,
      "console",
      "events/console",
      {
        pageId,
        level: msg.type() as "log" | "debug" | "info" | "warn" | "error",
        text: msg.text(),
        url: msg.location().url,
        line: msg.location().lineNumber,
        column: msg.location().columnNumber,
        timestamp: Date.now(),
      },
      deps
    );
  });

  // Network events
  page.on("request", (request: Request) => {
    emitOwnedEvent(
      pageId,
      "network",
      "events/network",
      {
        type: "request",
        requestId: request.url() + "-" + Date.now(),
        pageId,
        url: request.url(),
        method: request.method(),
        resourceType: request.resourceType(),
        headers: request.headers(),
        postData: request.postData(),
        timestamp: Date.now(),
      },
      deps
    );
  });

  page.on("response", (response: Response) => {
    emitOwnedEvent(
      pageId,
      "network",
      "events/network",
      {
        type: "response",
        requestId: response.url() + "-" + Date.now(),
        pageId,
        url: response.url(),
        status: response.status(),
        headers: response.headers(),
        timestamp: Date.now(),
      },
      deps
    );
  });

  // Dialog events
  page.on("dialog", (dialog: Dialog) => {
    emitOwnedEvent(
      pageId,
      "dialog",
      "events/dialog",
      {
        pageId,
        type: dialog.type() as "alert" | "confirm" | "prompt" | "beforeunload",
        message: dialog.message(),
        defaultValue: dialog.defaultValue(),
        timestamp: Date.now(),
      },
      deps
    );
  });

  // Download events
  page.on("download", (download: Download) => {
    emitOwnedEvent(
      pageId,
      "download",
      "events/download",
      {
        pageId,
        url: download.url(),
        suggestedFilename: download.suggestedFilename(),
        state: "started",
        timestamp: Date.now(),
      },
      deps
    );
  });

  // Handle external page close
  page.on("close", () => {
    const activeOwner = deps.findConnectedClientForPage(pageId);
    const owner = activeOwner ?? deps.findPageOwner(pageId);

    if (owner) {
      deps.removePageFromOwner(owner.state, pageId);
    }

    if (activeOwner?.state.eventSubscriptions.has("page")) {
      sendEvent(activeOwner.ws, "events/page", {
        type: "close",
        pageId,
        timestamp: Date.now(),
      });
    }

    deps.log(`Page ${pageId} closed externally`);
  });
}
