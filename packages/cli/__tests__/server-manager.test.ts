import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const mockExistsSync = vi.fn(() => false);
const mockReadFileSync = vi.fn(() => "{}");
const mockWriteFileSync = vi.fn(() => {});
const mockMkdirSync = vi.fn(() => {});
const mockUnlinkSync = vi.fn(() => {});

// Mock child_process, fs, os, net to avoid real server spawning
vi.mock("node:child_process", () => ({
  spawn: vi.fn(() => ({
    pid: 12345,
    unref: vi.fn(),
    stdout: null,
    stderr: null,
  })),
}));

vi.mock("node:fs", () => ({
  default: {
    existsSync: mockExistsSync,
    readFileSync: mockReadFileSync,
    writeFileSync: mockWriteFileSync,
    mkdirSync: mockMkdirSync,
    unlinkSync: mockUnlinkSync,
  },
}));

vi.mock("node:os", () => ({
  default: {
    homedir: () => "/tmp/test-home",
  },
}));

vi.mock("node:net", () => ({
  default: {
    createConnection: () => {
      const handlers: Record<string, () => void> = {};
      const socket = {
        setTimeout: vi.fn(),
        destroy: vi.fn(),
        on: (event: string, handler: () => void) => {
          handlers[event] = handler;
          // Simulate port in use (server already running)
          if (event === "connect") {
            setTimeout(() => handler(), 0);
          }
          return socket;
        },
      };
      return socket;
    },
  },
}));

// Mock the client module
const mockClient = {
  listPages: vi.fn(),
  launch: vi.fn(),
  createPage: vi.fn(),
  activatePage: vi.fn(),
  close: vi.fn(),
};

const createClientMock = vi.fn(() => Promise.resolve(mockClient));

vi.mock("@browseragentprotocol/client", () => ({
  createClient: createClientMock,
}));

const { ServerManager } = await import("../src/server/manager.js");

