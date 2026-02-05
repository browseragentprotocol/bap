import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { BAPPlaywrightServer } from "../server.js";
import type { BAPServerOptions } from "../server.js";

describe("BAPPlaywrightServer", () => {
  describe("constructor", () => {
    it("creates server with default options", () => {
      const server = new BAPPlaywrightServer();
      expect(server).toBeInstanceOf(BAPPlaywrightServer);
    });

    it("creates server with custom port", () => {
      const server = new BAPPlaywrightServer({ port: 9999 });
      expect(server).toBeInstanceOf(BAPPlaywrightServer);
    });

    it("creates server with custom host", () => {
      const server = new BAPPlaywrightServer({ host: "0.0.0.0" });
      expect(server).toBeInstanceOf(BAPPlaywrightServer);
    });

    it("creates server with security options", () => {
      const server = new BAPPlaywrightServer({
        security: {
          allowedHosts: ["example.com", "*.example.com"],
          blockedProtocols: ["file", "javascript"],
        },
      });
      expect(server).toBeInstanceOf(BAPPlaywrightServer);
    });

    it("creates server with limits options", () => {
      const server = new BAPPlaywrightServer({
        limits: {
          maxPagesPerContext: 5,
          maxContextsPerBrowser: 3,
          maxConcurrentBrowsers: 2,
          maxBodySizeBytes: 1024 * 1024,
          maxNavigationTimeout: 30000,
          maxActionTimeout: 10000,
        },
      });
      expect(server).toBeInstanceOf(BAPPlaywrightServer);
    });

    it("creates server with authorization options", () => {
      const server = new BAPPlaywrightServer({
        authorization: {
          enabled: true,
          defaultScopes: ["browser:*", "action:*"],
        },
      });
      expect(server).toBeInstanceOf(BAPPlaywrightServer);
    });

    it("creates server with session options", () => {
      const server = new BAPPlaywrightServer({
        session: {
          maxDuration: 7200,
          idleTimeout: 600,
        },
      });
      expect(server).toBeInstanceOf(BAPPlaywrightServer);
    });

    it("creates server with auth token", () => {
      const server = new BAPPlaywrightServer({
        authToken: "test-token-123",
      });
      expect(server).toBeInstanceOf(BAPPlaywrightServer);
    });

    it("creates server with all options combined", () => {
      const options: BAPServerOptions = {
        port: 8080,
        host: "127.0.0.1",
        authToken: "secret-token",
        security: {
          allowedHosts: ["*.trusted.com"],
          blockedHosts: ["evil.com"],
          allowedProtocols: ["https"],
          blockedProtocols: ["file"],
        },
        limits: {
          maxPagesPerContext: 10,
          maxContextsPerBrowser: 5,
          maxConcurrentBrowsers: 3,
          maxBodySizeBytes: 5 * 1024 * 1024,
          maxNavigationTimeout: 60000,
          maxActionTimeout: 30000,
        },
        authorization: {
          enabled: true,
          defaultScopes: ["browser:*"],
          scopesEnvVar: "BAP_CUSTOM_SCOPES",
        },
        session: {
          maxDuration: 3600,
          idleTimeout: 300,
        },
      };
      const server = new BAPPlaywrightServer(options);
      expect(server).toBeInstanceOf(BAPPlaywrightServer);
    });
  });

  describe("start() and stop()", () => {
    let server: BAPPlaywrightServer;

    afterEach(async () => {
      if (server) {
        await server.stop();
      }
    });

    it("starts and stops server", async () => {
      server = new BAPPlaywrightServer({ port: 0 }); // Use port 0 for random available port
      await server.start();
      await server.stop();
    });

    it("can be stopped when not started", async () => {
      server = new BAPPlaywrightServer();
      // Should not throw
      await server.stop();
    });

    it("can be started multiple times after stopping", async () => {
      server = new BAPPlaywrightServer({ port: 0 });
      await server.start();
      await server.stop();
      await server.start();
      await server.stop();
    });
  });

  describe("events", () => {
    it("extends EventEmitter", () => {
      const server = new BAPPlaywrightServer();
      expect(typeof server.on).toBe("function");
      expect(typeof server.emit).toBe("function");
      expect(typeof server.removeListener).toBe("function");
    });

    it("can register event listeners", () => {
      const server = new BAPPlaywrightServer();
      const listener = vi.fn();
      server.on("connection", listener);
      expect(server.listenerCount("connection")).toBe(1);
    });
  });
});

describe("BAPServerOptions types", () => {
  it("accepts empty options", () => {
    const options: BAPServerOptions = {};
    expect(options).toEqual({});
  });

  it("accepts partial security options", () => {
    const options: BAPServerOptions = {
      security: {
        allowedHosts: ["example.com"],
      },
    };
    expect(options.security?.allowedHosts).toEqual(["example.com"]);
  });

  it("accepts partial limits options", () => {
    const options: BAPServerOptions = {
      limits: {
        maxPagesPerContext: 5,
      },
    };
    expect(options.limits?.maxPagesPerContext).toBe(5);
  });
});
