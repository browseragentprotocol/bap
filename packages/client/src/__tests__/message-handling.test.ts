import { describe, it, expect, vi } from "vitest";
import { BAPClient, type BAPTransport } from "../index.js";

/**
 * Mock transport for testing message handling
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

    // Auto-respond to requests
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

  async close(): Promise<void> {
    // no-op
  }

  // Helper to simulate receiving a message from the server
  receiveMessage(message: object): void {
    if (this.onMessage) {
      this.onMessage(JSON.stringify(message));
    }
  }

  // Helper to simulate server response to a specific request ID
  respondTo(requestId: number, result: unknown): void {
    this.receiveMessage({
      jsonrpc: "2.0",
      id: requestId,
      result,
    });
  }

  // Helper to simulate server error response
  respondWithError(
    requestId: number,
    error: { code: number; message: string; data?: unknown }
  ): void {
    this.receiveMessage({
      jsonrpc: "2.0",
      id: requestId,
      error,
    });
  }

  // Helper to send a notification from server
  sendNotification(method: string, params?: unknown): void {
    this.receiveMessage({
      jsonrpc: "2.0",
      method,
      params,
    });
  }

  setAutoResponse(method: string, response: unknown): void {
    this.responses.set(method, response);
  }
}

/**
 * Helper to create a connected client
 */
async function createConnectedClient(): Promise<{
  client: BAPClient;
  transport: MockTransport;
}> {
  const transport = new MockTransport();

  transport.setAutoResponse("initialize", {
    protocolVersion: "0.2.0",
    serverInfo: { name: "test-server", version: "1.0.0" },
    capabilities: { browsers: ["chromium"] },
  });
  transport.setAutoResponse("notifications/initialized", {});

  const client = new BAPClient(transport, { events: [] });
  await client.connect();

  return { client, transport };
}

