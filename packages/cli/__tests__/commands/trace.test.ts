import { beforeEach, describe, expect, it, vi } from "vitest";

const register = vi.fn();
const printTraceSessionList = vi.fn();
const printTraceSummary = vi.fn();
const files = new Map<string, string>();
const directories = new Set<string>();

vi.mock("node:os", () => ({
  default: {
    homedir: () => "/tmp/test-home",
  },
}));

vi.mock("node:fs", () => ({
  default: {
    existsSync: vi.fn((candidate: string) => directories.has(candidate) || files.has(candidate)),
    readdirSync: vi.fn((candidate: string) => {
      if (candidate === "/tmp/test-home/.bap/traces") {
        return ["cli-9222-1.jsonl"];
      }
      return [];
    }),
    readFileSync: vi.fn((candidate: string) => {
      const content = files.get(candidate);
      if (content === undefined) {
        throw new Error("ENOENT");
      }
      return content;
    }),
    writeFileSync: vi.fn((candidate: string, content: string) => {
      files.set(candidate, content);
    }),
    mkdirSync: vi.fn(),
    statSync: vi.fn(() => ({
      size: 512,
      mtime: new Date("2026-04-02T09:00:00Z"),
    })),
  },
}));

vi.mock("../../src/commands/registry.js", () => ({
  register,
}));

vi.mock("../../src/output/formatter.js", () => ({
  printTraceSessionList,
  printTraceSummary,
}));

const { traceCommand } = await import("../../src/commands/trace.js");

describe("traceCommand story mode", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    files.clear();
    directories.clear();
    directories.add("/tmp/test-home/.bap/traces");
    files.set(
      "/tmp/test-home/.bap/traces/cli-9222-1.jsonl",
      [
        JSON.stringify({
          ts: "2026-04-02T09:00:00.000Z",
          sessionId: "cli-9222",
          clientId: "client-1",
          method: "agent/act",
          duration: 120,
          status: "error",
          error: "Element not visible",
          recoveryHint: "Scroll the element into view or wait for it to appear, then retry",
          resultSummary: {
            completed: 1,
            total: 2,
            url: "https://example.com/checkout",
            added: 1,
            updated: 0,
            removed: 0,
          },
        }),
        JSON.stringify({
          ts: "2026-04-02T09:00:01.000Z",
          sessionId: "cli-9222",
          clientId: "client-1",
          method: "agent/observe",
          duration: 40,
          status: "ok",
          resultSummary: {
            url: "https://example.com/checkout",
            elementCount: 12,
            added: 1,
            updated: 2,
            removed: 0,
          },
        }),
      ].join("\n")
    );
  });

  it("defaults to task/story summaries instead of raw request output", async () => {
    const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    try {
      await traceCommand([], {} as never, {} as never);

      expect(printTraceSummary).not.toHaveBeenCalled();
      expect(consoleSpy).toHaveBeenCalledWith("### Trace Story: cli-9222");
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining("recover: Scroll the element into view"));
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining("delta: +1 ~0 -0"));
    } finally {
      consoleSpy.mockRestore();
    }
  });

  it("uses raw request formatter when --requests is passed", async () => {
    await traceCommand(["--requests"], {} as never, {} as never);

    expect(printTraceSummary).toHaveBeenCalledOnce();
  });

  it("builds replay HTML with task stories before raw requests", async () => {
    await traceCommand(["--replay"], {} as never, {} as never);

    const replay = files.get(".bap/trace-replay-cli-9222.html");
    expect(replay).toContain("<h2>Task Stories</h2>");
    expect(replay).toContain("<h2>Raw Requests</h2>");
    expect(replay).toContain("Recover: Scroll the element into view");
  });
});
