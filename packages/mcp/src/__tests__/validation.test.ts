import { describe, it, expect, vi } from "vitest";
import { BAPMCPServer } from "../index.js";

interface MCPValidationHarness {
  ensureClient: ReturnType<typeof vi.fn>;
  handleToolCall(tool: string, args: Record<string, unknown>): Promise<unknown>;
}

describe("BAPMCPServer argument validation", () => {
  it("rejects malformed navigate URLs before calling navigate", async () => {
    const server = new BAPMCPServer();
    const harness = server as unknown as MCPValidationHarness;
    const mockClient = {
      navigate: vi.fn(),
      listPages: vi.fn(),
      createPage: vi.fn(),
    };

    harness.ensureClient = vi.fn().mockResolvedValue(mockClient);

    await expect(
      harness.handleToolCall("navigate", { url: "example.com" })
    ).rejects.toThrow("Invalid arguments for 'navigate'");
    expect(mockClient.navigate).not.toHaveBeenCalled();
  });

  it("rejects empty activate_page ids before calling activatePage", async () => {
    const server = new BAPMCPServer();
    const harness = server as unknown as MCPValidationHarness;
    const mockClient = {
      activatePage: vi.fn(),
    };

    harness.ensureClient = vi.fn().mockResolvedValue(mockClient);

    await expect(
      harness.handleToolCall("activate_page", { pageId: "" })
    ).rejects.toThrow("Invalid arguments for 'activate_page'");
    expect(mockClient.activatePage).not.toHaveBeenCalled();
  });
});
