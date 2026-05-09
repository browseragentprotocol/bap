import { beforeEach, describe, expect, it, vi } from "vitest";

const register = vi.fn();
const printObserveResult = vi.fn();
const printObserveDeltaResult = vi.fn();
const writeSnapshot = vi.fn();

vi.mock("../../src/commands/registry.js", () => ({
  register,
}));

vi.mock("../../src/output/formatter.js", () => ({
  printObserveResult,
  printObserveDeltaResult,
}));

vi.mock("../../src/output/filesystem.js", () => ({
  writeSnapshot,
}));

const { observeCommand } = await import("../../src/commands/observe.js");

describe("observeCommand", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("prints delta-only output for --diff observes", async () => {
    const client = {
      observe: vi.fn().mockResolvedValue({
        metadata: { url: "https://example.com", title: "Example" },
        changes: { added: [], updated: [], removed: [] },
        interactiveElements: [{ ref: "e1", role: "button", name: "Submit" }],
      }),
    };

    await observeCommand([], { diff: true, max: 20 } as never, client as never);

    expect(client.observe).toHaveBeenCalledWith(
      expect.objectContaining({ incremental: true, maxElements: 20 })
    );
    expect(printObserveDeltaResult).toHaveBeenCalledOnce();
    expect(printObserveResult).not.toHaveBeenCalled();
  });
});
