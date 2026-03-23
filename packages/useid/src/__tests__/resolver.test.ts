import { describe, it, expect } from "vitest";
import { resolveUSEID, compareUSEID, explainResolution, redactUSEID } from "../resolver.js";
import { buildUSEID } from "../builder.js";
import type { USEIDSignature, ResolveResult } from "../types.js";
import { USEIDSignatureSchema } from "../types.js";
import type { DOMSnapshotResult, AccessibilitySnapshotResult } from "@browseragentprotocol/dbar";

// ── Helpers ─────────────────────────────────────────────────────────────────

function makeAXSnapshot(tree: unknown): AccessibilitySnapshotResult {
  return { tree, hash: "test", serialized: "{}" };
}

function makeDOMSnapshot(snapshot: unknown): DOMSnapshotResult {
  return { snapshot, hash: "test", serialized: "{}" };
}

const axTree = {
  role: "WebArea",
  name: "Page",
  children: [
    { role: "button", name: "Submit" },
    { role: "button", name: "Cancel" },
  ],
};

const pageUrl = "https://example.com/page";

function makeSignature(overrides: Partial<USEIDSignature> = {}): USEIDSignature {
  return {
    version: 1,
    origin: "https://example.com",
    pagePath: "/page",
    semantic: {
      role: "button",
      accessibleName: "Submit",
    },
    structure: {
      ancestorRoles: ["WebArea"],
      ancestorTags: [],
      siblingTokens: ["cancel"],
      domDepth: 1,
    },
    spatial: {
      bbox: { x: 0, y: 0, w: 0, h: 0 },
      viewportRelative: { top: 0, left: 0 },
      region: "unknown",
    },
    stability: { confidence: 0.7 },
    hash: "abc123",
    ...overrides,
  };
}

// ── resolveUSEID ────────────────────────────────────────────────────────────

describe("resolveUSEID", () => {
  it("should resolve a signature against the same snapshot it was built from", () => {
    const domSnapshot = makeDOMSnapshot(null);
    const accessibilitySnapshot = makeAXSnapshot(axTree);

    // Build signature for the first button ("Submit" at index 0)
    const signature = buildUSEID({
      domSnapshot,
      accessibilitySnapshot,
      elementIndex: 0,
      pageUrl,
    });

    // Resolve against same snapshots with a low threshold since
    // elements from a minimal a11y tree lack spatial data, reducing confidence
    const result = resolveUSEID({
      signature,
      domSnapshot,
      accessibilitySnapshot,
      pageUrl,
      config: { threshold: 0.3 },
    });

    // Should resolve successfully since it's the exact same page state
    expect(result.resolved).toBe(true);
    if (result.resolved) {
      expect(result.confidence).toBeGreaterThan(0.2);
      expect(result.selectorHint).toContain("button");
    }
  });

  it("should abstain when page URL origin differs", () => {
    const domSnapshot = makeDOMSnapshot(null);
    const accessibilitySnapshot = makeAXSnapshot(axTree);

    const signature = buildUSEID({
      domSnapshot,
      accessibilitySnapshot,
      elementIndex: 0,
      pageUrl,
    });

    const result = resolveUSEID({
      signature,
      domSnapshot,
      accessibilitySnapshot,
      pageUrl: "https://other.com/page",
    });

    expect(result.resolved).toBe(false);
    if (!result.resolved) {
      expect(result.abstentionReason).toBe("binding_mismatch");
    }
  });
});

// ── compareUSEID ────────────────────────────────────────────────────────────

describe("compareUSEID", () => {
  it("should return 1 for identical signatures", () => {
    const sig = makeSignature();
    expect(compareUSEID(sig, sig)).toBe(1);
  });

  it("should return 0 when origins differ", () => {
    const a = makeSignature({ hash: "hash-a", origin: "https://a.com" });
    const b = makeSignature({ hash: "hash-b", origin: "https://b.com" });
    expect(compareUSEID(a, b)).toBe(0);
  });

  it("should return 0 when page paths differ", () => {
    const a = makeSignature({ hash: "hash-a", pagePath: "/a" });
    const b = makeSignature({ hash: "hash-b", pagePath: "/b" });
    expect(compareUSEID(a, b)).toBe(0);
  });

  it("should return 0 when roles differ", () => {
    const a = makeSignature({
      hash: "hash-a",
      semantic: { role: "button", accessibleName: "Submit" },
    });
    const b = makeSignature({
      hash: "hash-b",
      semantic: { role: "link", accessibleName: "Submit" },
    });
    expect(compareUSEID(a, b)).toBe(0);
  });

  it("should return 0.5 when same role but different name", () => {
    const a = makeSignature({
      hash: "hash-a",
      semantic: { role: "button", accessibleName: "Submit" },
    });
    const b = makeSignature({
      hash: "hash-b",
      semantic: { role: "button", accessibleName: "Cancel" },
    });
    expect(compareUSEID(a, b)).toBe(0.5);
  });

  it("should return 1 when names differ only by case/whitespace", () => {
    const a = makeSignature({
      hash: "hash-a",
      semantic: { role: "button", accessibleName: "Submit Form" },
    });
    const b = makeSignature({
      hash: "hash-b",
      semantic: { role: "button", accessibleName: "submit  form" },
    });
    expect(compareUSEID(a, b)).toBe(1);
  });
});

