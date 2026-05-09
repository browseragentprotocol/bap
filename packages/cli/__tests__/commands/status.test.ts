import { beforeEach, describe, expect, it, vi } from "vitest";

const register = vi.fn();
const printStatusSummary = vi.fn();
const connectIfServerRunning = vi.fn();
const listKnownSessions = vi.fn();
const resolveProfile = vi.fn();

vi.mock("../../src/commands/registry.js", () => ({
  register,
}));

vi.mock("../../src/output/formatter.js", () => ({
  printStatusSummary,
}));

vi.mock("../../src/session-state.js", () => ({
  getCliSessionId: vi.fn((flags: { session?: string; port: number }) => flags.session ?? `cli-${flags.port}`),
  listKnownSessions,
}));

vi.mock("../../src/server/manager.js", () => ({
  connectIfServerRunning,
  resolveProfile,
}));

const { statusCommand } = await import("../../src/commands/status.js");

describe("statusCommand", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    listKnownSessions.mockReturnValue([]);
  });

  it("reports a stopped server without auto-starting anything", async () => {
    connectIfServerRunning.mockResolvedValue(null);

    await statusCommand([], { port: 9222, host: "localhost", timeout: 30000 } as never, {} as never);

    expect(printStatusSummary).toHaveBeenCalledWith({
      server: "stopped",
      sessionId: "cli-9222",
      lifecycle: "stopped",
    });
  });

  it("reports the current live session state from session/list", async () => {
    const close = vi.fn().mockResolvedValue(undefined);
    connectIfServerRunning.mockResolvedValue({
      listSessions: vi.fn().mockResolvedValue({
        sessions: [
          {
            sessionId: "cli-9222",
            state: "active",
            pageCount: 2,
            browser: "chromium",
            channel: "chrome",
            headless: false,
            activePageUrl: "https://example.com/dashboard",
            activePageTitle: "Dashboard",
            handoffPending: false,
            trust: {
              approvalMode: "standard",
              allowedDomains: ["example.com"],
              redaction: {
                content: true,
                passwordValues: true,
                screenshots: false,
                storageState: false,
              },
            },
          },
        ],
      }),
      close,
    });

    await statusCommand([], { port: 9222, host: "localhost", timeout: 30000 } as never, {} as never);

    expect(printStatusSummary).toHaveBeenCalledWith({
      server: "running",
      sessionId: "cli-9222",
      lifecycle: "active",
      browser: "chromium",
      channel: "chrome",
      headless: false,
      pageCount: 2,
      activePageUrl: "https://example.com/dashboard",
      activePageTitle: "Dashboard",
      handoffPending: false,
      trust: {
        approvalMode: "standard",
        allowedDomains: ["example.com"],
        redaction: {
          content: true,
          passwordValues: true,
          screenshots: false,
          storageState: false,
        },
      },
    });
    expect(close).toHaveBeenCalledOnce();
  });
});
