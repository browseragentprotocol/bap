import { describe, it, expect } from "vitest";
import { checkBinding, applySafetyGate } from "../safety.js";
import type { USEIDSignature, CandidateResult } from "../types.js";

// ── Helpers ─────────────────────────────────────────────────────────────────

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
      ancestorRoles: ["main", "form"],
      ancestorTags: ["main", "form"],
      siblingTokens: ["cancel"],
      domDepth: 3,
    },
    spatial: {
      bbox: { x: 100, y: 200, w: 80, h: 40 },
      viewportRelative: { top: 0.26, left: 0.1 },
      region: "main",
    },
    stability: { confidence: 0.9 },
    hash: "abc123",
    ...overrides,
  };
}

function makeCandidate(overrides: Partial<CandidateResult> = {}): CandidateResult {
  return {
    candidateIndex: 0,
    selectorHint: 'role=button[name="submit"]',
    confidence: 0.95,
    scores: { semantic: 1.0, structural: 0.9, spatial: 0.8 },
    role: "button",
    accessibleName: "Submit",
    ...overrides,
  };
}

// ── checkBinding ────────────────────────────────────────────────────────────

describe("checkBinding", () => {
  it("should return null when origin and page path match", () => {
    const sig = makeSignature();
    const result = checkBinding(sig, "https://example.com/page");
    expect(result).toBeNull();
  });

  it("should return error when origin mismatches", () => {
    const sig = makeSignature({ origin: "https://example.com" });
    const result = checkBinding(sig, "https://other.com/page");
    expect(result).toContain("Origin mismatch");
  });

  it("should return error when page path mismatches", () => {
    const sig = makeSignature({ pagePath: "/page" });
    const result = checkBinding(sig, "https://example.com/other");
    expect(result).toContain("Page path mismatch");
  });

  it("should return error when frame path mismatches", () => {
    const sig = makeSignature({
      framePath: [{ url: "https://example.com/frame", index: 0 }],
    });
    const result = checkBinding(sig, "https://example.com/page", [
      { url: "https://example.com/different-frame", index: 0 },
    ]);
    expect(result).toContain("Frame path mismatch");
  });

  it("should return error when frame path length mismatches", () => {
    const sig = makeSignature({
      framePath: [{ url: "https://example.com/frame", index: 0 }],
    });
    const result = checkBinding(sig, "https://example.com/page");
    expect(result).toContain("Frame path mismatch");
  });

  it("should return error for invalid page URL", () => {
    const sig = makeSignature();
    const result = checkBinding(sig, "not-a-url");
    expect(result).toContain("Invalid page URL");
  });

  it("should pass when frame paths match", () => {
    const framePath = [{ url: "https://example.com/frame", index: 0 }];
    const sig = makeSignature({ framePath });
    const result = checkBinding(sig, "https://example.com/page", framePath);
    expect(result).toBeNull();
  });
});

// ── applySafetyGate ─────────────────────────────────────────────────────────

