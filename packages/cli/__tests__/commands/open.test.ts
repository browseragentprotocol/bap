import { beforeEach, describe, expect, it, vi } from "vitest";

const printPageSummary = vi.fn();
const printObserveResult = vi.fn();
const register = vi.fn();
const resolveProfile = vi.fn(() => undefined);

vi.mock("../../src/output/formatter.js", () => ({
  printPageSummary,
  printObserveResult,
}));

vi.mock("../../src/commands/registry.js", () => ({
  register,
}));

vi.mock("../../src/server/manager.js", () => ({
  BROWSER_MAP: {
    chrome: "chromium",
    chromium: "chromium",
    firefox: "firefox",
    webkit: "webkit",
    edge: "chromium",
  },
  CHANNEL_MAP: {
    chrome: "chrome",
    edge: "msedge",
  },
  resolveProfile,
}));

const { openCommand } = await import("../../src/commands/open.js");

describe("openCommand", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resolveProfile.mockReturnValue(undefined);
  });

  it("reuses the active page instead of relaunching when a session already has pages", async () => {
    const client = {
      listPages: vi.fn().mockResolvedValue({
        pages: [{ id: "page-1", url: "https://old.example", title: "Old" }],
        activePage: "page-1",
      }),
      activatePage: vi.fn().mockResolvedValue(undefined),
      navigate: vi.fn().mockResolvedValue({ url: "https://dupr.com" }),
      launch: vi.fn(),
      createPage: vi.fn(),
    };

    await openCommand(
      ["https://dupr.com"],
      {
        browser: "chrome",
        headless: false,
        profile: "auto",
        timeout: 45000,
        observe: false,
      } as never,
      client as never,
    );

    expect(client.activatePage).toHaveBeenCalledWith("page-1");
    expect(client.navigate).toHaveBeenCalledWith("https://dupr.com", {
      timeout: 45000,
    });
    expect(client.launch).not.toHaveBeenCalled();
    expect(client.createPage).not.toHaveBeenCalled();
  });

  it("supports fused observation when opening a fresh page", async () => {
    const observation = {
      metadata: {
        url: "https://dupr.com",
        title: "DUPR",
      },
      interactiveElements: [],
    };
    const client = {
      listPages: vi.fn().mockResolvedValue({
        pages: [],
        activePage: "",
      }),
      activatePage: vi.fn(),
      navigate: vi.fn().mockResolvedValue({
        url: "https://dupr.com",
        observation,
      }),
      launch: vi.fn().mockResolvedValue(undefined),
      createPage: vi.fn().mockResolvedValue(undefined),
    };

    await openCommand(
      ["https://dupr.com"],
      {
        browser: "chrome",
        headless: false,
        profile: "auto",
        timeout: 60000,
        observe: true,
        max: 12,
        tier: "interactive",
      } as never,
      client as never,
    );

    expect(client.launch).toHaveBeenCalledWith({
      browser: "chromium",
      channel: "chrome",
      headless: false,
    });
    expect(client.createPage).toHaveBeenCalledOnce();
    expect(client.navigate).toHaveBeenCalledWith("https://dupr.com", {
      timeout: 60000,
      observe: {
        includeMetadata: true,
        includeInteractiveElements: true,
        maxElements: 12,
        responseTier: "interactive",
      },
    });
    expect(printObserveResult).toHaveBeenCalledWith(observation);
    expect(printPageSummary).not.toHaveBeenCalled();
  });

  it("shows the current page instead of opening a duplicate blank page", async () => {
    const client = {
      listPages: vi.fn().mockResolvedValue({
        pages: [{ id: "page-1", url: "https://example.com", title: "Example" }],
        activePage: "",
      }),
      activatePage: vi.fn().mockResolvedValue(undefined),
      navigate: vi.fn(),
      launch: vi.fn(),
      createPage: vi.fn(),
    };

    await openCommand(
      [],
      {
        browser: "chrome",
        headless: false,
        profile: "auto",
        timeout: 30000,
      } as never,
      client as never,
    );

    expect(client.activatePage).toHaveBeenCalledWith("page-1");
    expect(client.navigate).not.toHaveBeenCalled();
    expect(client.launch).not.toHaveBeenCalled();
    expect(client.createPage).not.toHaveBeenCalled();
    expect(printPageSummary).toHaveBeenCalledWith("https://example.com", "Example");
  });
});
