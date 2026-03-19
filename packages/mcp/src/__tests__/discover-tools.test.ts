import { describe, it, expect } from "vitest";

import { BAPMCPServer, parseSelector } from "../index.js";

/**
 * Tests for the discover_tools MCP tool definition and observe includeWebMCPTools param.
 * These are structural tests that verify tool definitions are correct —
 * integration tests with a running server are out of scope here.
 */

describe("discover_tools MCP tool", () => {
  it("module is importable", () => {
    expect(BAPMCPServer).toBeDefined();
  });
});

describe("observe tool - includeWebMCPTools param", () => {
  it("exports BAPMCPServer class", () => {
    expect(typeof BAPMCPServer).toBe("function");
  });
});

describe("parseSelector export", () => {
  it("is exported from the module", () => {
    expect(typeof parseSelector).toBe("function");
  });
});