describe("ServerManager.ensureReady", () => {
  let stderrWriteSpy: ReturnType<typeof vi.spyOn> | undefined;

  beforeEach(() => {
    vi.clearAllMocks();
    mockExistsSync.mockReturnValue(false);
    stderrWriteSpy = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
  });

  afterEach(() => {
    stderrWriteSpy?.mockRestore();
  });

  it("passes the configured timeout to the client connection", async () => {
    mockClient.listPages.mockResolvedValue({
      pages: [{ id: "page-abc", url: "https://example.com" }],
      activePage: "page-abc",
    });

    const manager = new ServerManager({
      port: 9222,
      browser: "chromium",
      headless: true,
      verbose: false,
      timeout: 120000,
    });

    await manager.ensureReady();

    expect(createClientMock).toHaveBeenCalledWith("ws://localhost:9222", {
      name: "bap-cli",
      sessionId: undefined,
      timeout: 120000,
    });
  });

  it("should auto-launch browser and create page when no pages exist", async () => {
    mockClient.listPages
      .mockResolvedValueOnce({ pages: [], activePage: "" })
      .mockResolvedValueOnce({ pages: [], activePage: "" });
    mockClient.launch.mockResolvedValue({ browserId: "b1", version: "1.0" });
    mockClient.createPage.mockResolvedValue({ id: "page-1", url: "about:blank" });

    const manager = new ServerManager({
      port: 9222,
      browser: "chromium",
      headless: true,
      verbose: false,
    });

    const client = await manager.ensureReady();

    expect(client).toBe(mockClient);
    expect(mockClient.listPages).toHaveBeenCalledTimes(2);
    expect(mockClient.launch).toHaveBeenCalledWith({
      browser: "chromium",
      channel: undefined,
      headless: true,
    });
    expect(mockClient.createPage).toHaveBeenCalledOnce();
    expect(mockClient.activatePage).not.toHaveBeenCalled();
  });

  it("reuses the startup page created during browser launch", async () => {
    mockClient.listPages
      .mockResolvedValueOnce({ pages: [], activePage: "" })
      .mockResolvedValueOnce({
        pages: [{ id: "page-startup", url: "about:blank" }],
        activePage: "page-startup",
      });
    mockClient.launch.mockResolvedValue({ browserId: "b1", version: "1.0" });

    const manager = new ServerManager({
      port: 9222,
      browser: "chromium",
      headless: true,
      verbose: false,
    });

    await manager.ensureReady();

    expect(mockClient.launch).toHaveBeenCalledOnce();
    expect(mockClient.activatePage).toHaveBeenCalledWith("page-startup");
    expect(mockClient.createPage).not.toHaveBeenCalled();
  });

  it("should reuse existing pages from session persistence", async () => {
    mockClient.listPages.mockResolvedValue({
      pages: [{ id: "page-abc", url: "https://example.com" }],
      activePage: "page-abc",
    });

    const manager = new ServerManager({
      port: 9222,
      browser: "chromium",
      headless: true,
      verbose: false,
    });

    const client = await manager.ensureReady();

    expect(client).toBe(mockClient);
    expect(mockClient.activatePage).toHaveBeenCalledWith("page-abc");
    expect(mockClient.launch).not.toHaveBeenCalled();
    expect(mockClient.createPage).not.toHaveBeenCalled();
  });

  it("should use first page when activePage is empty string", async () => {
    mockClient.listPages.mockResolvedValue({
      pages: [
        { id: "page-1", url: "https://one.com" },
        { id: "page-2", url: "https://two.com" },
      ],
      activePage: "",
    });

    const manager = new ServerManager({
      port: 9222,
      browser: "chromium",
      headless: true,
      verbose: false,
    });

    await manager.ensureReady();

    expect(mockClient.activatePage).toHaveBeenCalledWith("page-1");
  });

  it("should pass chrome channel when browser is chrome", async () => {
    mockClient.listPages.mockResolvedValue({ pages: [], activePage: "" });
    mockClient.launch.mockResolvedValue({ browserId: "b1", version: "1.0" });
    mockClient.createPage.mockResolvedValue({ id: "page-1", url: "about:blank" });

    const manager = new ServerManager({
      port: 9222,
      browser: "chrome",
      headless: true,
      verbose: false,
    });

    await manager.ensureReady();

    expect(mockClient.launch).toHaveBeenCalledWith({
      browser: "chromium",
      channel: "chrome",
      headless: true,
    });
  });

  it("should pass msedge channel when browser is edge", async () => {
    mockClient.listPages.mockResolvedValue({ pages: [], activePage: "" });
    mockClient.launch.mockResolvedValue({ browserId: "b1", version: "1.0" });
    mockClient.createPage.mockResolvedValue({ id: "page-1", url: "about:blank" });

    const manager = new ServerManager({
      port: 9222,
      browser: "edge",
      headless: false,
      verbose: false,
    });

    await manager.ensureReady();

    expect(mockClient.launch).toHaveBeenCalledWith({
      browser: "chromium",
      channel: "msedge",
      headless: false,
    });
  });

  it("should respect headless flag", async () => {
    mockClient.listPages.mockResolvedValue({ pages: [], activePage: "" });
    mockClient.launch.mockResolvedValue({ browserId: "b1", version: "1.0" });
    mockClient.createPage.mockResolvedValue({ id: "page-1", url: "about:blank" });

    const manager = new ServerManager({
      port: 9222,
      browser: "firefox",
      headless: false,
      verbose: false,
    });

    await manager.ensureReady();

    expect(mockClient.launch).toHaveBeenCalledWith({
      browser: "firefox",
      channel: undefined,
      headless: false,
    });
  });

  it("should not pass userDataDir when profile is none", async () => {
    mockClient.listPages.mockResolvedValue({ pages: [], activePage: "" });
    mockClient.launch.mockResolvedValue({ browserId: "b1", version: "1.0" });
    mockClient.createPage.mockResolvedValue({ id: "page-1", url: "about:blank" });

    const manager = new ServerManager({
      port: 9222,
      browser: "chrome",
      headless: true,
      verbose: false,
      profile: "none",
    });

    await manager.ensureReady();

    expect(mockClient.launch).toHaveBeenCalledWith({
      browser: "chromium",
      channel: "chrome",
      headless: true,
    });
  });

  it("should treat about:blank pages as empty and re-initialize", async () => {
    mockClient.listPages
      .mockResolvedValueOnce({
        pages: [{ id: "ghost-1", url: "about:blank" }],
        activePage: "ghost-1",
      })
      .mockResolvedValueOnce({
        pages: [{ id: "page-startup", url: "about:blank" }],
        activePage: "page-startup",
      });
    mockClient.launch.mockResolvedValue({ browserId: "b1", version: "1.0" });

    const manager = new ServerManager({
      port: 9222,
      browser: "chromium",
      headless: true,
      verbose: false,
    });

    await manager.ensureReady();

    // Should NOT reuse the ghost page from the stale session — should relaunch first
    expect(mockClient.launch).toHaveBeenCalledOnce();
    expect(mockClient.activatePage).toHaveBeenCalledWith("page-startup");
    expect(mockClient.createPage).not.toHaveBeenCalled();
  });

  it("should reuse real pages even when mixed with about:blank pages", async () => {
    mockClient.listPages.mockResolvedValue({
      pages: [
        { id: "ghost-1", url: "about:blank" },
        { id: "real-1", url: "https://example.com" },
      ],
      activePage: "",
    });

    const manager = new ServerManager({
      port: 9222,
      browser: "chromium",
      headless: true,
      verbose: false,
    });

    await manager.ensureReady();

    // Should activate the real page, not the ghost
    expect(mockClient.activatePage).toHaveBeenCalledWith("real-1");
    expect(mockClient.launch).not.toHaveBeenCalled();
  });

  it("should not pass userDataDir for firefox even with profile auto", async () => {
    mockClient.listPages.mockResolvedValue({ pages: [], activePage: "" });
    mockClient.launch.mockResolvedValue({ browserId: "b1", version: "1.0" });
    mockClient.createPage.mockResolvedValue({ id: "page-1", url: "about:blank" });

    const manager = new ServerManager({
      port: 9222,
      browser: "firefox",
      headless: true,
      verbose: false,
      profile: "auto",
    });

    await manager.ensureReady();

    expect(mockClient.launch).toHaveBeenCalledWith({
      browser: "firefox",
      channel: undefined,
      headless: true,
    });
  });

  it("retries without the auto-detected profile when Chrome reports a profile lock", async () => {
    mockExistsSync.mockImplementation((candidate: string) =>
      candidate === "/tmp/test-home/Library/Application Support/Google/Chrome"
    );
    mockClient.listPages.mockResolvedValue({ pages: [], activePage: "" });
    mockClient.launch
      .mockRejectedValueOnce(new Error("Chrome is already using that profile."))
      .mockResolvedValueOnce({ browserId: "b1", version: "1.0" });
    mockClient.createPage.mockResolvedValue({ id: "page-1", url: "about:blank" });

    const manager = new ServerManager({
      port: 9222,
      browser: "chrome",
      headless: true,
      verbose: false,
      profile: "auto",
    });

    await manager.ensureReady();

    expect(mockClient.launch).toHaveBeenNthCalledWith(1, {
      browser: "chromium",
      channel: "chrome",
      headless: true,
      userDataDir: "/tmp/test-home/Library/Application Support/Google/Chrome",
    });
    expect(mockClient.launch).toHaveBeenNthCalledWith(2, {
      browser: "chromium",
      channel: "chrome",
      headless: true,
    });
  });

  it("falls back from missing Chrome to Playwright Chromium", async () => {
    mockClient.listPages.mockResolvedValue({ pages: [], activePage: "" });
    mockClient.launch
      .mockRejectedValueOnce(new Error("Chromium distribution 'chrome' is not found"))
      .mockResolvedValueOnce({ browserId: "b1", version: "1.0" });
    mockClient.createPage.mockResolvedValue({ id: "page-1", url: "about:blank" });

    const manager = new ServerManager({
      port: 9222,
      browser: "chrome",
      headless: true,
      verbose: false,
      profile: "none",
    });

    await manager.ensureReady();

    expect(mockClient.launch).toHaveBeenNthCalledWith(1, {
      browser: "chromium",
      channel: "chrome",
      headless: true,
    });
    expect(mockClient.launch).toHaveBeenNthCalledWith(2, {
      browser: "chromium",
      channel: undefined,
      headless: true,
    });
  });

  it("drops the auto-detected profile when falling back from missing Chrome", async () => {
    mockExistsSync.mockImplementation((candidate: string) =>
      candidate === "/tmp/test-home/Library/Application Support/Google/Chrome"
    );
    mockClient.listPages.mockResolvedValue({ pages: [], activePage: "" });
    mockClient.launch
      .mockRejectedValueOnce(new Error("Chromium distribution 'chrome' is not found"))
      .mockResolvedValueOnce({ browserId: "b1", version: "1.0" });
    mockClient.createPage.mockResolvedValue({ id: "page-1", url: "about:blank" });

    const manager = new ServerManager({
      port: 9222,
      browser: "chrome",
      headless: true,
      verbose: false,
      profile: "auto",
    });

    await manager.ensureReady();

    expect(mockClient.launch).toHaveBeenNthCalledWith(1, {
      browser: "chromium",
      channel: "chrome",
      headless: true,
      userDataDir: "/tmp/test-home/Library/Application Support/Google/Chrome",
    });
    expect(mockClient.launch).toHaveBeenNthCalledWith(2, {
      browser: "chromium",
      channel: undefined,
      headless: true,
      userDataDir: undefined,
    });
  });

  it("prefers a real restored page over an about:blank active ghost tab", async () => {
    mockClient.listPages.mockResolvedValue({
      pages: [
        { id: "ghost", url: "about:blank", title: "", viewport: { width: 100, height: 100 } },
        { id: "real", url: "https://example.com", title: "Example", viewport: { width: 100, height: 100 } },
      ],
      activePage: "ghost",
    });

    const manager = new ServerManager({
      port: 9222,
      browser: "chrome",
      headless: true,
      verbose: false,
    });

    await manager.ensureReady();

    expect(mockClient.activatePage).toHaveBeenCalledWith("real");
    expect(mockClient.launch).not.toHaveBeenCalled();
  });
});
