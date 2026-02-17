import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import {
  generateStableRef,
  hashIdentity,
  compareIdentities,
  domInfoToIdentity,
  refToSelector,
  createElementRegistry,
  cleanupStaleEntries,
  ELEMENT_STALE_THRESHOLD,
  ELEMENT_REGISTRY_MAX_SIZE,
  type ElementRegistryEntry,
} from "../shared/element-identity.js";
import type { ElementIdentity } from "../types/agent.js";

describe("generateStableRef()", () => {
  it("prioritizes testId", () => {
    const identity: ElementIdentity = {
      testId: "submit-button",
      id: "btn-1",
      ariaLabel: "Submit form",
      role: "button",
      tagName: "BUTTON",
    };
    const ref = generateStableRef(identity);
    expect(ref).toBe("@submitbutton");
  });

  it("uses id when testId is absent", () => {
    const identity: ElementIdentity = {
      id: "my-button",
      ariaLabel: "Submit",
      role: "button",
      tagName: "BUTTON",
    };
    const ref = generateStableRef(identity);
    expect(ref).toBe("@mybutton");
  });

  it("uses ariaLabel when testId and id are absent", () => {
    const identity: ElementIdentity = {
      ariaLabel: "Submit Form",
      role: "button",
      tagName: "BUTTON",
    };
    const ref = generateStableRef(identity);
    expect(ref).toBe("@submitform");
  });

  it("generates hash-based ref when no stable identifiers", () => {
    const identity: ElementIdentity = {
      role: "button",
      tagName: "BUTTON",
      parentRole: "form",
      siblingIndex: 2,
    };
    const ref = generateStableRef(identity);
    expect(ref).toMatch(/^@e[a-z0-9]{6}$/);
  });

  it("normalizes strings (lowercase, no special chars)", () => {
    const identity: ElementIdentity = {
      testId: "My-Test_ID.123",
      role: "button",
      tagName: "BUTTON",
    };
    const ref = generateStableRef(identity);
    expect(ref).toBe("@mytestid123");
  });

  it("truncates long identifiers", () => {
    const identity: ElementIdentity = {
      testId: "this-is-a-very-long-test-id-that-should-be-truncated",
      role: "button",
      tagName: "BUTTON",
    };
    const ref = generateStableRef(identity);
    expect(ref.length).toBeLessThanOrEqual(13); // @ + 12 chars
  });

  it("handles empty strings in identifiers", () => {
    const identity: ElementIdentity = {
      testId: "",
      id: "",
      ariaLabel: "",
      role: "button",
      tagName: "BUTTON",
    };
    const ref = generateStableRef(identity);
    expect(ref).toMatch(/^@e[a-z0-9]{6}$/);
  });
});

describe("hashIdentity()", () => {
  it("produces consistent hashes for same identity", () => {
    const identity: ElementIdentity = {
      role: "button",
      name: "Submit",
      tagName: "BUTTON",
    };
    const hash1 = hashIdentity(identity);
    const hash2 = hashIdentity(identity);
    expect(hash1).toBe(hash2);
  });

  it("produces different hashes for different identities", () => {
    const identity1: ElementIdentity = {
      role: "button",
      name: "Submit",
      tagName: "BUTTON",
    };
    const identity2: ElementIdentity = {
      role: "button",
      name: "Cancel",
      tagName: "BUTTON",
    };
    const hash1 = hashIdentity(identity1);
    const hash2 = hashIdentity(identity2);
    expect(hash1).not.toBe(hash2);
  });

  it("includes all identity fields in hash", () => {
    const base: ElementIdentity = {
      role: "button",
      tagName: "BUTTON",
    };
    const withTestId: ElementIdentity = { ...base, testId: "test" };
    const withId: ElementIdentity = { ...base, id: "id" };
    const withAriaLabel: ElementIdentity = { ...base, ariaLabel: "label" };

    const hashes = [base, withTestId, withId, withAriaLabel].map(hashIdentity);
    const uniqueHashes = new Set(hashes);
    expect(uniqueHashes.size).toBe(4);
  });
});

