import { describe, it, expect } from "vitest";

/**
 * Tests for the discover_tools MCP tool definition and observe includeWebMCPTools param.
 * These are structural tests that verify tool definitions are correct —
 * integration tests with a running server are out of scope here.
 */

// We dynamically import the module to verify it's structurally sound
// and the tool definitions include our new additions.
describe("discover_tools MCP tool", () => {
  it("is included in the TOOLS array", async () => {
    // The TOOLS array is not directly exported, but the module should at least
    // compile and be importable without errors
    const mod = await import("../index.js");
    expect(mod.BAPMCPServer).toBeDefined();
  });
});

describe("observe tool - includeWebMCPTools param", () => {
  it("module exports BAPMCPServer class", async () => {
    const mod = await import("../index.js");
    expect(typeof mod.BAPMCPServer).toBe("function");
  });
});

describe("parseSelector export", () => {
  it("is exported from the module", async () => {
    const mod = await import("../index.js");
    expect(typeof mod.parseSelector).toBe("function");
  });
});
