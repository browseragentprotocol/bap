import { beforeEach, describe, expect, it, vi } from "vitest";

const printPageSummary = vi.fn();
const register = vi.fn();

vi.mock("../../src/output/formatter.js", () => ({
  printPageSummary,
}));

vi.mock("../../src/commands/registry.js", () => ({
  register,
}));

const { tabNewCommand } = await import("../../src/commands/tabs.js");

describe("tabNewCommand", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("creates and navigates a new tab in one step when a URL is provided", async () => {
    const client = {
      createPage: vi.fn().mockResolvedValue({
        id: "page-2",
        url: "https://example.com",
        title: "Example",
      }),
      navigate: vi.fn(),
    };

    await tabNewCommand(
      ["https://example.com"],
      {} as never,
      client as never,
    );

    expect(client.createPage).toHaveBeenCalledWith({ url: "https://example.com" });
    expect(client.navigate).not.toHaveBeenCalled();
    expect(printPageSummary).toHaveBeenCalledWith("https://example.com", "Example");
  });

  it("creates a blank tab when no URL is provided", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const client = {
      createPage: vi.fn().mockResolvedValue({
        id: "page-3",
        url: "about:blank",
        title: "",
      }),
      navigate: vi.fn(),
    };

    try {
      await tabNewCommand(
        [],
        {} as never,
        client as never,
      );
    } finally {
      logSpy.mockRestore();
    }

    expect(client.createPage).toHaveBeenCalledWith({});
    expect(client.navigate).not.toHaveBeenCalled();
  });
});
