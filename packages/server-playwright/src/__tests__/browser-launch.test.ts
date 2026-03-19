import { describe, expect, it, vi } from "vitest";
import { BAPPlaywrightServer } from "../server.js";

type BrowserLaunchState = {
  browser: null;
  isPersistent: boolean;
  context: { close: ReturnType<typeof vi.fn> };
  contexts: Map<string, { context: { close: ReturnType<typeof vi.fn> }; created: number }>;
  defaultContextId: string;
  pages: Map<string, object>;
  pageToContext: Map<string, string>;
  activePage: string | null;
  elementRegistries: Map<string, object>;
  frameContexts: Map<string, object>;
  activeStreams: Map<string, object>;
  pendingApprovals: Map<string, object>;
  sessionApprovals: Set<string>;
};

describe("BAPPlaywrightServer - browser relaunch hygiene", () => {
  it("closes an existing persistent context before launching a new one", async () => {
    const server = new BAPPlaywrightServer();
    const previousContext = {
      close: vi.fn().mockResolvedValue(undefined),
    };
    const nextContext = {
      close: vi.fn().mockResolvedValue(undefined),
      on: vi.fn(),
    };
    const launchPersistentContext = vi.fn().mockResolvedValue(nextContext);

    const state: BrowserLaunchState = {
      browser: null,
      isPersistent: true,
      context: previousContext,
      contexts: new Map([["ctx-old", { context: previousContext, created: Date.now() }]]),
      defaultContextId: "ctx-old",
      pages: new Map([["page-1", {}]]),
      pageToContext: new Map([["page-1", "ctx-old"]]),
      activePage: "page-1",
      elementRegistries: new Map([["page-1", {}]]),
      frameContexts: new Map([["page-1", {}]]),
      activeStreams: new Map(),
      pendingApprovals: new Map(),
      sessionApprovals: new Set(),
    };
    const privateServer = server as unknown as {
      getBrowserType: (browserType: string) => {
        launchPersistentContext: typeof launchPersistentContext;
      };
      handleBrowserLaunch: (
        state: BrowserLaunchState,
        params: {
          browser: string;
          channel: string;
          headless: boolean;
          userDataDir: string;
        }
      ) => Promise<void>;
    };

    vi.spyOn(privateServer, "getBrowserType").mockReturnValue({
      launchPersistentContext,
    } as never);

    await privateServer.handleBrowserLaunch(state, {
      browser: "chromium",
      channel: "chrome",
      headless: false,
      userDataDir: "/tmp/bap-profile",
    });

    expect(previousContext.close).toHaveBeenCalledOnce();
    expect(launchPersistentContext).toHaveBeenCalledWith("/tmp/bap-profile", {
      headless: false,
      channel: "chrome",
      args: undefined,
      deviceScaleFactor: 1,
    });
    expect(state.context).toBe(nextContext);
    expect(state.pages.size).toBe(0);
    expect(state.activePage).toBeNull();
  });
});
