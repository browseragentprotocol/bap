import { describe, it, expect } from "vitest";
import { buildUSEID } from "../builder.js";
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

const pageUrl = "https://example.com/products/123";

// ── Tests ───────────────────────────────────────────────────────────────────

describe("buildUSEID", () => {
  it("should build a valid USEIDSignature from snapshot data", () => {
    const sig = buildUSEID({
      domSnapshot: makeDOMSnapshot(null),
      accessibilitySnapshot: makeAXSnapshot(axTree),
      elementIndex: 0,
      pageUrl,
    });

    expect(sig.version).toBe(1);
    expect(sig.semantic.role).toBe("button");
    expect(sig.semantic.accessibleName).toBe("submit");
    expect(sig.structure).toBeDefined();
    expect(sig.spatial).toBeDefined();
    expect(sig.stability).toBeDefined();
    expect(sig.hash).toBeDefined();
    expect(typeof sig.hash).toBe("string");
    expect(sig.hash.length).toBe(64);
  });

  it("should produce deterministic hash for same input", () => {
    const opts = {
      domSnapshot: makeDOMSnapshot(null),
      accessibilitySnapshot: makeAXSnapshot(axTree),
      elementIndex: 0,
      pageUrl,
    };

    const sig1 = buildUSEID(opts);
    const sig2 = buildUSEID(opts);

    expect(sig1.hash).toBe(sig2.hash);
  });

  it("should extract origin and pagePath from URL correctly", () => {
    const sig = buildUSEID({
      domSnapshot: makeDOMSnapshot(null),
      accessibilitySnapshot: makeAXSnapshot(axTree),
      elementIndex: 0,
      pageUrl: "https://shop.example.com/products/123?ref=home#details",
    });

    expect(sig.origin).toBe("https://shop.example.com");
    expect(sig.pagePath).toBe("/products/123");
  });

  it("should throw RangeError for negative elementIndex", () => {
    expect(() =>
      buildUSEID({
        domSnapshot: makeDOMSnapshot(null),
        accessibilitySnapshot: makeAXSnapshot(axTree),
        elementIndex: -1,
        pageUrl,
      })
    ).toThrow(RangeError);
  });

  it("should throw RangeError for elementIndex beyond element count", () => {
    expect(() =>
      buildUSEID({
        domSnapshot: makeDOMSnapshot(null),
        accessibilitySnapshot: makeAXSnapshot(axTree),
        elementIndex: 100,
        pageUrl,
      })
    ).toThrow(RangeError);
  });

  it("should preserve framePath in signature", () => {
    const framePath = [
      { url: "https://example.com/frame", index: 0 },
      { url: "https://example.com/nested", index: 1 },
    ];

    const sig = buildUSEID({
      domSnapshot: makeDOMSnapshot(null),
      accessibilitySnapshot: makeAXSnapshot(axTree),
      elementIndex: 0,
      pageUrl,
      framePath,
    });

    expect(sig.framePath).toEqual(framePath);
  });

  it("should compute confidence reflecting available evidence", () => {
    const sig = buildUSEID({
      domSnapshot: makeDOMSnapshot(null),
      accessibilitySnapshot: makeAXSnapshot(axTree),
      elementIndex: 0,
      pageUrl,
    });

    // With name + role at minimum, confidence should be > 0
    expect(sig.stability.confidence).toBeGreaterThan(0);
    expect(sig.stability.confidence).toBeLessThanOrEqual(1);
  });

  it("should build different signatures for different elements", () => {
    const sig0 = buildUSEID({
      domSnapshot: makeDOMSnapshot(null),
      accessibilitySnapshot: makeAXSnapshot(axTree),
      elementIndex: 0,
      pageUrl,
    });
    const sig1 = buildUSEID({
      domSnapshot: makeDOMSnapshot(null),
      accessibilitySnapshot: makeAXSnapshot(axTree),
      elementIndex: 1,
      pageUrl,
    });

    expect(sig0.hash).not.toBe(sig1.hash);
    expect(sig0.semantic.accessibleName).not.toBe(sig1.semantic.accessibleName);
  });

  it("should set sibling tokens from adjacent elements", () => {
    const sig = buildUSEID({
      domSnapshot: makeDOMSnapshot(null),
      accessibilitySnapshot: makeAXSnapshot(axTree),
      elementIndex: 0,
      pageUrl,
    });

    // "Submit" button should have "Cancel" as sibling
    expect(sig.structure.siblingTokens.length).toBeGreaterThan(0);
  });
});
