import { describe, it, expect } from "vitest";
import { BAPClient, type BAPTransport } from "../index.js";

/**
 * Mock transport for testing client methods
 */
class MockTransport implements BAPTransport {
  onMessage: ((message: string) => void) | null = null;
  onClose: (() => void) | null = null;
  onError: ((error: Error) => void) | null = null;

  sentMessages: string[] = [];
  responses: Map<string, unknown> = new Map();

  async send(message: string): Promise<void> {
    this.sentMessages.push(message);
    const parsed = JSON.parse(message);

    if (parsed.id !== undefined && this.responses.has(parsed.method)) {
      queueMicrotask(() => {
        this.receiveMessage({
          jsonrpc: "2.0",
          id: parsed.id,
          result: this.responses.get(parsed.method),
        });
      });
    }
  }

  async close(): Promise<void> {}

  receiveMessage(message: object): void {
    if (this.onMessage) {
      this.onMessage(JSON.stringify(message));
    }
  }

  setAutoResponse(method: string, response: unknown): void {
    this.responses.set(method, response);
  }

  getLastRequest(): { method: string; params: unknown; id: number } | null {
    if (this.sentMessages.length === 0) return null;
    return JSON.parse(this.sentMessages[this.sentMessages.length - 1]!);
  }
}

async function createConnectedClient(): Promise<{ client: BAPClient; transport: MockTransport }> {
  const transport = new MockTransport();

  transport.setAutoResponse("initialize", {
    protocolVersion: "0.2.0",
    serverInfo: { name: "test-server", version: "1.0.0" },
    capabilities: { browsers: ["chromium"] },
  });
  transport.setAutoResponse("notifications/initialized", {});
  transport.setAutoResponse("events/subscribe", { subscribed: [] });

  const client = new BAPClient(transport);
  await client.connect();

  return { client, transport };
}

describe("BAPClient.discoverTools()", () => {
  it("sends correct method and params", async () => {
    const { client, transport } = await createConnectedClient();

    transport.setAutoResponse("discovery/discover", {
      tools: [],
      totalDiscovered: 0,
    });

    const result = await client.discoverTools();

    const request = transport.getLastRequest();
    expect(request?.method).toBe("discovery/discover");
    expect(request?.params).toEqual({
      pageId: null,
      options: undefined,
    });
    expect(result.tools).toEqual([]);
    expect(result.totalDiscovered).toBe(0);
  });

  it("passes pageId when provided", async () => {
    const { client, transport } = await createConnectedClient();

    transport.setAutoResponse("discovery/discover", {
      tools: [],
      totalDiscovered: 0,
    });

    await client.discoverTools("page-42");

    const request = transport.getLastRequest();
    expect(request?.params).toEqual({
      pageId: "page-42",
      options: undefined,
    });
  });

  it("passes options when provided", async () => {
    const { client, transport } = await createConnectedClient();

    transport.setAutoResponse("discovery/discover", {
      tools: [],
      totalDiscovered: 0,
    });

    await client.discoverTools(undefined, { maxTools: 10, includeInputSchemas: false });

    const request = transport.getLastRequest();
    expect(request?.params).toEqual({
      pageId: null,
      options: { maxTools: 10, includeInputSchemas: false },
    });
  });

  it("parses response with tools", async () => {
    const { client, transport } = await createConnectedClient();

    transport.setAutoResponse("discovery/discover", {
      tools: [
        { name: "search", source: "webmcp-declarative", formSelector: "#search" },
        { name: "add-to-cart", description: "Add item", source: "webmcp-imperative" },
      ],
      totalDiscovered: 2,
      apiVersion: "1.0",
    });

    const result = await client.discoverTools();

    expect(result.tools).toHaveLength(2);
    expect(result.tools[0]!.name).toBe("search");
    expect(result.tools[0]!.source).toBe("webmcp-declarative");
    expect(result.tools[1]!.name).toBe("add-to-cart");
    expect(result.totalDiscovered).toBe(2);
    expect(result.apiVersion).toBe("1.0");
  });
});
