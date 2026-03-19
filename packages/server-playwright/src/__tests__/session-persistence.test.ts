import { EventEmitter } from "node:events";
import type { Browser } from "playwright";
import type { WebSocket } from "ws";
import { describe, it, expect, vi } from "vitest";
import type { BAPScope } from "@browseragentprotocol/protocol";
import { BAPPlaywrightServer } from "../server.js";
import type { BAPServerOptions } from "../server.js";

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
};

type TestDormantSession = {
  sessionId: string;
};

type SessionHarness = {
  clients: Map<WebSocket, TestState>;
  dormantSessions: Map<string, TestDormantSession>;
  setupPageListeners(page: TestPage, pageId: string): void;
  parkSession(state: TestState): void;
  restoreSession(dormant: TestDormantSession, state: TestState): boolean;
};

/**
 * Tests for server-side session persistence (dormant session store).
 *
 * These are structural/unit tests that verify the server's configuration
 * and type-level support for session persistence. Full integration tests
 * (with real WebSocket connections and browsers) require a running
 * Playwright instance and are out of scope here.
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

  it("routes restored page events to the reconnected client", () => {
    const server = new BAPPlaywrightServer();
    const harness = server as unknown as SessionHarness;
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

    harness.clients.set(staleWs, staleState);
    harness.setupPageListeners(page, "page-1");
    harness.parkSession(staleState);
    harness.clients.delete(staleWs);

    const dormant = harness.dormantSessions.get("cli-9222");
    expect(dormant).toBeDefined();
    if (!dormant) {
      throw new Error("Expected dormant session to be present");
    }
    expect(harness.restoreSession(dormant, restoredState)).toBe(true);
    harness.clients.set(restoredWs, restoredState);

    page.emit("load");

    expect(restoredSocket.send).toHaveBeenCalledOnce();
    expect(staleSocket.send).not.toHaveBeenCalled();
  });

  it("removes restored pages from the active session when a tab closes externally", () => {
    const server = new BAPPlaywrightServer();
    const harness = server as unknown as SessionHarness;
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

    harness.clients.set(staleWs, staleState);
    harness.setupPageListeners(page, "page-1");
    harness.parkSession(staleState);
    harness.clients.delete(staleWs);

    const dormant = harness.dormantSessions.get("cli-9222");
    expect(dormant).toBeDefined();
    if (!dormant) {
      throw new Error("Expected dormant session to be present");
    }
    expect(harness.restoreSession(dormant, restoredState)).toBe(true);
    harness.clients.set(restoredWs, restoredState);

    page.emit("close");

    expect(restoredState.pages.has("page-1")).toBe(false);
    expect(restoredState.pageToContext.has("page-1")).toBe(false);
    expect(restoredState.elementRegistries.has("page-1")).toBe(false);
    expect(restoredState.frameContexts.has("page-1")).toBe(false);
    expect(restoredState.activePage).toBeNull();
    expect(restoredSocket.send).toHaveBeenCalledOnce();
  });
});