// ── explainResolution ───────────────────────────────────────────────────────

describe("explainResolution", () => {
  it("should include selector hint for resolved result", () => {
    const result: ResolveResult = {
      resolved: true,
      selectorHint: 'role=button[name="submit"]',
      candidateIndex: 0,
      confidence: 0.95,
      explanation: 'Matched button[name="Submit"] with confidence 0.950',
    };

    const explanation = explainResolution(result);
    expect(explanation).toContain("role=button");
    expect(explanation).toContain("0.950");
  });

  it("should include abstention reason for unresolved result", () => {
    const result: ResolveResult = {
      resolved: false,
      candidates: [
        {
          candidateIndex: 0,
          selectorHint: 'role=button[name="submit"]',
          confidence: 0.5,
          scores: { semantic: 0.6, structural: 0.4, spatial: 0.3 },
          role: "button",
          accessibleName: "Submit",
        },
      ],
      explanation: "Top candidate confidence 0.500 is below threshold 0.850",
      abstentionReason: "below_threshold",
    };

    const explanation = explainResolution(result);
    expect(explanation).toContain("below_threshold");
    expect(explanation).toContain("button");
  });

  it("should handle unresolved result with no candidates", () => {
    const result: ResolveResult = {
      resolved: false,
      candidates: [],
      explanation: "No candidate elements found matching the signature role",
      abstentionReason: "no_candidates",
    };

    const explanation = explainResolution(result);
    expect(explanation).toContain("no_candidates");
  });
});

// ── redactUSEID ─────────────────────────────────────────────────────────────

describe("redactUSEID", () => {
  it("should produce output that parses as valid USEIDSignature schema", () => {
    const sig = makeSignature();
    const redacted = redactUSEID(sig);
    const parsed = USEIDSignatureSchema.safeParse(redacted);
    expect(parsed.success).toBe(true);
  });

  it("should hash the accessible name", () => {
    const sig = makeSignature({ semantic: { role: "button", accessibleName: "Submit" } });
    const redacted = redactUSEID(sig);
    expect(redacted.semantic.accessibleName).toMatch(/^\[redacted:[a-f0-9]{16}\]$/);
    expect(redacted.semantic.accessibleName).not.toContain("Submit");
  });

  it("should strip sibling tokens", () => {
    const sig = makeSignature({
      structure: {
        ancestorRoles: ["main"],
        ancestorTags: ["main"],
        siblingTokens: ["cancel", "reset"],
        domDepth: 2,
      },
    });
    const redacted = redactUSEID(sig);
    expect(redacted.structure.siblingTokens).toEqual([]);
  });

  it("should strip form association", () => {
    const sig = makeSignature({
      structure: {
        ancestorRoles: ["main"],
        ancestorTags: ["main"],
        siblingTokens: [],
        formAssociation: "Email Address",
        domDepth: 2,
      },
    });
    const redacted = redactUSEID(sig);
    expect(redacted.structure.formAssociation).toBeUndefined();
  });

  it("should produce deterministic hash for same input", () => {
    const sig = makeSignature();
    const r1 = redactUSEID(sig);
    const r2 = redactUSEID(sig);
    expect(r1.hash).toBe(r2.hash);
    expect(r1.semantic.accessibleName).toBe(r2.semantic.accessibleName);
  });

  it("should change the hash from original", () => {
    const sig = makeSignature();
    const redacted = redactUSEID(sig);
    expect(redacted.hash).not.toBe(sig.hash);
  });

  it("should redact accessible description when present", () => {
    const sig = makeSignature({
      semantic: {
        role: "button",
        accessibleName: "Submit",
        accessibleDescription: "Click to submit the form",
      },
    });
    const redacted = redactUSEID(sig);
    expect(redacted.semantic.accessibleDescription).toBe("[redacted]");
  });

  it("should preserve non-PII fields", () => {
    const sig = makeSignature();
    const redacted = redactUSEID(sig);
    expect(redacted.version).toBe(sig.version);
    expect(redacted.origin).toBe(sig.origin);
    expect(redacted.pagePath).toBe(sig.pagePath);
    expect(redacted.semantic.role).toBe(sig.semantic.role);
    expect(redacted.spatial).toEqual(sig.spatial);
    expect(redacted.structure.ancestorRoles).toEqual(sig.structure.ancestorRoles);
  });
});