describe("compareIdentities()", () => {
  it("returns 1 for identical identities", () => {
    const identity: ElementIdentity = {
      testId: "submit",
      id: "btn-1",
      role: "button",
      name: "Submit",
      tagName: "BUTTON",
    };
    const score = compareIdentities(identity, identity);
    expect(score).toBe(1);
  });

  it("returns high score for matching testId", () => {
    const a: ElementIdentity = {
      testId: "submit",
      role: "button",
      tagName: "BUTTON",
    };
    const b: ElementIdentity = {
      testId: "submit",
      role: "link", // Different role
      tagName: "A",
    };
    const score = compareIdentities(a, b);
    // testId match = 3 points, role mismatch = 0, tagName mismatch = 0
    // maxScore = 3 (testId) + 2 (role) + 1 (tagName) = 6
    // score = 3/6 = 0.5
    expect(score).toBeGreaterThanOrEqual(0.5);
  });

  it("returns high score for matching id", () => {
    const a: ElementIdentity = {
      id: "submit-btn",
      role: "button",
      tagName: "BUTTON",
    };
    const b: ElementIdentity = {
      id: "submit-btn",
      role: "link",
      tagName: "A",
    };
    const score = compareIdentities(a, b);
    // id match = 3 points, role mismatch = 0, tagName mismatch = 0
    // maxScore = 3 (id) + 2 (role) + 1 (tagName) = 6
    // score = 3/6 = 0.5
    expect(score).toBeGreaterThanOrEqual(0.5);
  });

  it("returns lower score for only role match", () => {
    const a: ElementIdentity = {
      role: "button",
      tagName: "BUTTON",
    };
    const b: ElementIdentity = {
      role: "button",
      tagName: "INPUT",
    };
    const score = compareIdentities(a, b);
    expect(score).toBeGreaterThan(0);
    expect(score).toBeLessThan(1);
  });

  it("returns 0 for completely different identities", () => {
    const a: ElementIdentity = {
      testId: "submit",
      id: "btn-1",
      role: "button",
      name: "Submit",
      tagName: "BUTTON",
    };
    const b: ElementIdentity = {
      testId: "cancel",
      id: "link-1",
      role: "link",
      name: "Cancel",
      tagName: "A",
    };
    const score = compareIdentities(a, b);
    expect(score).toBeLessThan(0.5);
  });

  it("handles missing optional fields", () => {
    const a: ElementIdentity = {
      role: "button",
      tagName: "BUTTON",
    };
    const b: ElementIdentity = {
      role: "button",
      tagName: "BUTTON",
      name: "Submit",
    };
    const score = compareIdentities(a, b);
    expect(score).toBeGreaterThan(0);
  });
});

describe("domInfoToIdentity()", () => {
  it("converts DOM info to ElementIdentity", () => {
    const domInfo = {
      testId: "submit",
      id: "btn-1",
      ariaLabel: "Submit form",
      role: "button",
      name: "Submit",
      tagName: "BUTTON",
      parentRole: "form",
      siblingIndex: 0,
    };
    const identity = domInfoToIdentity(domInfo);
    expect(identity).toEqual({
      testId: "submit",
      id: "btn-1",
      ariaLabel: "Submit form",
      role: "button",
      name: "Submit",
      tagName: "BUTTON",
      parentRole: "form",
      siblingIndex: 0,
    });
  });

  it("converts empty strings to undefined", () => {
    const domInfo = {
      testId: "",
      id: "",
      ariaLabel: "",
      role: "button",
      name: "",
      tagName: "BUTTON",
      parentRole: "",
    };
    const identity = domInfoToIdentity(domInfo);
    expect(identity.testId).toBeUndefined();
    expect(identity.id).toBeUndefined();
    expect(identity.ariaLabel).toBeUndefined();
    expect(identity.name).toBeUndefined();
    expect(identity.parentRole).toBeUndefined();
  });
});

describe("refToSelector()", () => {
  it("creates a ref selector from ref ID", () => {
    const selector = refToSelector("@submitBtn");
    expect(selector).toEqual({ type: "ref", ref: "@submitBtn" });
  });

  it("handles hash-based refs", () => {
    const selector = refToSelector("@e7f3a2");
    expect(selector).toEqual({ type: "ref", ref: "@e7f3a2" });
  });
});

describe("createElementRegistry()", () => {
  it("creates empty registry with URL", () => {
    const registry = createElementRegistry("https://example.com");
    expect(registry.elements).toBeInstanceOf(Map);
    expect(registry.elements.size).toBe(0);
    expect(registry.pageUrl).toBe("https://example.com");
    expect(registry.lastObservation).toBeDefined();
  });

  it("initializes lastObservation to current time", () => {
    const before = Date.now();
    const registry = createElementRegistry("https://example.com");
    const after = Date.now();
    expect(registry.lastObservation).toBeGreaterThanOrEqual(before);
    expect(registry.lastObservation).toBeLessThanOrEqual(after);
  });
});

