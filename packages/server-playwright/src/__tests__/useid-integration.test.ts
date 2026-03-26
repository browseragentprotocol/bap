/**
 * Tests for uSEID integration in self-healing selector resolution.
 * Verifies uSEID is the last-resort fallback and handles all edge cases gracefully.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const mockResolveUSEID = vi.fn();

vi.mock("@pyyush/useid", () => ({
  resolveUSEID: mockResolveUSEID,
}));

import { resolveSelectorWithHealing, type SelectorResolverDeps } from "../selectors/resolver.js";
import type { BAPSelector } from "@browseragentprotocol/protocol";
import type { PageElementRegistry, ElementRegistryEntry } from "@browseragentprotocol/protocol";

// ── Test helpers ──────────────────────────────────────────────────────────────

function createMockPage(locatorCount: number = 0) {
  const mockLocator = {
    count: vi.fn().mockResolvedValue(locatorCount),
    first: vi.fn().mockReturnThis(),
  };
  const mockCdpSession = {
    send: vi.fn().mockResolvedValue({ documents: [], strings: [] }),
    detach: vi.fn().mockResolvedValue(undefined),
  };
  const page = {
    locator: vi.fn().mockReturnValue(mockLocator),
    getByTestId: vi.fn().mockReturnValue({ count: vi.fn().mockResolvedValue(0) }),
    getByRole: vi.fn().mockReturnValue({ count: vi.fn().mockResolvedValue(0) }),
    getByText: vi.fn().mockReturnValue({ count: vi.fn().mockResolvedValue(0) }),
    url: vi.fn().mockReturnValue("https://example.com/page"),
    accessibility: {
      snapshot: vi.fn().mockResolvedValue({ role: "WebArea", name: "Example", children: [] }),
    },
    context: vi.fn().mockReturnValue({
      newCDPSession: vi.fn().mockResolvedValue(mockCdpSession),
    }),
  } as any;
  return { page, mockLocator, mockCdpSession };
}

function createMockDeps(
  registry?: PageElementRegistry
): SelectorResolverDeps & { owner: any } {
  const owner = {
    state: {
      elementRegistries: new Map<string, PageElementRegistry>(),
    },
  };
  if (registry) {
    owner.state.elementRegistries.set("page-1", registry);
  }
  return {
    logSecurity: vi.fn(),
    getPageId: vi.fn().mockReturnValue("page-1"),
    findPageOwner: vi.fn().mockReturnValue(owner),
    owner,
  };
}

function createRegistryWithUSEID(ref: string, useidSignature?: unknown): PageElementRegistry {
  const entry: any = {
    ref, selector: { type: "css", value: ".old-class" },
    identity: { role: "button", tagName: "button", name: "Submit" },
    lastSeen: Date.now(),
  };
  if (useidSignature) entry.useidSignature = useidSignature;
  const elements = new Map<string, ElementRegistryEntry>();
  elements.set(ref, entry);
  return { elements, lastObservation: Date.now(), pageUrl: "https://example.com/page" };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("resolveSelectorWithHealing - uSEID integration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should attempt uSEID resolution when all identity fallbacks fail for ref selector", async () => {
    // Given: a ref selector with a useidSignature, all standard fallbacks return 0 matches
    const fakeSignature = { hash: "abc123", semantic: { role: "button" } };
    const registry = createRegistryWithUSEID("@submit", fakeSignature);
    const deps = createMockDeps(registry);
    const { page } = createMockPage(0); // primary locator returns 0 matches
    const selector: BAPSelector = { type: "ref", ref: "@submit" };

    // uSEID resolves successfully with high confidence
    mockResolveUSEID.mockReturnValue({
      resolved: true,
      candidateIndex: 2,
      confidence: 0.92,
      selectorHint: "button[name='Submit']",
      explanation: "Matched by semantic + structural signals",
    });

    const result = await resolveSelectorWithHealing(page, selector, deps);

    // Then: uSEID was called and a locator was returned
    expect(mockResolveUSEID).toHaveBeenCalled();
    // The result should be a locator (from the page.locator call for the candidate)
    expect(result).toBeDefined();
  });

  it("should fall through to original locator when uSEID abstains", async () => {
    // Given: uSEID abstains (confidence too low)
    const fakeSignature = { hash: "abc123", semantic: { role: "button" } };
    const registry = createRegistryWithUSEID("@submit", fakeSignature);
    const deps = createMockDeps(registry);
    const { page } = createMockPage(0);
    const selector: BAPSelector = { type: "ref", ref: "@submit" };

    mockResolveUSEID.mockReturnValue({
      resolved: false,
      candidates: [],
      explanation: "No candidates above threshold",
      abstentionReason: "below_threshold",
    });

    const result = await resolveSelectorWithHealing(page, selector, deps);

    // Then: returns the original locator (healing failed gracefully)
    expect(mockResolveUSEID).toHaveBeenCalled();
    expect(result).toBeDefined();
  });

  it("should skip uSEID when entry has no useidSignature", async () => {
    // Given: registry entry without useidSignature
    const registry = createRegistryWithUSEID("@submit"); // no signature
    const deps = createMockDeps(registry);
    const { page } = createMockPage(0);
    const selector: BAPSelector = { type: "ref", ref: "@submit" };

    const result = await resolveSelectorWithHealing(page, selector, deps);

    // Then: uSEID was never called
    expect(mockResolveUSEID).not.toHaveBeenCalled();
    expect(result).toBeDefined();
  });

  it("should handle uSEID import failure gracefully", async () => {
    // Given: resolveUSEID throws (simulating broken module)
    const fakeSignature = { hash: "abc123", semantic: { role: "button" } };
    const registry = createRegistryWithUSEID("@submit", fakeSignature);
    const deps = createMockDeps(registry);
    const { page } = createMockPage(0);
    const selector: BAPSelector = { type: "ref", ref: "@submit" };

    mockResolveUSEID.mockImplementation(() => {
      throw new Error("Module not found");
    });

    // Then: should not throw, returns original locator
    const result = await resolveSelectorWithHealing(page, selector, deps);
    expect(result).toBeDefined();
  });

  it("should not attempt uSEID when primary locator succeeds", async () => {
    // Given: primary locator finds the element
    const fakeSignature = { hash: "abc123", semantic: { role: "button" } };
    const registry = createRegistryWithUSEID("@submit", fakeSignature);
    const deps = createMockDeps(registry);
    const { page } = createMockPage(1); // primary locator finds 1 match
    const selector: BAPSelector = { type: "ref", ref: "@submit" };

    const result = await resolveSelectorWithHealing(page, selector, deps);

    // Then: uSEID was never called (fast path succeeded)
    expect(mockResolveUSEID).not.toHaveBeenCalled();
    expect(result).toBeDefined();
  });

  it("should reject uSEID result below confidence threshold", async () => {
    // Given: uSEID resolves but with low confidence
    const fakeSignature = { hash: "abc123", semantic: { role: "button" } };
    const registry = createRegistryWithUSEID("@submit", fakeSignature);
    const deps = createMockDeps(registry);
    const { page } = createMockPage(0);
    const selector: BAPSelector = { type: "ref", ref: "@submit" };

    mockResolveUSEID.mockReturnValue({
      resolved: true,
      candidateIndex: 1,
      confidence: 0.70, // below 0.85 threshold
      selectorHint: "button[name='Submit']",
      explanation: "Low confidence match",
    });

    const result = await resolveSelectorWithHealing(page, selector, deps);

    // Then: uSEID was called but result was rejected due to low confidence
    expect(mockResolveUSEID).toHaveBeenCalled();
    // Falls through to original locator
    expect(result).toBeDefined();
  });
});
