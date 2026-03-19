import { describe, it, expect } from "vitest";
import { BAPClient, type BAPTransport } from "../index.js";

/**
 * Mock transport for testing session persistence behavior
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

  async close(): Promise<void> {
    // no-op
  }

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

  getAllRequests(): { method: string; params: unknown; id: number }[] {
    return this.sentMessages.map((m) => JSON.parse(m));
  }
}

function setupTransport(transport: MockTransport): void {
  transport.setAutoResponse("initialize", {
    protocolVersion: "0.2.0",
    serverInfo: { name: "test-server", version: "1.0.0" },
    capabilities: { browsers: ["chromium"] },
    sessionId: "test-session",
  });
  transport.setAutoResponse("notifications/initialized", {});
  transport.setAutoResponse("events/subscribe", { subscribed: [] });
}

describe("BAPClient - session persistence", () => {
  describe("connect()", () => {
    it("should include sessionId in initialize params when set", async () => {
      const transport = new MockTransport();
      setupTransport(transport);

      const client = new BAPClient(transport, {
        sessionId: "my-session",
        events: [],
      });
      await client.connect();

      const initRequest = transport.getAllRequests().find(
        (r) => r.method === "initialize"
      );
      expect(initRequest).toBeDefined();
      const params = initRequest!.params as Record<string, unknown>;
      expect(params.sessionId).toBe("my-session");
    });

    it("should not include sessionId in initialize params when not set", async () => {
      const transport = new MockTransport();
      setupTransport(transport);

      const client = new BAPClient(transport, { events: [] });
      await client.connect();

      const initRequest = transport.getAllRequests().find(
        (r) => r.method === "initialize"
      );
      expect(initRequest).toBeDefined();
      const params = initRequest!.params as Record<string, unknown>;
      expect(params.sessionId).toBeUndefined();
    });
  });

  describe("close()", () => {
    it("should skip shutdown RPC when sessionId is set", async () => {
      const transport = new MockTransport();
      setupTransport(transport);

      const client = new BAPClient(transport, {
        sessionId: "my-session",
        events: [],
      });
      await client.connect();

      // Clear sent messages to only track close behavior
      transport.sentMessages = [];
      await client.close();

      const methods = transport.sentMessages.map((m) => JSON.parse(m).method);
      expect(methods).not.toContain("shutdown");
    });

    it("should send shutdown RPC when sessionId is not set", async () => {
      const transport = new MockTransport();
      setupTransport(transport);
      transport.setAutoResponse("shutdown", {});

      const client = new BAPClient(transport, { events: [] });
      await client.connect();

      // Clear sent messages to only track close behavior
      transport.sentMessages = [];
      await client.close();

      const methods = transport.sentMessages.map((m) => JSON.parse(m).method);
      expect(methods).toContain("shutdown");
    });
  });

  describe("constructor", () => {
    it("should accept sessionId option", () => {
      const client = new BAPClient("ws://localhost:9222", {
        sessionId: "test-session",
      });
      expect(client).toBeDefined();
    });
  });
});
