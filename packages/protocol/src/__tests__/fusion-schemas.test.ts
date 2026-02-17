import { describe, it, expect } from "vitest";
import {
  ResponseTierSchema,
  ObserveChangesSchema,
  AgentObserveParamsSchema,
  AgentObserveResultSchema,
  AgentActParamsSchema,
  AgentActResultSchema,
} from "../types/agent.js";
import {
  PageNavigateParamsSchema,
  PageNavigateResultSchema,
} from "../types/methods.js";

describe("Fusion Protocol Schema Validation", () => {
  describe("ResponseTierSchema", () => {
    it("accepts valid tiers", () => {
      expect(ResponseTierSchema.parse("full")).toBe("full");
      expect(ResponseTierSchema.parse("interactive")).toBe("interactive");
      expect(ResponseTierSchema.parse("minimal")).toBe("minimal");
    });

    it("rejects invalid tiers", () => {
      expect(() => ResponseTierSchema.parse("compact")).toThrow();
      expect(() => ResponseTierSchema.parse("")).toThrow();
      expect(() => ResponseTierSchema.parse(123)).toThrow();
    });
  });

  describe("ObserveChangesSchema", () => {
    it("accepts valid changes with empty arrays", () => {
      const result = ObserveChangesSchema.parse({
        added: [],
        updated: [],
        removed: [],
      });
      expect(result.added).toHaveLength(0);
      expect(result.updated).toHaveLength(0);
      expect(result.removed).toHaveLength(0);
    });

    it("accepts changes with populated arrays", () => {
      const result = ObserveChangesSchema.parse({
        added: [{
          ref: "@btn1",
          selector: { type: "role", role: "button", name: "Submit" },
          role: "button",
          name: "Submit",
          tagName: "BUTTON",
          actionHints: ["clickable"],
        }],
        updated: [],
        removed: ["@btn2"],
      });
      expect(result.added).toHaveLength(1);
      expect(result.removed).toHaveLength(1);
    });

    it("rejects missing required fields", () => {
      expect(() => ObserveChangesSchema.parse({})).toThrow();
      expect(() => ObserveChangesSchema.parse({ added: [] })).toThrow();
      expect(() => ObserveChangesSchema.parse({ added: [], updated: [] })).toThrow();
    });
  });

  describe("AgentObserveParamsSchema — fusion fields", () => {
    it("accepts responseTier", () => {
      const result = AgentObserveParamsSchema.parse({
        responseTier: "interactive",
      });
      expect(result.responseTier).toBe("interactive");
    });

    it("accepts incremental flag", () => {
      const result = AgentObserveParamsSchema.parse({
        incremental: true,
      });
      expect(result.incremental).toBe(true);
    });

    it("accepts both fusion fields together", () => {
      const result = AgentObserveParamsSchema.parse({
        responseTier: "minimal",
        incremental: true,
        includeMetadata: true,
        maxElements: 50,
      });
      expect(result.responseTier).toBe("minimal");
      expect(result.incremental).toBe(true);
    });

    it("accepts empty params (all optional)", () => {
      const result = AgentObserveParamsSchema.parse({});
      expect(result.responseTier).toBeUndefined();
      expect(result.incremental).toBeUndefined();
    });

    it("rejects invalid responseTier", () => {
      expect(() => AgentObserveParamsSchema.parse({
        responseTier: "compact",
      })).toThrow();
    });
  });

  describe("AgentObserveResultSchema — fusion fields", () => {
    it("accepts result with changes", () => {
      const result = AgentObserveResultSchema.parse({
        changes: {
          added: [],
          updated: [],
          removed: ["@btn1"],
        },
      });
      expect(result.changes?.removed).toHaveLength(1);
    });

    it("accepts result without changes", () => {
      const result = AgentObserveResultSchema.parse({});
      expect(result.changes).toBeUndefined();
    });
  });

  describe("AgentActParamsSchema — fusion fields", () => {
    const minStep = { action: "action/click", params: { selector: { type: "css" as const, value: ".btn" } } };

    it("accepts preObserve param", () => {
      const result = AgentActParamsSchema.parse({
        steps: [minStep],
        preObserve: { includeMetadata: true, maxElements: 50 },
      });
      expect(result.preObserve).toBeDefined();
      expect(result.preObserve?.includeMetadata).toBe(true);
    });

    it("accepts postObserve param", () => {
      const result = AgentActParamsSchema.parse({
        steps: [minStep],
        postObserve: { responseTier: "interactive", includeInteractiveElements: true },
      });
      expect(result.postObserve).toBeDefined();
      expect(result.postObserve?.responseTier).toBe("interactive");
    });

    it("accepts both pre and post observe", () => {
      const result = AgentActParamsSchema.parse({
        steps: [minStep],
        preObserve: { includeMetadata: true },
        postObserve: { includeMetadata: true, responseTier: "minimal" },
      });
      expect(result.preObserve).toBeDefined();
      expect(result.postObserve).toBeDefined();
    });

    it("works without fusion fields (backward compatible)", () => {
      const result = AgentActParamsSchema.parse({ steps: [minStep] });
      expect(result.preObserve).toBeUndefined();
      expect(result.postObserve).toBeUndefined();
    });
  });

  describe("AgentActResultSchema — fusion fields", () => {
    const minStepResult = { step: 0, success: true, duration: 50 };
    const minResult = {
      success: true,
      completed: 1,
      total: 1,
      results: [minStepResult],
      duration: 100,
    };
    const viewport = { width: 1280, height: 720 };

    it("accepts result with pre/post observations", () => {
      const result = AgentActResultSchema.parse({
        ...minResult,
        preObservation: { metadata: { url: "https://example.com", title: "Before", viewport } },
        postObservation: { metadata: { url: "https://example.com", title: "After", viewport } },
      });
      expect(result.preObservation).toBeDefined();
      expect(result.postObservation).toBeDefined();
    });

    it("works without fusion fields (backward compatible)", () => {
      const result = AgentActResultSchema.parse(minResult);
      expect(result.preObservation).toBeUndefined();
      expect(result.postObservation).toBeUndefined();
    });
  });

  describe("PageNavigateParamsSchema — fusion fields", () => {
    it("accepts observe param for fused navigate+observe", () => {
      const result = PageNavigateParamsSchema.parse({
        url: "https://example.com",
        observe: { includeMetadata: true, includeInteractiveElements: true, maxElements: 50 },
      });
      expect(result.observe).toBeDefined();
      expect(result.observe?.maxElements).toBe(50);
    });

    it("works without observe (backward compatible)", () => {
      const result = PageNavigateParamsSchema.parse({
        url: "https://example.com",
      });
      expect(result.observe).toBeUndefined();
    });
  });

  describe("PageNavigateResultSchema — fusion fields", () => {
    it("accepts result with observation", () => {
      const result = PageNavigateResultSchema.parse({
        url: "https://example.com",
        status: 200,
        headers: {},
        observation: {
          metadata: { url: "https://example.com", title: "Test", viewport: { width: 1280, height: 720 } },
          interactiveElements: [],
        },
      });
      expect(result.observation).toBeDefined();
    });

    it("works without observation (backward compatible)", () => {
      const result = PageNavigateResultSchema.parse({
        url: "https://example.com",
        status: 200,
        headers: {},
      });
      expect(result.observation).toBeUndefined();
    });
  });
});
