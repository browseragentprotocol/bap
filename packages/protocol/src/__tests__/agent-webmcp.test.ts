import { describe, it, expect } from "vitest";
import {
  AgentObserveParamsSchema,
  AgentObserveResultSchema,
} from "../types/agent.js";

describe("AgentObserveParams - WebMCP extension", () => {
  it("accepts includeWebMCPTools param", () => {
    const params = AgentObserveParamsSchema.parse({
      includeWebMCPTools: true,
    });
    expect(params.includeWebMCPTools).toBe(true);
  });

  it("defaults includeWebMCPTools to undefined", () => {
    const params = AgentObserveParamsSchema.parse({});
    expect(params.includeWebMCPTools).toBeUndefined();
  });

  it("accepts false for includeWebMCPTools", () => {
    const params = AgentObserveParamsSchema.parse({
      includeWebMCPTools: false,
    });
    expect(params.includeWebMCPTools).toBe(false);
  });
});

describe("AgentObserveResult - WebMCP extension", () => {
  it("accepts result with webmcpTools", () => {
    const result = AgentObserveResultSchema.parse({
      webmcpTools: [
        { name: "search", source: "webmcp-declarative" },
        { name: "checkout", description: "Complete purchase", source: "webmcp-imperative" },
      ],
    });
    expect(result.webmcpTools).toHaveLength(2);
    expect(result.webmcpTools![0]!.name).toBe("search");
    expect(result.webmcpTools![1]!.source).toBe("webmcp-imperative");
  });

  it("accepts result without webmcpTools", () => {
    const result = AgentObserveResultSchema.parse({});
    expect(result.webmcpTools).toBeUndefined();
  });

  it("accepts result with empty webmcpTools", () => {
    const result = AgentObserveResultSchema.parse({
      webmcpTools: [],
    });
    expect(result.webmcpTools).toEqual([]);
  });
});
