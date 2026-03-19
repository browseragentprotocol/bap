import { describe, it, expect } from "vitest";
import {
  WebMCPToolSourceSchema,
  WebMCPToolSchema,
  DiscoveryDiscoverParamsSchema,
  DiscoveryDiscoverResultSchema,
  DiscoveryDiscoverOptionsSchema,
} from "../types/discovery.js";

describe("WebMCPToolSourceSchema", () => {
  it("accepts valid source values", () => {
    expect(WebMCPToolSourceSchema.parse("webmcp-declarative")).toBe("webmcp-declarative");
    expect(WebMCPToolSourceSchema.parse("webmcp-imperative")).toBe("webmcp-imperative");
  });

  it("rejects invalid source values", () => {
    expect(WebMCPToolSourceSchema.safeParse("unknown").success).toBe(false);
    expect(WebMCPToolSourceSchema.safeParse("").success).toBe(false);
    expect(WebMCPToolSourceSchema.safeParse(42).success).toBe(false);
  });
});

describe("WebMCPToolSchema", () => {
  it("accepts a minimal declarative tool", () => {
    const tool = WebMCPToolSchema.parse({
      name: "search",
      source: "webmcp-declarative",
    });
    expect(tool.name).toBe("search");
    expect(tool.source).toBe("webmcp-declarative");
    expect(tool.description).toBeUndefined();
    expect(tool.inputSchema).toBeUndefined();
    expect(tool.formSelector).toBeUndefined();
  });

  it("accepts a fully-specified declarative tool", () => {
    const tool = WebMCPToolSchema.parse({
      name: "search-products",
      description: "Search the product catalog",
      inputSchema: {
        type: "object",
        properties: {
          query: { type: "string" },
        },
      },
      source: "webmcp-declarative",
      formSelector: "form[toolname=\"search-products\"]",
    });
    expect(tool.name).toBe("search-products");
    expect(tool.description).toBe("Search the product catalog");
    expect(tool.inputSchema).toEqual({
      type: "object",
      properties: { query: { type: "string" } },
    });
    expect(tool.formSelector).toBe("form[toolname=\"search-products\"]");
  });

  it("accepts an imperative tool", () => {
    const tool = WebMCPToolSchema.parse({
      name: "add-to-cart",
      description: "Add item to cart",
      source: "webmcp-imperative",
    });
    expect(tool.source).toBe("webmcp-imperative");
    expect(tool.formSelector).toBeUndefined();
  });

  it("rejects tool without name", () => {
    expect(WebMCPToolSchema.safeParse({
      source: "webmcp-declarative",
    }).success).toBe(false);
  });

  it("rejects tool without source", () => {
    expect(WebMCPToolSchema.safeParse({
      name: "test",
    }).success).toBe(false);
  });
});

describe("DiscoveryDiscoverOptionsSchema", () => {
  it("accepts empty options", () => {
    const opts = DiscoveryDiscoverOptionsSchema.parse({});
    expect(opts.maxTools).toBeUndefined();
    expect(opts.includeInputSchemas).toBeUndefined();
  });

  it("accepts all options", () => {
    const opts = DiscoveryDiscoverOptionsSchema.parse({
      maxTools: 25,
      includeInputSchemas: false,
    });
    expect(opts.maxTools).toBe(25);
    expect(opts.includeInputSchemas).toBe(false);
  });
});

describe("DiscoveryDiscoverParamsSchema", () => {
  it("accepts empty params", () => {
    const params = DiscoveryDiscoverParamsSchema.parse({});
    expect(params.pageId).toBeUndefined();
    expect(params.options).toBeUndefined();
  });

  it("accepts params with pageId", () => {
    const params = DiscoveryDiscoverParamsSchema.parse({
      pageId: "page-123",
    });
    expect(params.pageId).toBe("page-123");
  });

  it("accepts params with options", () => {
    const params = DiscoveryDiscoverParamsSchema.parse({
      options: { maxTools: 10 },
    });
    expect(params.options?.maxTools).toBe(10);
  });
});

describe("DiscoveryDiscoverResultSchema", () => {
  it("accepts empty result", () => {
    const result = DiscoveryDiscoverResultSchema.parse({
      tools: [],
      totalDiscovered: 0,
    });
    expect(result.tools).toEqual([]);
    expect(result.totalDiscovered).toBe(0);
    expect(result.apiVersion).toBeUndefined();
  });

  it("accepts result with tools", () => {
    const result = DiscoveryDiscoverResultSchema.parse({
      tools: [
        { name: "search", source: "webmcp-declarative", formSelector: "#search-form" },
        { name: "add-to-cart", description: "Add item", source: "webmcp-imperative" },
      ],
      totalDiscovered: 2,
      apiVersion: "1.0",
    });
    expect(result.tools).toHaveLength(2);
    expect(result.totalDiscovered).toBe(2);
    expect(result.apiVersion).toBe("1.0");
  });

  it("rejects result without tools array", () => {
    expect(DiscoveryDiscoverResultSchema.safeParse({
      totalDiscovered: 0,
    }).success).toBe(false);
  });

  it("rejects result without totalDiscovered", () => {
    expect(DiscoveryDiscoverResultSchema.safeParse({
      tools: [],
    }).success).toBe(false);
  });
});
