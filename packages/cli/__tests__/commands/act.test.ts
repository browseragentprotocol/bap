import { beforeEach, describe, expect, it, vi } from "vitest";

const register = vi.fn();
const printActPlan = vi.fn();
const printActAudit = vi.fn();
const printActResult = vi.fn();
const printObserveResult = vi.fn();
const writeSnapshot = vi.fn().mockResolvedValue(".bap/snapshot.md");

vi.mock("../../src/commands/registry.js", () => ({
  register,
}));

vi.mock("../../src/output/formatter.js", () => ({
  printActPlan,
  printActAudit,
  printActResult,
  printObserveResult,
}));

vi.mock("../../src/output/filesystem.js", () => ({
  writeSnapshot,
}));

const { actCommand } = await import("../../src/commands/act.js");

describe("actCommand trust/audit surfaces", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("supports --explain as a preflight without executing steps", async () => {
    const client = {
      listSessions: vi.fn().mockResolvedValue({
        sessions: [
          {
            sessionId: "cli-9222",
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
      act: vi.fn(),
    };

    await actCommand(["fill:e5=password123", "click:text:\"Submit\""], { port: 9222, explain: true } as never, client as never);

    expect(printActPlan).toHaveBeenCalledOnce();
    expect(client.act).not.toHaveBeenCalled();
  });

  it("supports --audit by printing a post-run audit with risk classes", async () => {
    const client = {
      listSessions: vi.fn().mockResolvedValue({
        sessions: [
          {
            sessionId: "cli-9222",
            trust: {
              approvalMode: "privileged",
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
      act: vi.fn().mockResolvedValue({
        success: true,
        completed: 2,
        total: 2,
        results: [
          { success: true, duration: 12 },
          {
            success: false,
            duration: 30,
            error: {
              message: "Element not visible",
              data: {
                details: {
                  recoveryHint: "Scroll into view and retry",
                },
              },
            },
          },
        ],
      }),
      ariaSnapshot: vi.fn().mockResolvedValue({ snapshot: "tree" }),
      observe: vi.fn().mockResolvedValue({
        metadata: { url: "https://example.com", title: "Example" },
      }),
    };

    await actCommand(["fill:e5=password123", "click:text:\"Submit\""], { port: 9222, audit: true } as never, client as never);

    expect(client.act).toHaveBeenCalledOnce();
    expect(printActPlan).toHaveBeenCalledOnce();
    expect(printActAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        overallRisk: expect.arrayContaining(["mutate", "submit", "credential-affecting"]),
        steps: expect.arrayContaining([
          expect.objectContaining({
            recovery: "Scroll into view and retry",
          }),
        ]),
      })
    );
    expect(printActResult).toHaveBeenCalledOnce();
    expect(writeSnapshot).toHaveBeenCalledOnce();
  });
});