describe("cleanupStaleEntries()", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("removes entries older than threshold", () => {
    const registry = createElementRegistry("https://example.com");
    const now = Date.now();

    // Add a fresh entry
    const freshEntry: ElementRegistryEntry = {
      ref: "@fresh",
      selector: { type: "css", value: ".fresh" },
      identity: { role: "button", tagName: "BUTTON" },
      lastSeen: now,
    };

    // Add a stale entry
    const staleEntry: ElementRegistryEntry = {
      ref: "@stale",
      selector: { type: "css", value: ".stale" },
      identity: { role: "button", tagName: "BUTTON" },
      lastSeen: now - ELEMENT_STALE_THRESHOLD - 1000,
    };

    registry.elements.set("@fresh", freshEntry);
    registry.elements.set("@stale", staleEntry);

    const removed = cleanupStaleEntries(registry);

    expect(removed).toBe(1);
    expect(registry.elements.has("@fresh")).toBe(true);
    expect(registry.elements.has("@stale")).toBe(false);
  });

  it("keeps entries within threshold", () => {
    const registry = createElementRegistry("https://example.com");
    const now = Date.now();

    const entry: ElementRegistryEntry = {
      ref: "@fresh",
      selector: { type: "css", value: ".fresh" },
      identity: { role: "button", tagName: "BUTTON" },
      lastSeen: now - ELEMENT_STALE_THRESHOLD + 1000, // Just within threshold
    };

    registry.elements.set("@fresh", entry);
    const removed = cleanupStaleEntries(registry);

    expect(removed).toBe(0);
    expect(registry.elements.has("@fresh")).toBe(true);
  });

  it("uses custom threshold when provided", () => {
    const registry = createElementRegistry("https://example.com");
    const now = Date.now();
    const customThreshold = 5000;

    const entry: ElementRegistryEntry = {
      ref: "@test",
      selector: { type: "css", value: ".test" },
      identity: { role: "button", tagName: "BUTTON" },
      lastSeen: now - customThreshold - 100,
    };

    registry.elements.set("@test", entry);
    const removed = cleanupStaleEntries(registry, customThreshold);

    expect(removed).toBe(1);
    expect(registry.elements.has("@test")).toBe(false);
  });

  it("returns 0 when no entries to remove", () => {
    const registry = createElementRegistry("https://example.com");
    const removed = cleanupStaleEntries(registry);
    expect(removed).toBe(0);
  });
});

describe("ELEMENT_STALE_THRESHOLD", () => {
  it("is 60 seconds (60000ms)", () => {
    expect(ELEMENT_STALE_THRESHOLD).toBe(60000);
  });
});

describe("ELEMENT_REGISTRY_MAX_SIZE", () => {
  it("is 2000", () => {
    expect(ELEMENT_REGISTRY_MAX_SIZE).toBe(2000);
  });
});

describe("cleanupStaleEntries() — max size enforcement", () => {
  it("evicts oldest entries when registry exceeds max size", () => {
    const registry = createElementRegistry("https://example.com");
    const now = Date.now();

    // Fill beyond max size with fresh entries (all within time threshold)
    for (let i = 0; i < ELEMENT_REGISTRY_MAX_SIZE + 100; i++) {
      const entry: ElementRegistryEntry = {
        ref: `@el${i}`,
        selector: { type: "css", value: `.el${i}` },
        identity: { role: "button", tagName: "BUTTON" },
        lastSeen: now - i, // Older entries have higher i (older lastSeen)
      };
      registry.elements.set(`@el${i}`, entry);
    }

    expect(registry.elements.size).toBe(ELEMENT_REGISTRY_MAX_SIZE + 100);

    const removed = cleanupStaleEntries(registry, ELEMENT_STALE_THRESHOLD);

    // Should have evicted 100 oldest entries
    expect(removed).toBe(100);
    expect(registry.elements.size).toBe(ELEMENT_REGISTRY_MAX_SIZE);

    // Newest entries should survive (lowest i = newest lastSeen)
    expect(registry.elements.has("@el0")).toBe(true);
    expect(registry.elements.has("@el1")).toBe(true);

    // Oldest entries should be evicted (highest i = oldest lastSeen)
    const lastIndex = ELEMENT_REGISTRY_MAX_SIZE + 99;
    expect(registry.elements.has(`@el${lastIndex}`)).toBe(false);
  });

  it("does not evict when within max size", () => {
    const registry = createElementRegistry("https://example.com");
    const now = Date.now();

    for (let i = 0; i < 10; i++) {
      const entry: ElementRegistryEntry = {
        ref: `@el${i}`,
        selector: { type: "css", value: `.el${i}` },
        identity: { role: "button", tagName: "BUTTON" },
        lastSeen: now,
      };
      registry.elements.set(`@el${i}`, entry);
    }

    const removed = cleanupStaleEntries(registry);
    expect(removed).toBe(0);
    expect(registry.elements.size).toBe(10);
  });
});