describe("applySafetyGate", () => {
  const pageUrl = "https://example.com/page";

  it("should abstain with binding_mismatch when origin differs", () => {
    const sig = makeSignature({ origin: "https://other.com" });
    const result = applySafetyGate([makeCandidate()], sig, pageUrl);
    expect(result.resolved).toBe(false);
    if (!result.resolved) {
      expect(result.abstentionReason).toBe("binding_mismatch");
    }
  });

  it("should abstain with binding_mismatch when page path differs", () => {
    const sig = makeSignature({ pagePath: "/other" });
    const result = applySafetyGate([makeCandidate()], sig, pageUrl);
    expect(result.resolved).toBe(false);
    if (!result.resolved) {
      expect(result.abstentionReason).toBe("binding_mismatch");
    }
  });

  it("should abstain with binding_mismatch when frame path differs", () => {
    const sig = makeSignature({
      framePath: [{ url: "https://example.com/frame", index: 0 }],
    });
    const result = applySafetyGate([makeCandidate()], sig, pageUrl);
    expect(result.resolved).toBe(false);
    if (!result.resolved) {
      expect(result.abstentionReason).toBe("binding_mismatch");
    }
  });

  it("should abstain with binding_mismatch for invalid page URL", () => {
    const sig = makeSignature();
    const result = applySafetyGate([makeCandidate()], sig, "not-a-url");
    expect(result.resolved).toBe(false);
    if (!result.resolved) {
      expect(result.abstentionReason).toBe("binding_mismatch");
    }
  });

  it("should abstain with no_candidates when candidates array is empty", () => {
    const sig = makeSignature();
    const result = applySafetyGate([], sig, pageUrl);
    expect(result.resolved).toBe(false);
    if (!result.resolved) {
      expect(result.abstentionReason).toBe("no_candidates");
    }
  });

  it("should abstain with below_threshold when top candidate is below threshold", () => {
    const sig = makeSignature();
    const lowCandidate = makeCandidate({ confidence: 0.5 });
    const result = applySafetyGate([lowCandidate], sig, pageUrl);
    expect(result.resolved).toBe(false);
    if (!result.resolved) {
      expect(result.abstentionReason).toBe("below_threshold");
    }
  });

  it("should abstain with ambiguous_match when two candidates are close in score", () => {
    const sig = makeSignature();
    const first = makeCandidate({ candidateIndex: 0, confidence: 0.92 });
    const second = makeCandidate({ candidateIndex: 1, confidence: 0.9 });
    // Gap is 0.02, below default margin of 0.1
    const result = applySafetyGate([first, second], sig, pageUrl);
    expect(result.resolved).toBe(false);
    if (!result.resolved) {
      expect(result.abstentionReason).toBe("ambiguous_match");
    }
  });

  it("should resolve when top candidate is above threshold with sufficient margin", () => {
    const sig = makeSignature();
    const top = makeCandidate({ candidateIndex: 0, confidence: 0.95 });
    const second = makeCandidate({ candidateIndex: 1, confidence: 0.7 });
    const result = applySafetyGate([top, second], sig, pageUrl);
    expect(result.resolved).toBe(true);
    if (result.resolved) {
      expect(result.confidence).toBe(0.95);
      expect(result.selectorHint).toBe('role=button[name="submit"]');
      expect(result.candidateIndex).toBe(0);
    }
  });

  it("should resolve when only one candidate is above threshold", () => {
    const sig = makeSignature();
    const top = makeCandidate({ confidence: 0.95 });
    const result = applySafetyGate([top], sig, pageUrl);
    expect(result.resolved).toBe(true);
  });

  it("should use custom threshold when provided", () => {
    const sig = makeSignature();
    const candidate = makeCandidate({ confidence: 0.6 });
    // Default threshold (0.85) would reject, custom (0.5) accepts
    const result = applySafetyGate([candidate], sig, pageUrl, undefined, {
      threshold: 0.5,
    });
    expect(result.resolved).toBe(true);
  });

  it("should use custom margin constraint when provided", () => {
    const sig = makeSignature();
    const first = makeCandidate({ candidateIndex: 0, confidence: 0.92 });
    const second = makeCandidate({ candidateIndex: 1, confidence: 0.9 });
    // Default margin (0.1) would reject, custom (0.01) accepts
    const result = applySafetyGate([first, second], sig, pageUrl, undefined, {
      marginConstraint: 0.01,
    });
    expect(result.resolved).toBe(true);
  });

  it("should include framePath in resolved result", () => {
    const framePath = [{ url: "https://example.com/frame", index: 0 }];
    const sig = makeSignature({ framePath });
    const top = makeCandidate({ confidence: 0.95 });
    const result = applySafetyGate([top], sig, pageUrl, framePath);
    expect(result.resolved).toBe(true);
    if (result.resolved) {
      expect(result.framePath).toEqual(framePath);
    }
  });
});
