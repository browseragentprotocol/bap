import { describe, it, expect, vi } from "vitest";
import { BAPMCPServer } from "../index.js";

describe("BAPMCPServer argument validation", () => {
  it("rejects malformed navigate URLs before calling navigate", async () => {
    const server = new BAPMCPServer();
    const mockClient = {
      navigate: vi.fn(),
      listPages: vi.fn(),
      createPage: vi.fn(),
    };

    (server as any).ensureClient = vi.fn().mockResolvedValue(mockClient);

    await expect(
      (server as any).handleToolCall("navigate", { url: "example.com" })
    ).rejects.toThrow("Invalid arguments for 'navigate'");
    expect(mockClient.navigate).not.toHaveBeenCalled();
  });

  it("rejects empty activate_page ids before calling activatePage", async () => {
    const server = new BAPMCPServer();
    const mockClient = {
      activatePage: vi.fn(),
    };

    (server as any).ensureClient = vi.fn().mockResolvedValue(mockClient);

    await expect(
      (server as any).handleToolCall("activate_page", { pageId: "" })
    ).rejects.toThrow("Invalid arguments for 'activate_page'");
    expect(mockClient.activatePage).not.toHaveBeenCalled();
  });
});
