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
import type { ElementRegistryEntryWithUSEID } from "../types.js";

// -- Test helpers -------------------------------------------------------------

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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
  return { page, mockLocator, mockCdpSession };
}

function createMockDeps(
  registry?: PageElementRegistry
// eslint-disable-next-line @typescript-eslint/no-explicit-any
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
  const entry: ElementRegistryEntryWithUSEID = {
    selector: { type: "css", value: ".old-class" },
    identity: { role: "button", name: "Submit" },
    useidSignature,
  };
  const elements = new Map<string, ElementRegistryEntry>();
  // Cast is necessary because ElementRegistryEntry from protocol doesn't include useidSignature
  elements.set(ref, entry as unknown as ElementRegistryEntry);
  return { elements, lastObservation: Date.now(), pageUrl: "https://example.com/page" };
}

// -- Tests --------------------------------------------------------------------

describe("resolveSelectorWithHealing - uSEID integration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should use uSEID selectorHint to create locator when resolution succeeds", async () => {
    // Given: a ref selector with a useidSignature, all standard fallbacks return 0 matches
    const fakeSignature = { hash: "abc123", semantic: { role: "button" } };
    const registry = createRegistryWithUSEID("@submit", fakeSignature);
    const deps = createMockDeps(registry);
    const { page } = createMockPage(0);
    const selector: BAPSelector = { type: "ref", ref: "@submit" };

    // uSEID resolves successfully with high confidence
    mockResolveUSEID.mockReturnValue({
      resolved: true,
      candidateIndex: 2,
      confidence: 0.92,
      selectorHint: "button[name='Submit']",
    });

    // When
    await resolveSelectorWithHealing(page, selector, deps);

    // Then: uSEID was called with the stored signature and page snapshots
    expect(mockResolveUSEID).toHaveBeenCalledWith(
      expect.objectContaining({
        signature: fakeSignature,
        pageUrl: "https://example.com/page",
      })
    );
    // The resolved locator was created using the selectorHint
    expect(page.locator).toHaveBeenCalledWith("button[name='Submit']");
  });

  it("should return original locator when uSEID abstains", async () => {
    // Given: uSEID abstains (no match found)
    const fakeSignature = { hash: "abc123", semantic: { role: "button" } };
    const registry = createRegistryWithUSEID("@submit", fakeSignature);
    const deps = createMockDeps(registry);
    const { page, mockLocator } = createMockPage(0);
    const selector: BAPSelector = { type: "ref", ref: "@submit" };

    mockResolveUSEID.mockReturnValue({
      resolved: false,
      candidates: [],
      explanation: "No candidates above threshold",
      abstentionReason: "below_threshold",
    });

    // When
    const result = await resolveSelectorWithHealing(page, selector, deps);

    // Then: returns the original locator (healing failed gracefully)
    expect(mockResolveUSEID).toHaveBeenCalled();
    expect(result).toBe(mockLocator);
  });

  it("should skip uSEID when entry has no useidSignature", async () => {
    // Given: registry entry without useidSignature
    const registry = createRegistryWithUSEID("@submit"); // no signature
    const deps = createMockDeps(registry);
    const { page } = createMockPage(0);
    const selector: BAPSelector = { type: "ref", ref: "@submit" };

    await resolveSelectorWithHealing(page, selector, deps);

    // Then: uSEID was never called
    expect(mockResolveUSEID).not.toHaveBeenCalled();
  });

  it("should return original locator when uSEID import fails", async () => {
    // Given: resolveUSEID throws (simulating broken module)
    const fakeSignature = { hash: "abc123", semantic: { role: "button" } };
    const registry = createRegistryWithUSEID("@submit", fakeSignature);
    const deps = createMockDeps(registry);
    const { page, mockLocator } = createMockPage(0);
    const selector: BAPSelector = { type: "ref", ref: "@submit" };

    mockResolveUSEID.mockImplementation(() => {
      throw new Error("Module not found");
    });

    // When
    const result = await resolveSelectorWithHealing(page, selector, deps);

    // Then: should not throw, returns original locator
    expect(result).toBe(mockLocator);
  });

  it("should not attempt uSEID when primary locator succeeds", async () => {
    // Given: primary locator finds the element
    const fakeSignature = { hash: "abc123", semantic: { role: "button" } };
    const registry = createRegistryWithUSEID("@submit", fakeSignature);
    const deps = createMockDeps(registry);
    const { page, mockLocator } = createMockPage(1);
    const selector: BAPSelector = { type: "ref", ref: "@submit" };

    // When
    const result = await resolveSelectorWithHealing(page, selector, deps);

    // Then: uSEID was never called (fast path succeeded)
    expect(mockResolveUSEID).not.toHaveBeenCalled();
    expect(result).toBe(mockLocator);
  });

  it("should reject uSEID result below confidence threshold of 0.85", async () => {
    // Given: uSEID resolves but with low confidence
    const fakeSignature = { hash: "abc123", semantic: { role: "button" } };
    const registry = createRegistryWithUSEID("@submit", fakeSignature);
    const deps = createMockDeps(registry);
    const { page, mockLocator } = createMockPage(0);
    const selector: BAPSelector = { type: "ref", ref: "@submit" };

    mockResolveUSEID.mockReturnValue({
      resolved: true,
      candidateIndex: 1,
      confidence: 0.70,
      selectorHint: "button[name='Submit']",
    });

    // When
    const result = await resolveSelectorWithHealing(page, selector, deps);

    // Then: uSEID was called but result was rejected; falls back to original locator
    expect(mockResolveUSEID).toHaveBeenCalled();
    expect(result).toBe(mockLocator);
    // The selectorHint should NOT have been used to create a new locator
    // (page.locator was called once for the primary ".old-class", not for the hint)
    const locatorCalls = page.locator.mock.calls;
    expect(locatorCalls.every((call: string[]) => call[0] !== "button[name='Submit']")).toBe(true);
  });

  it("should handle async resolveUSEID result via Promise.resolve", async () => {
    // Given: resolveUSEID returns a Promise (async implementation)
    const fakeSignature = { hash: "async123" };
    const registry = createRegistryWithUSEID("@async-btn", fakeSignature);
    const deps = createMockDeps(registry);
    const { page } = createMockPage(0);
    const selector: BAPSelector = { type: "ref", ref: "@async-btn" };

    // resolveUSEID returns a Promise instead of a plain value
    mockResolveUSEID.mockResolvedValue({
      resolved: true,
      candidateIndex: 0,
      confidence: 0.95,
      selectorHint: "#async-element",
    });

    // When
    await resolveSelectorWithHealing(page, selector, deps);

    // Then: the async result was properly awaited and the locator was created
    expect(page.locator).toHaveBeenCalledWith("#async-element");
  });

  it("should return null from attemptUSEIDResolution when snapshot capture times out", async () => {
    // Given: CDP session hangs (simulated by never resolving)
    const fakeSignature = { hash: "timeout123" };
    const registry = createRegistryWithUSEID("@slow-btn", fakeSignature);
    const deps = createMockDeps(registry);
    const { page } = createMockPage(0);
    const selector: BAPSelector = { type: "ref", ref: "@slow-btn" };

    // Make CDP send hang forever
    const mockCdpSession = {
      send: vi.fn().mockReturnValue(new Promise(() => {})), // never resolves
      detach: vi.fn().mockResolvedValue(undefined),
    };
    page.context.mockReturnValue({
      newCDPSession: vi.fn().mockResolvedValue(mockCdpSession),
    });

    // When: should not hang — timeout kicks in and returns original locator
    const result = await resolveSelectorWithHealing(page, selector, deps);

    // Then: uSEID was NOT called (snapshots timed out before we could call it)
    expect(mockResolveUSEID).not.toHaveBeenCalled();
    expect(result).toBeDefined();
  }, 10000);
});
