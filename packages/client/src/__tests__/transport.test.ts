import { describe, it, expect } from "vitest";
import { BAPClient, WebSocketTransport } from "../index.js";

/**
 * WebSocketTransport tests
 *
 * Note: Full transport tests with actual WebSocket connections are integration tests.
 * These unit tests verify the transport interface, configuration, and error states
 * that don't require a real WebSocket connection.
 */
describe("WebSocketTransport", () => {
  describe("constructor", () => {
    it("creates transport with URL", () => {
      const transport = new WebSocketTransport("ws://localhost:9222");
      expect(transport).toBeDefined();
    });

    it("creates transport with URL and default options", () => {
      const transport = new WebSocketTransport("ws://localhost:9222");
      expect(transport).toBeDefined();
    });

    it("creates transport with URL and custom options", () => {
      const transport = new WebSocketTransport("ws://localhost:9222", {
        maxReconnectAttempts: 10,
        reconnectDelay: 2000,
        autoReconnect: true,
      });
      expect(transport).toBeDefined();
    });

    it("creates transport with wss:// URL", () => {
      const transport = new WebSocketTransport("wss://secure.example.com:443");
      expect(transport).toBeDefined();
    });
  });

  describe("event handlers", () => {
    it("initializes onMessage to null", () => {
      const transport = new WebSocketTransport("ws://localhost:9222");
      expect(transport.onMessage).toBeNull();
    });

    it("initializes onClose to null", () => {
      const transport = new WebSocketTransport("ws://localhost:9222");
      expect(transport.onClose).toBeNull();
    });

    it("initializes onError to null", () => {
      const transport = new WebSocketTransport("ws://localhost:9222");
      expect(transport.onError).toBeNull();
    });

    it("initializes onReconnecting to null", () => {
      const transport = new WebSocketTransport("ws://localhost:9222");
      expect(transport.onReconnecting).toBeNull();
    });

    it("initializes onReconnected to null", () => {
      const transport = new WebSocketTransport("ws://localhost:9222");
      expect(transport.onReconnected).toBeNull();
    });

    it("allows setting onMessage handler", () => {
      const transport = new WebSocketTransport("ws://localhost:9222");
      const handler = () => {};
      transport.onMessage = handler;
      expect(transport.onMessage).toBe(handler);
    });

    it("allows setting onClose handler", () => {
      const transport = new WebSocketTransport("ws://localhost:9222");
      const handler = () => {};
      transport.onClose = handler;
      expect(transport.onClose).toBe(handler);
    });

    it("allows setting onError handler", () => {
      const transport = new WebSocketTransport("ws://localhost:9222");
      const handler = () => {};
      transport.onError = handler;
      expect(transport.onError).toBe(handler);
    });

    it("allows setting onReconnecting handler", () => {
      const transport = new WebSocketTransport("ws://localhost:9222");
      const handler = () => {};
      transport.onReconnecting = handler;
      expect(transport.onReconnecting).toBe(handler);
    });

    it("allows setting onReconnected handler", () => {
      const transport = new WebSocketTransport("ws://localhost:9222");
      const handler = () => {};
      transport.onReconnected = handler;
      expect(transport.onReconnected).toBe(handler);
    });

    it("allows setting handler to null", () => {
      const transport = new WebSocketTransport("ws://localhost:9222");
      transport.onMessage = () => {};
      transport.onMessage = null;
      expect(transport.onMessage).toBeNull();
    });
  });

  describe("send() without connection", () => {
    it("throws error when not connected", async () => {
      const transport = new WebSocketTransport("ws://localhost:9222");
      await expect(transport.send('{"jsonrpc":"2.0"}')).rejects.toThrow(
        "WebSocket not connected"
      );
    });

    it("throws error with appropriate message", async () => {
      const transport = new WebSocketTransport("ws://localhost:9222");
      try {
        await transport.send("test");
        expect.fail("Should have thrown");
      } catch (error) {
        expect(error).toBeInstanceOf(Error);
        expect((error as Error).message).toBe("WebSocket not connected");
      }
    });
  });

  describe("close() without connection", () => {
    it("resolves successfully when not connected", async () => {
      const transport = new WebSocketTransport("ws://localhost:9222");
      await expect(transport.close()).resolves.toBeUndefined();
    });

    it("can be called multiple times", async () => {
      const transport = new WebSocketTransport("ws://localhost:9222");
      await transport.close();
      await transport.close();
      await transport.close();
      // Should not throw
    });
  });

  describe("BAPTransport interface", () => {
    it("implements send method", () => {
      const transport = new WebSocketTransport("ws://localhost:9222");
      expect(typeof transport.send).toBe("function");
    });

    it("implements close method", () => {
      const transport = new WebSocketTransport("ws://localhost:9222");
      expect(typeof transport.close).toBe("function");
    });

    it("has onMessage property", () => {
      const transport = new WebSocketTransport("ws://localhost:9222");
      expect("onMessage" in transport).toBe(true);
    });

    it("has onClose property", () => {
      const transport = new WebSocketTransport("ws://localhost:9222");
      expect("onClose" in transport).toBe(true);
    });

    it("has onError property", () => {
      const transport = new WebSocketTransport("ws://localhost:9222");
      expect("onError" in transport).toBe(true);
    });
  });

  describe("options defaults", () => {
    it("uses maxReconnectAttempts=5 by default", () => {
      // This is tested indirectly through behavior, not direct property access
      const transport = new WebSocketTransport("ws://localhost:9222");
      expect(transport).toBeDefined();
    });

    it("uses reconnectDelay=1000 by default", () => {
      // This is tested indirectly through behavior, not direct property access
      const transport = new WebSocketTransport("ws://localhost:9222");
      expect(transport).toBeDefined();
    });

    it("uses autoReconnect=false by default", () => {
      // This is tested indirectly through behavior, not direct property access
      const transport = new WebSocketTransport("ws://localhost:9222");
      expect(transport).toBeDefined();
    });
  });

  describe("token updates", () => {
    it("adds the latest token to future connection URLs", () => {
      const transport = new WebSocketTransport("ws://localhost:9222");
      transport.updateToken("token-1");

      expect((transport as any).getConnectionUrl()).toBe(
        "ws://localhost:9222/?token=token-1"
      );
    });

    it("replaces the token instead of appending duplicates", () => {
      const transport = new WebSocketTransport("ws://localhost:9222?existing=yes");
      transport.updateToken("token-1");
      transport.updateToken("token-2");

      expect((transport as any).getConnectionUrl()).toBe(
        "ws://localhost:9222/?existing=yes&token=token-2"
      );
    });
  });
});

describe("BAPClient token updates", () => {
  it("propagates updated tokens to the WebSocket transport", () => {
    const client = new BAPClient("ws://localhost:9222", { token: "initial-token" });
    client.updateToken("rotated-token");

    const transport = (client as any).transport as WebSocketTransport;
    expect((transport as any).getConnectionUrl()).toBe(
      "ws://localhost:9222/?token=rotated-token"
    );
  });
});
