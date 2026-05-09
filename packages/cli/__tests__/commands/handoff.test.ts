import { beforeEach, describe, expect, it, vi } from "vitest";

const printPageSummary = vi.fn();
const printObserveDeltaResult = vi.fn();
const printHandoffSummary = vi.fn();
const register = vi.fn();
const launchBrowserWithFallback = vi.fn().mockResolvedValue(undefined);
const resolveProfile = vi.fn(() => "/tmp/legacy-profile");
const files = new Map<string, string>();

vi.mock("node:fs", () => ({
  default: {
    mkdirSync: vi.fn(),
    writeFileSync: vi.fn((filePath: string, content: string) => {
      files.set(filePath, content);
    }),
    readFileSync: vi.fn((filePath: string) => {
      const content = files.get(filePath);
      if (content === undefined) {
        throw new Error("ENOENT");
      }
      return content;
    }),
    unlinkSync: vi.fn((filePath: string) => {
      if (!files.has(filePath)) {
        throw new Error("ENOENT");
      }
      files.delete(filePath);
    }),
  },
}));

vi.mock("node:os", () => ({
  default: {
    homedir: vi.fn(() => "/tmp/test-home"),
  },
}));

vi.mock("../../src/output/formatter.js", () => ({
  printPageSummary,
  printObserveDeltaResult,
  printHandoffSummary,
}));

vi.mock("../../src/commands/registry.js", () => ({
  register,
}));

vi.mock("../../src/server/manager.js", () => ({
  launchBrowserWithFallback,
  resolveProfile,
}));

const { handoffCommand, resumeCommand } = await import("../../src/commands/handoff.js");

function createMockClient(overrides: Record<string, unknown> = {}) {
  return {
    getBrowserState: vi.fn().mockResolvedValue({
      launched: true,
      browser: "chromium",
      channel: "chrome",
      headless: true,
      userDataDir: "/tmp/profile",
      isPersistent: true,
      handoffPending: false,
    }),
    listPages: vi.fn().mockResolvedValue({
      pages: [
        {
          id: "page-1",
          url: "https://example.com/checkout",
          title: "Checkout",
          viewport: { width: 1440, height: 900 },
        },
      ],
      activePage: "page-1",
    }),
    activatePage: vi.fn().mockResolvedValue(undefined),
    getStorageState: vi.fn().mockResolvedValue({
      cookies: [{ name: "session", value: "abc123" }],
      origins: [
        {
          origin: "https://example.com",
          localStorage: [{ name: "cart", value: "1" }],
          sessionStorage: [{ name: "flow", value: "step-2" }],
        },
      ],
    }),
    getSessionStorage: vi.fn().mockResolvedValue({
      origin: "https://example.com",
      items: [{ name: "flow", value: "step-2" }],
    }),
    setHandoffMode: vi.fn().mockResolvedValue(undefined),
    closeBrowser: vi.fn().mockResolvedValue(undefined),
    createPage: vi.fn().mockResolvedValue({ id: "page-2" }),
    setStorageState: vi.fn().mockResolvedValue(undefined),
    observe: vi.fn().mockResolvedValue({
      metadata: { url: "https://example.com/checkout", title: "Checkout" },
      interactiveElements: [{ ref: "e1", role: "button", name: "Submit" }],
    }),
    ...overrides,
  };
}

function defaultFlags(command: string, overrides: Record<string, unknown> = {}) {
  return {
    browser: "firefox",
    headless: false,
    profile: "none",
    port: 9222,
    timeout: 30000,
    command,
    args: [],
    host: "localhost",
    verbose: false,
    help: false,
    version: false,
    ...overrides,
  } as never;
}