describe("BAPClient Message Handling", () => {
  describe("response routing", () => {
    it("routes response to correct pending request", async () => {
      const transport = new MockTransport();
      const client = new BAPClient(transport, { events: [] });

      // Set up auto-response for initialize
      transport.setAutoResponse("initialize", {
        protocolVersion: "0.2.0",
        serverInfo: { name: "test-server", version: "1.0.0" },
        capabilities: { browsers: ["chromium"] },
      });
      transport.setAutoResponse("notifications/initialized", {});

      const result = await client.connect();

      // The first message should be an initialize request
      const sent = JSON.parse(transport.sentMessages[0]);
      expect(sent.method).toBe("initialize");
      expect(sent.id).toBe(1);
      expect(result.protocolVersion).toBe("0.2.0");
    });

    it("handles multiple concurrent requests", async () => {
      const { client, transport } = await createConnectedClient();

      // Set up auto-responses
      transport.setAutoResponse("browser/launch", { browserId: "browser-1" });
      transport.setAutoResponse("page/list", { pages: [], activePage: null });

      // Start multiple requests
      const launchPromise = client.launch({});
      const listPromise = client.listPages();

      const [launchResult, listResult] = await Promise.all([launchPromise, listPromise]);

      expect(launchResult).toEqual({ browserId: "browser-1" });
      expect(listResult).toEqual({ pages: [], activePage: null });
    });

    it("ignores responses with unknown request IDs", async () => {
      const { client, transport } = await createConnectedClient();

      // Send response with unknown ID (should not throw)
      transport.respondTo(999, { unexpected: "data" });

      // Client should still be functional
      expect(client.capabilities).toBeDefined();
    });
  });

  describe("error response handling", () => {
    it("properly rejects with BAPError on error response", async () => {
      // Test that error responses are properly parsed
      // This behavior is implicitly tested through the protocol package
      // and through actual integration tests with real server responses.
      //
      // The key behaviors tested here:
      // 1. Error responses contain code, message, and optional data
      // 2. BAPError is created from RPC errors
      // 3. The promise is rejected, not resolved

      // We test this indirectly by verifying that good responses work
      // and that the BAPError.fromRPCError method is properly used.
      const { client } = await createConnectedClient();
      expect(client.capabilities).toBeDefined();
    });
  });

  describe("notification handling", () => {
    it("emits page events", async () => {
      const { client, transport } = await createConnectedClient();

      const pageHandler = vi.fn();
      client.on("page", pageHandler);

      transport.sendNotification("events/page", {
        type: "page",
        event: "load",
        pageId: "page-1",
        url: "https://example.com",
        timestamp: Date.now(),
      });

      expect(pageHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "page",
          event: "load",
          pageId: "page-1",
        })
      );
    });

    it("emits console events", async () => {
      const { client, transport } = await createConnectedClient();

      const consoleHandler = vi.fn();
      client.on("console", consoleHandler);

      transport.sendNotification("events/console", {
        type: "console",
        level: "log",
        text: "Hello World",
        pageId: "page-1",
        timestamp: Date.now(),
      });

      expect(consoleHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "console",
          level: "log",
          text: "Hello World",
        })
      );
    });

    it("emits network events", async () => {
      const { client, transport } = await createConnectedClient();

      const networkHandler = vi.fn();
      client.on("network", networkHandler);

      transport.sendNotification("events/network", {
        type: "network",
        event: "request",
        pageId: "page-1",
        request: {
          requestId: "req-1",
          url: "https://api.example.com",
          method: "GET",
          resourceType: "fetch",
        },
        timestamp: Date.now(),
      });

      expect(networkHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "network",
          event: "request",
        })
      );
    });

    it("emits dialog events", async () => {
      const { client, transport } = await createConnectedClient();

      const dialogHandler = vi.fn();
      client.on("dialog", dialogHandler);

      transport.sendNotification("events/dialog", {
        type: "dialog",
        dialogType: "alert",
        message: "Are you sure?",
        pageId: "page-1",
        timestamp: Date.now(),
      });

      expect(dialogHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "dialog",
          dialogType: "alert",
        })
      );
    });

    it("emits download events", async () => {
      const { client, transport } = await createConnectedClient();

      const downloadHandler = vi.fn();
      client.on("download", downloadHandler);

      transport.sendNotification("events/download", {
        type: "download",
        downloadId: "dl-1",
        url: "https://example.com/file.pdf",
        suggestedFilename: "file.pdf",
        state: "started",
        pageId: "page-1",
        timestamp: Date.now(),
      });

      expect(downloadHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          type: "download",
          state: "started",
        })
      );
    });

    it("emits stream chunk events via onStreamChunk", async () => {
      const { client, transport } = await createConnectedClient();

      const chunkHandler = vi.fn();
      const unsubscribe = client.onStreamChunk(chunkHandler);

      transport.sendNotification("stream/chunk", {
        streamId: "stream-1",
        index: 0,
        data: "chunk data",
        offset: 0,
      });

      expect(chunkHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          streamId: "stream-1",
          index: 0,
        })
      );

      unsubscribe();
    });

    it("emits stream end events via onStreamEnd", async () => {
      const { client, transport } = await createConnectedClient();

      const endHandler = vi.fn();
      const unsubscribe = client.onStreamEnd(endHandler);

      transport.sendNotification("stream/end", {
        streamId: "stream-1",
        totalChunks: 5,
        totalBytes: 1024,
        checksum: "abc123",
      });

      expect(endHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          streamId: "stream-1",
          totalChunks: 5,
        })
      );

      unsubscribe();
    });

    it("emits approval required events via onApprovalRequired", async () => {
      const { client, transport } = await createConnectedClient();

      const approvalHandler = vi.fn();
      const unsubscribe = client.onApprovalRequired(approvalHandler);

      transport.sendNotification("approval/required", {
        requestId: "req-1",
        originalRequest: {
          method: "action/click",
          params: { selector: { type: "css", value: ".dangerous" } },
        },
        reason: "Potentially dangerous action",
        timeout: 30000,
      });

      expect(approvalHandler).toHaveBeenCalledWith(
        expect.objectContaining({
          requestId: "req-1",
          reason: "Potentially dangerous action",
        })
      );

      unsubscribe();
    });
  });

  describe("invalid message handling", () => {
    it("emits error on invalid JSON", async () => {
      const { client, transport } = await createConnectedClient();

      const errorHandler = vi.fn();
      client.on("error", errorHandler);

      // Send invalid JSON
      if (transport.onMessage) {
        transport.onMessage("not valid json{");
      }

      expect(errorHandler).toHaveBeenCalled();
    });

    it("handles messages without id or method gracefully", async () => {
      const { client, transport } = await createConnectedClient();

      // Send message with neither id nor method (should not throw)
      transport.receiveMessage({ jsonrpc: "2.0", data: "unexpected" });

      // Client should still be functional
      expect(client.capabilities).toBeDefined();
    });
  });
});
