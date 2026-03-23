import { describe, it, expect } from "vitest";
import {
  USEIDSignatureSchema,
  USEIDConfigSchema,
  ResolveResultSchema,
  CandidateResultSchema,
  FramePathEntrySchema,
  SemanticRegionSchema,
} from "../types.js";

const validSignature = {
  version: 1,
  origin: "https://example.com",
  pagePath: "/products/123",
  semantic: {
    role: "button",
    accessibleName: "add to cart",
  },
  structure: {
    ancestorRoles: ["main", "section"],
    ancestorTags: ["main", "div"],
    siblingTokens: ["remove", "save"],
    domDepth: 4,
  },
  spatial: {
    bbox: { x: 100, y: 200, w: 150, h: 40 },
    viewportRelative: { top: 0.26, left: 0.1 },
    region: "main",
  },
  stability: { confidence: 0.92 },
  hash: "abc123def456",
};

describe("USEIDSignatureSchema", () => {
  it("parses a valid signature", () => {
    const result = USEIDSignatureSchema.safeParse(validSignature);
    expect(result.success).toBe(true);
  });

  it("round-trips through parse", () => {
    const parsed = USEIDSignatureSchema.parse(validSignature);
    expect(parsed.version).toBe(1);
    expect(parsed.origin).toBe("https://example.com");
    expect(parsed.semantic.role).toBe("button");
    expect(parsed.spatial.region).toBe("main");
  });

  it("accepts optional fields missing", () => {
    const minimal = {
      ...validSignature,
      framePath: undefined,
      semantic: { role: "button", accessibleName: "ok" },
    };
    const result = USEIDSignatureSchema.safeParse(minimal);
    expect(result.success).toBe(true);
  });

  it("accepts framePath when present", () => {
    const withFrame = {
      ...validSignature,
      framePath: [{ url: "https://example.com/frame", index: 0 }],
    };
    const result = USEIDSignatureSchema.safeParse(withFrame);
    expect(result.success).toBe(true);
  });

  it("rejects wrong version", () => {
    const bad = { ...validSignature, version: 2 };
    const result = USEIDSignatureSchema.safeParse(bad);
    expect(result.success).toBe(false);
  });

  it("rejects missing required fields", () => {
    const bad = { version: 1, origin: "https://example.com" };
    const result = USEIDSignatureSchema.safeParse(bad);
    expect(result.success).toBe(false);
  });

  it("rejects invalid region", () => {
    const bad = {
      ...validSignature,
      spatial: { ...validSignature.spatial, region: "invalid" },
    };
    const result = USEIDSignatureSchema.safeParse(bad);
    expect(result.success).toBe(false);
  });
});

describe("USEIDConfigSchema", () => {
  it("uses defaults when empty", () => {
    const config = USEIDConfigSchema.parse({});
    expect(config.threshold).toBe(0.85);
    expect(config.marginConstraint).toBe(0.1);
    expect(config.weights.semantic).toBe(0.5);
  });

  it("accepts partial overrides", () => {
    const config = USEIDConfigSchema.parse({ threshold: 0.9 });
    expect(config.threshold).toBe(0.9);
    expect(config.marginConstraint).toBe(0.1); // default preserved
  });

  it("rejects threshold out of range", () => {
    const result = USEIDConfigSchema.safeParse({ threshold: 1.5 });
    expect(result.success).toBe(false);
  });
});

describe("ResolveResultSchema", () => {
  it("parses resolved result", () => {
    const result = ResolveResultSchema.safeParse({
      resolved: true,
      selectorHint: 'role=button[name="ok"]',
      candidateIndex: 0,
      confidence: 0.95,
      explanation: "Matched",
    });
    expect(result.success).toBe(true);
  });

  it("parses abstention result", () => {
    const result = ResolveResultSchema.safeParse({
      resolved: false,
      candidates: [],
      explanation: "No match",
      abstentionReason: "below_threshold",
    });
    expect(result.success).toBe(true);
  });
});

describe("CandidateResultSchema", () => {
  it("parses valid candidate", () => {
    const result = CandidateResultSchema.safeParse({
      candidateIndex: 0,
      selectorHint: 'role=button[name="ok"]',
      confidence: 0.9,
      scores: { semantic: 0.95, structural: 0.8, spatial: 0.7 },
      role: "button",
      accessibleName: "ok",
    });
    expect(result.success).toBe(true);
  });
});

describe("FramePathEntrySchema", () => {
  it("parses valid entry", () => {
    const result = FramePathEntrySchema.safeParse({
      url: "https://example.com/frame",
      index: 0,
    });
    expect(result.success).toBe(true);
  });
});

describe("SemanticRegionSchema", () => {
  it("accepts valid regions", () => {
    for (const r of ["header", "main", "footer", "nav", "aside", "unknown"]) {
      expect(SemanticRegionSchema.safeParse(r).success).toBe(true);
    }
  });

  it("rejects invalid region", () => {
    expect(SemanticRegionSchema.safeParse("sidebar").success).toBe(false);
  });
});
