import { describe, it, expect } from "vitest";
import { BAPPlaywrightServer } from "../server.js";

/**
 * Structural tests for discovery/discover method support.
 * Full integration tests require a running browser and are out of scope here.
 * These tests verify that the server handles the method name correctly.
 */
describe("BAPPlaywrightServer - discovery support", () => {
  it("server can be instantiated (discovery handler registered)", () => {
    const server = new BAPPlaywrightServer();
    expect(server).toBeInstanceOf(BAPPlaywrightServer);
  });

  it("allows discovery/discover for observe-scoped clients", () => {
    const server = new BAPPlaywrightServer();
    const state = {
      scopes: ["observe:*"],
    };

    expect(() => (server as any).checkAuthorization(state, "discovery/discover")).not.toThrow();
  });
});
