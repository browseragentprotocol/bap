import { EventEmitter } from "node:events";
import type { Browser } from "playwright";
import type { WebSocket } from "ws";
import { describe, it, expect, vi } from "vitest";
import type { BAPScope } from "@browseragentprotocol/protocol";
import { BAPPlaywrightServer } from "../server.js";
import type { BAPServerOptions } from "../config.js";
import { setupPageListeners } from "../events/forwarder.js";
import { parkSession, restoreSession } from "../session/dormant-store.js";
import type { ClientState, DormantSession } from "../types.js";

type TestPage = EventEmitter & {
  url(): string;
};

type TestSocket = {
  readyState: number;
  send: ReturnType<typeof vi.fn>;
  close: ReturnType<typeof vi.fn>;
};

type TestState = {
  clientId: string;
  initialized: boolean;
  browser: Browser | null;
  isPersistent: boolean;
  context: null;
  contexts: Map<string, unknown>;
  defaultContextId: string | null;
  pages: Map<string, TestPage>;
  pageToContext: Map<string, string>;
  activePage: string | null;
  eventSubscriptions: Set<string>;
  tracing: boolean;
  scopes: BAPScope[];
  sessionStartTime: number;
  lastActivityTime: number;
  elementRegistries: Map<string, unknown>;
  frameContexts: Map<string, unknown>;
  activeStreams: Map<string, unknown>;
  pendingApprovals: Map<string, unknown>;
  sessionApprovals: Set<string>;
  sessionId: string;
  speculativePrefetchTimer?: NodeJS.Timeout;
  speculativeObservation?: unknown;
};

/**
 * Tests for server-side session persistence (dormant session store).
 */
