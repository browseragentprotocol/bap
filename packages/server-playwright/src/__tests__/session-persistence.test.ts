import { EventEmitter } from "node:events";
import type { Browser } from "playwright";
import type { WebSocket } from "ws";
import { describe, it, expect, vi } from "vitest";
import { BAPPlaywrightServer } from "../server.js";
import type { BAPServerOptions } from "../server.js";

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
    const page = Object.assign(new EventEmitter(), {
      url: () => "https://example.com",
    });
    const browser = {
      isConnected: () => true,
      close: vi.fn(),
    } as unknown as Browser;
    const staleWs = {
      readyState: 1,
      send: vi.fn(),
      close: vi.fn(),
    } as unknown as WebSocket;
    const restoredWs = {
      readyState: 1,
      send: vi.fn(),
      close: vi.fn(),
    } as unknown as WebSocket;

    const staleState = {
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

    const restoredState = {
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

    (server as any).clients.set(staleWs, staleState);
    (server as any).setupPageListeners(page, "page-1");
    (server as any).parkSession(staleState);
    (server as any).clients.delete(staleWs);

    const dormant = (server as any).dormantSessions.get("cli-9222");
    expect((server as any).restoreSession(dormant, restoredState)).toBe(true);
    (server as any).clients.set(restoredWs, restoredState);

    page.emit("load");

    expect((restoredWs as any).send).toHaveBeenCalledOnce();
    expect((staleWs as any).send).not.toHaveBeenCalled();
  });

  it("removes restored pages from the active session when a tab closes externally", () => {
    const server = new BAPPlaywrightServer();
    const page = Object.assign(new EventEmitter(), {
      url: () => "https://example.com",
    });
    const browser = {
      isConnected: () => true,
      close: vi.fn(),
    } as unknown as Browser;
    const staleWs = {
      readyState: 1,
      send: vi.fn(),
      close: vi.fn(),
    } as unknown as WebSocket;
    const restoredWs = {
      readyState: 1,
      send: vi.fn(),
      close: vi.fn(),
    } as unknown as WebSocket;

    const staleState = {
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
      elementRegistries: new Map([["page-1", {} as never]]),
      frameContexts: new Map([["page-1", {} as never]]),
      activeStreams: new Map(),
      pendingApprovals: new Map(),
      sessionApprovals: new Set(),
      sessionId: "cli-9222",
    };

    const restoredState = {
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

    (server as any).clients.set(staleWs, staleState);
    (server as any).setupPageListeners(page, "page-1");
    (server as any).parkSession(staleState);
    (server as any).clients.delete(staleWs);

    const dormant = (server as any).dormantSessions.get("cli-9222");
    expect((server as any).restoreSession(dormant, restoredState)).toBe(true);
    (server as any).clients.set(restoredWs, restoredState);

    page.emit("close");

    expect(restoredState.pages.has("page-1")).toBe(false);
    expect(restoredState.pageToContext.has("page-1")).toBe(false);
    expect(restoredState.elementRegistries.has("page-1")).toBe(false);
    expect(restoredState.frameContexts.has("page-1")).toBe(false);
    expect(restoredState.activePage).toBeNull();
    expect((restoredWs as any).send).toHaveBeenCalledOnce();
  });
});