describe("handoffCommand", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    files.clear();
    resolveProfile.mockReturnValue("/tmp/legacy-profile");
  });

  it("uses live browser state instead of current CLI flags when reopening headful", async () => {
    const client = createMockClient();
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    await handoffCommand([], defaultFlags("handoff"), client as never);

    expect(client.getBrowserState).toHaveBeenCalledOnce();
    expect(client.setHandoffMode).toHaveBeenCalledWith(true, { ttlSeconds: 86400 });
    expect(launchBrowserWithFallback).toHaveBeenCalledWith(client, {
      browser: "chrome",
      headless: false,
      userDataDir: "/tmp/profile",
    });
    expect(client.setStorageState).toHaveBeenCalledWith({
      cookies: [{ name: "session", value: "abc123" }],
      origins: [
        {
          origin: "https://example.com",
          localStorage: [{ name: "cart", value: "1" }],
        },
      ],
    });
    expect(client.createPage).toHaveBeenCalledWith({
      viewport: { width: 1440, height: 900 },
      url: "https://example.com/checkout",
      sessionStorage: {
        origin: "https://example.com",
        items: [{ name: "flow", value: "step-2" }],
      },
    });
    expect(printHandoffSummary).toHaveBeenCalledWith(
      expect.objectContaining({
        next: [expect.stringContaining("bap resume")],
      })
    );

    consoleSpy.mockRestore();
  });

  it("keeps already-visible sessions live and ignores stale headless flags", async () => {
    const client = createMockClient({
      getBrowserState: vi.fn().mockResolvedValue({
        launched: true,
        browser: "firefox",
        headless: false,
        isPersistent: false,
      }),
    });
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    await handoffCommand(["CAPTCHA"], defaultFlags("handoff", { headless: true }), client as never);

    expect(client.setHandoffMode).toHaveBeenCalledWith(true, { ttlSeconds: 86400 });
    expect(launchBrowserWithFallback).not.toHaveBeenCalled();
    expect(printHandoffSummary).toHaveBeenCalledWith(
      expect.objectContaining({
        reason: "CAPTCHA",
      })
    );

    consoleSpy.mockRestore();
  });

  it("prefers a real page over an about:blank ghost tab", async () => {
    const client = createMockClient({
      listPages: vi.fn().mockResolvedValue({
        pages: [
          {
            id: "ghost",
            url: "about:blank",
            title: "",
            viewport: { width: 1200, height: 800 },
          },
          {
            id: "real",
            url: "https://example.com/checkout",
            title: "Checkout",
            viewport: { width: 1440, height: 900 },
          },
        ],
        activePage: "ghost",
      }),
    });
    vi.spyOn(console, "log").mockImplementation(() => {});

    await handoffCommand([], defaultFlags("handoff"), client as never);

    expect(client.activatePage).toHaveBeenCalledWith("real");
  });

  it("throws when no pages exist to hand off", async () => {
    const client = createMockClient({
      listPages: vi.fn().mockResolvedValue({ pages: [], activePage: "" }),
    });

    await expect(handoffCommand([], defaultFlags("handoff"), client as never)).rejects.toThrow("No pages open");
  });
});

describe("resumeCommand", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    files.clear();
    resolveProfile.mockReturnValue("/tmp/legacy-profile");
  });

  it("relaunches with the saved launch config and clears handoff mode after observing", async () => {
    const observation = {
      metadata: { url: "https://example.com/done", title: "Done" },
      interactiveElements: [{ ref: "e1", role: "button", name: "Continue" }],
    };
    const client = createMockClient({
      observe: vi.fn().mockResolvedValue(observation),
    });

    await handoffCommand([], defaultFlags("handoff"), client as never);

    vi.spyOn(console, "log").mockImplementation(() => {});
    await resumeCommand([], defaultFlags("resume"), client as never);

    expect(launchBrowserWithFallback).toHaveBeenLastCalledWith(client, {
      browser: "chrome",
      headless: true,
      userDataDir: "/tmp/profile",
    });
    expect(client.createPage).toHaveBeenCalledWith({
      viewport: { width: 1440, height: 900 },
      url: "https://example.com/checkout",
      sessionStorage: {
        origin: "https://example.com",
        items: [{ name: "flow", value: "step-2" }],
      },
    });
    expect(client.observe).toHaveBeenCalledWith(expect.objectContaining({ incremental: true }));
    expect(client.setHandoffMode).toHaveBeenLastCalledWith(false);
    expect(printObserveDeltaResult).toHaveBeenCalledWith(observation);
  });

  it("can resume from a legacy v1 pending handoff file", async () => {
    files.set(
      "/tmp/test-home/.bap/handoff/cli-9222.json",
      JSON.stringify({
        version: 1,
        sessionId: "cli-9222",
        port: 9222,
        browser: "chrome",
        profile: "auto",
        resumeHeadless: true,
        createdAt: new Date().toISOString(),
      })
    );
    const client = createMockClient();
    vi.spyOn(console, "log").mockImplementation(() => {});

    await resumeCommand([], defaultFlags("resume"), client as never);

    expect(resolveProfile).toHaveBeenCalledWith("auto", "chrome");
    expect(launchBrowserWithFallback).toHaveBeenLastCalledWith(client, {
      browser: "chrome",
      headless: true,
      userDataDir: "/tmp/legacy-profile",
    });
  });

  it("throws when no pages exist to resume from", async () => {
    files.set(
      "/tmp/test-home/.bap/handoff/cli-9222-p9222.json",
      JSON.stringify({
        version: 2,
        sessionId: "cli-9222",
        port: 9222,
        launch: {
          browser: "chrome",
          headless: true,
          userDataDir: "/tmp/profile",
        },
        createdAt: new Date().toISOString(),
      })
    );
    const client = createMockClient({
      listPages: vi.fn().mockResolvedValue({ pages: [], activePage: "" }),
    });

    await expect(
      resumeCommand([], defaultFlags("resume"), client as never)
    ).rejects.toThrow("No pages open");
  });

  it("throws when no pending handoff exists", async () => {
    const client = createMockClient();

    await expect(
      resumeCommand([], defaultFlags("resume"), client as never)
    ).rejects.toThrow("No pending handoff found");
  });
});