describe("BAPPlaywrightServer - session persistence", () => {
  it("accepts dormantSessionTtl in session options", () => {
    const server = new BAPPlaywrightServer({
      session: {
        dormantSessionTtl: 120,
      },
    });
    expect(server).toBeInstanceOf(BAPPlaywrightServer);
  });

  it("creates server with default dormantSessionTtl", () => {
    const server = new BAPPlaywrightServer();
    expect(server).toBeInstanceOf(BAPPlaywrightServer);
  });

  it("accepts dormantSessionTtl alongside other session options", () => {
    const options: BAPServerOptions = {
      session: {
        maxDuration: 7200,
        idleTimeout: 300,
        dormantSessionTtl: 60,
      },
    };
    const server = new BAPPlaywrightServer(options);
    expect(server).toBeInstanceOf(BAPPlaywrightServer);
  });

  it("accepts all options including dormantSessionTtl", () => {
    const options: BAPServerOptions = {
      port: 9999,
      host: "0.0.0.0",
      session: {
        maxDuration: 3600,
        idleTimeout: 600,
        dormantSessionTtl: 300,
      },
      limits: {
        maxPagesPerClient: 5,
      },
    };
    const server = new BAPPlaywrightServer(options);
    expect(server).toBeInstanceOf(BAPPlaywrightServer);
  });

  it("routes restored page events to the reconnected client", async () => {
    const clients = new Map<WebSocket, TestState>();
    const dormantSessions = new Map<string, DormantSession>();
    const page = Object.assign(new EventEmitter(), {
      url: () => "https://example.com",
    }) as TestPage;
    const browser = {
      isConnected: () => true,
      close: vi.fn(),
    } as unknown as Browser;
    const staleSocket: TestSocket = {
      readyState: 1,
      send: vi.fn(),
      close: vi.fn(),
    };
    const restoredSocket: TestSocket = {
      readyState: 1,
      send: vi.fn(),
      close: vi.fn(),
    };
    const staleWs = staleSocket as unknown as WebSocket;
    const restoredWs = restoredSocket as unknown as WebSocket;

    const staleState: TestState = {
      clientId: "stale",
      initialized: true,
      browser,
      isPersistent: false,
      context: null,
      contexts: new Map(),
      defaultContextId: null,
      pages: new Map([["page-1", page]]),
      pageToContext: new Map([["page-1", "ctx-1"]]),
      activePage: "page-1",
      eventSubscriptions: new Set(["page"]),
      tracing: false,
      scopes: [],
      sessionStartTime: Date.now(),
      lastActivityTime: Date.now(),
      elementRegistries: new Map(),
      frameContexts: new Map(),
      activeStreams: new Map(),
      pendingApprovals: new Map(),
      sessionApprovals: new Set(),
      sessionId: "cli-9222",
    };

    const restoredState: TestState = {
      ...staleState,
      clientId: "restored",
      browser: null,
      pages: new Map(),
      pageToContext: new Map(),
      activePage: null,
      elementRegistries: new Map(),
      frameContexts: new Map(),
      activeStreams: new Map(),
      pendingApprovals: new Map(),
      sessionApprovals: new Set(),
    };

    clients.set(staleWs, staleState);

    // Set up page listeners using the extracted module
    const eventDeps = {
      findConnectedClientForPage: (pageId: string) => {
        for (const [ws, state] of clients) {
          if (state.pages.has(pageId)) return { ws, state: state as unknown as ClientState };
        }
        return null;
      },
      findPageOwner: (pageId: string) => {
        for (const [ws, state] of clients) {
          if (state.pages.has(pageId)) return { ws, state: state as unknown as ClientState };
        }
        for (const dormant of dormantSessions.values()) {
          if (dormant.pages.has(pageId)) return { ws: null, state: dormant };
        }
        return null;
      },
      removePageFromOwner: (state: ClientState | DormantSession, pageId: string) => {
        state.pages.delete(pageId);
        state.pageToContext.delete(pageId);
        state.elementRegistries.delete(pageId);
        state.frameContexts.delete(pageId);
        if (state.activePage === pageId) {
          state.activePage = state.pages.keys().next().value ?? null;
        }
      },
      log: vi.fn(),
    };

    setupPageListeners(page as unknown as import("playwright").Page, "page-1", eventDeps);

    // Park session using extracted module
    const dormantDeps = {
      dormantSessions,
      options: {
        session: { dormantSessionTtl: 300 },
      } as unknown as import("../config.js").ResolvedOptions,
      log: vi.fn(),
      isContextAlive: () => false,
      clearConnectionScopedState: (_state: ClientState, _msg: string) => {},
    };
    await parkSession(staleState as unknown as ClientState, dormantDeps);
    clients.delete(staleWs);

    const dormant = dormantSessions.get("cli-9222");
    expect(dormant).toBeDefined();
    if (!dormant) throw new Error("Expected dormant session to be present");
    expect(restoreSession(dormant, restoredState as unknown as ClientState, dormantDeps)).toBe(
      true
    );
    clients.set(restoredWs, restoredState);

    page.emit("load");

    expect(restoredSocket.send).toHaveBeenCalledOnce();
    expect(staleSocket.send).not.toHaveBeenCalled();
  });

  it("removes restored pages from the active session when a tab closes externally", async () => {
    const clients = new Map<WebSocket, TestState>();
    const dormantSessions = new Map<string, DormantSession>();
    const page = Object.assign(new EventEmitter(), {
      url: () => "https://example.com",
    }) as TestPage;
    const browser = {
      isConnected: () => true,
      close: vi.fn(),
    } as unknown as Browser;
    const staleSocket: TestSocket = {
      readyState: 1,
      send: vi.fn(),
      close: vi.fn(),
    };
    const restoredSocket: TestSocket = {
      readyState: 1,
      send: vi.fn(),
      close: vi.fn(),
    };
    const staleWs = staleSocket as unknown as WebSocket;
    const restoredWs = restoredSocket as unknown as WebSocket;

    const staleState: TestState = {
      clientId: "stale",
      initialized: true,
      browser,
      isPersistent: false,
      context: null,
      contexts: new Map(),
      defaultContextId: null,
      pages: new Map([["page-1", page]]),
      pageToContext: new Map([["page-1", "ctx-1"]]),
      activePage: "page-1",
      eventSubscriptions: new Set(["page"]),
      tracing: false,
      scopes: [],
      sessionStartTime: Date.now(),
      lastActivityTime: Date.now(),
      elementRegistries: new Map([["page-1", {}]]),
      frameContexts: new Map([["page-1", {}]]),
      activeStreams: new Map(),
      pendingApprovals: new Map(),
      sessionApprovals: new Set(),
      sessionId: "cli-9222",
    };

    const restoredState: TestState = {
      ...staleState,
      clientId: "restored",
      browser: null,
      pages: new Map(),
      pageToContext: new Map(),
      activePage: null,
      elementRegistries: new Map(),
      frameContexts: new Map(),
      activeStreams: new Map(),
      pendingApprovals: new Map(),
      sessionApprovals: new Set(),
    };

    clients.set(staleWs, staleState);

    const eventDeps = {
      findConnectedClientForPage: (pageId: string) => {
        for (const [ws, state] of clients) {
          if (state.pages.has(pageId)) return { ws, state: state as unknown as ClientState };
        }
        return null;
      },
      findPageOwner: (pageId: string) => {
        for (const [ws, state] of clients) {
          if (state.pages.has(pageId)) return { ws, state: state as unknown as ClientState };
        }
        for (const dormant of dormantSessions.values()) {
          if (dormant.pages.has(pageId)) return { ws: null, state: dormant };
        }
        return null;
      },
      removePageFromOwner: (state: ClientState | DormantSession, pageId: string) => {
        state.pages.delete(pageId);
        state.pageToContext.delete(pageId);
        state.elementRegistries.delete(pageId);
        state.frameContexts.delete(pageId);
        if (state.activePage === pageId) {
          state.activePage = state.pages.keys().next().value ?? null;
        }
      },
      log: vi.fn(),
    };

    setupPageListeners(page as unknown as import("playwright").Page, "page-1", eventDeps);

    const dormantDeps = {
      dormantSessions,
      options: {
        session: { dormantSessionTtl: 300 },
      } as unknown as import("../config.js").ResolvedOptions,
      log: vi.fn(),
      isContextAlive: () => false,
      clearConnectionScopedState: (_state: ClientState, _msg: string) => {},
    };
    await parkSession(staleState as unknown as ClientState, dormantDeps);
    clients.delete(staleWs);

    const dormant = dormantSessions.get("cli-9222");
    expect(dormant).toBeDefined();
    if (!dormant) throw new Error("Expected dormant session to be present");
    expect(restoreSession(dormant, restoredState as unknown as ClientState, dormantDeps)).toBe(
      true
    );
    clients.set(restoredWs, restoredState);

    page.emit("close");

    expect(restoredState.pages.has("page-1")).toBe(false);
    expect(restoredState.pageToContext.has("page-1")).toBe(false);
    expect(restoredState.elementRegistries.has("page-1")).toBe(false);
    expect(restoredState.frameContexts.has("page-1")).toBe(false);
    expect(restoredState.activePage).toBeNull();
    expect(restoredSocket.send).toHaveBeenCalledOnce();
  });
});
