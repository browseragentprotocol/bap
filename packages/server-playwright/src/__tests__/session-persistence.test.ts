import { describe, it, expect } from "vitest";
import { BAPPlaywrightServer } from "../server.js";
import type { BAPServerOptions } from "../server.js";

/**
 * Tests for server-side session persistence (dormant session store).
 *
 * These are structural/unit tests that verify the server's configuration
 * and type-level support for session persistence. Full integration tests
 * (with real WebSocket connections and browsers) require a running
 * Playwright instance and are out of scope here.
 */
describe("BAPPlaywrightServer - session persistence", () => {
  it("accepts dormantSessionTtl in session options", () => {
    const server = new BAPPlaywrightServer({
      session: {
        dormantSessionTtl: 120,
      },
    });
    expect(server).toBeInstanceOf(BAPPlaywrightServer);
  });

  it("creates server with default dormantSessionTtl", () => {
    const server = new BAPPlaywrightServer();
    expect(server).toBeInstanceOf(BAPPlaywrightServer);
  });

  it("accepts dormantSessionTtl alongside other session options", () => {
    const options: BAPServerOptions = {
      session: {
        maxDuration: 7200,
        idleTimeout: 300,
        dormantSessionTtl: 60,
      },
    };
    const server = new BAPPlaywrightServer(options);
    expect(server).toBeInstanceOf(BAPPlaywrightServer);
  });

  it("accepts all options including dormantSessionTtl", () => {
    const options: BAPServerOptions = {
      port: 9999,
      host: "0.0.0.0",
      session: {
        maxDuration: 3600,
        idleTimeout: 600,
        dormantSessionTtl: 300,
      },
      limits: {
        maxPagesPerClient: 5,
      },
    };
    const server = new BAPPlaywrightServer(options);
    expect(server).toBeInstanceOf(BAPPlaywrightServer);
  });
});
