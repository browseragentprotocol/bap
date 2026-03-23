import { describe, it, expect, vi } from "vitest";
import { createHash } from "node:crypto";
import { captureDOMSnapshot } from "../snapshot/dom.js";
import { captureAccessibilitySnapshot } from "../snapshot/accessibility.js";
import { captureScreenshot } from "../snapshot/screenshot.js";
import { captureStorageState, restoreStorageState } from "../snapshot/state.js";
import type { InitialState } from "../capsule/types.js";

// -- DOM snapshot tests --

function createMockCDPSessionForDOM(snapshotData: unknown) {
  return {
    send: vi.fn().mockImplementation((method: string) => {
      if (method === "DOMSnapshot.enable") return Promise.resolve();
      if (method === "DOMSnapshot.captureSnapshot") return Promise.resolve(snapshotData);
      return Promise.resolve();
    }),
  };
}

describe("captureDOMSnapshot", () => {
  it("shouldEnableDOMSnapshotBeforeCapture", async () => {
    // Given a CDP session with a trivial snapshot
    const cdp = createMockCDPSessionForDOM({ documents: [], strings: [] });

    // When capturing
    await captureDOMSnapshot(cdp as any);

    // Then DOMSnapshot.enable is called first
    expect(cdp.send).toHaveBeenCalledWith("DOMSnapshot.enable");
  });

  it("shouldReturnSnapshotWithDeterministicHash", async () => {
    // Given a CDP session returning a known snapshot
    const data = { documents: [{ nodes: [1, 2] }], strings: ["a", "b"] };
    const cdp = createMockCDPSessionForDOM(data);

    // When capturing
    const result = await captureDOMSnapshot(cdp as any);

    // Then the hash is a valid SHA-256 hex string
    expect(result.hash).toMatch(/^[a-f0-9]{64}$/);
    expect(result.snapshot).toEqual(data);

    // And the hash matches manual computation of the serialized form
    const expectedHash = createHash("sha256").update(result.serialized).digest("hex");
    expect(result.hash).toBe(expectedHash);
  });

  it("shouldProduceSameHashForSameData", async () => {
    // Given two CDP sessions returning identical data
    const data = { zebra: 1, alpha: 2 };
    const cdp1 = createMockCDPSessionForDOM(data);
    const cdp2 = createMockCDPSessionForDOM({ zebra: 1, alpha: 2 });

    // When capturing both
    const r1 = await captureDOMSnapshot(cdp1 as any);
    const r2 = await captureDOMSnapshot(cdp2 as any);

    // Then hashes are identical
    expect(r1.hash).toBe(r2.hash);
  });

  it("shouldPassComputedStylesAndDOMRectsParams", async () => {
    // Given a CDP session
    const cdp = createMockCDPSessionForDOM({});

    // When capturing
    await captureDOMSnapshot(cdp as any);

    // Then captureSnapshot is called with expected params
    expect(cdp.send).toHaveBeenCalledWith("DOMSnapshot.captureSnapshot", {
      computedStyles: ["display", "visibility", "opacity", "position"],
      includePaintOrder: false,
      includeDOMRects: true,
    });
  });
});

// -- Accessibility snapshot tests --

function createMockPageForA11y(tree: unknown) {
  return {
    accessibility: {
      snapshot: vi.fn().mockResolvedValue(tree),
    },
  };
}

describe("captureAccessibilitySnapshot", () => {
  it("shouldReturnTreeWithDeterministicHash", async () => {
    // Given a page with a known accessibility tree
    const tree = { role: "WebArea", name: "", children: [{ role: "heading", name: "Hello" }] };
    const page = createMockPageForA11y(tree);

    // When capturing
    const result = await captureAccessibilitySnapshot(page as any);

    // Then hash is valid SHA-256
    expect(result.hash).toMatch(/^[a-f0-9]{64}$/);
    expect(result.tree).toEqual(tree);
  });

  it("shouldCallSnapshotWithInterestingOnlyFalse", async () => {
    // Given a page
    const page = createMockPageForA11y(null);

    // When capturing
    await captureAccessibilitySnapshot(page as any);

    // Then it requests all nodes (interestingOnly: false)
    expect(page.accessibility.snapshot).toHaveBeenCalledWith({ interestingOnly: false });
  });

  it("shouldProduceConsistentHashRegardlessOfKeyOrder", async () => {
    // Given two trees with same data but different key insertion order
    const tree1 = { role: "button", name: "Submit" };
    const tree2 = { name: "Submit", role: "button" };
    const page1 = createMockPageForA11y(tree1);
    const page2 = createMockPageForA11y(tree2);

    // When capturing both
    const r1 = await captureAccessibilitySnapshot(page1 as any);
    const r2 = await captureAccessibilitySnapshot(page2 as any);

    // Then hashes match because keys are sorted during canonicalization
    expect(r1.hash).toBe(r2.hash);
  });

  it("shouldHandleNullTree", async () => {
    // Given a page whose accessibility tree is null (empty page)
    const page = createMockPageForA11y(null);

    // When capturing
    const result = await captureAccessibilitySnapshot(page as any);

    // Then it returns a hash of "null"
    expect(result.tree).toBeNull();
    expect(result.hash).toMatch(/^[a-f0-9]{64}$/);
  });
});

// -- Screenshot tests --

function createMockPageForScreenshot(buffer: Buffer) {
  return {
    screenshot: vi.fn().mockResolvedValue(buffer),
    locator: vi.fn().mockReturnValue({ _locator: true }),
  };
}

describe("captureScreenshot", () => {
  it("shouldReturnBufferWithDeterministicHash", async () => {
    // Given a page returning known PNG bytes
    const buf = Buffer.from("fake-png-data");
    const page = createMockPageForScreenshot(buf);

    // When capturing
    const result = await captureScreenshot(page as any);

    // Then buffer and hash are returned
    expect(result.buffer).toBe(buf);
    expect(result.hash).toMatch(/^[a-f0-9]{64}$/);

    const expectedHash = createHash("sha256").update(buf).digest("hex");
    expect(result.hash).toBe(expectedHash);
  });

  it("shouldUseFullPageAndPngDefaults", async () => {
    // Given a page
    const page = createMockPageForScreenshot(Buffer.from(""));

    // When capturing with no options
    await captureScreenshot(page as any);

    // Then defaults are applied
    expect(page.screenshot).toHaveBeenCalledWith({
      fullPage: true,
      type: "png",
      scale: "css",
    });
  });

  it("shouldPassMaskLocatorsWhenMasksProvided", async () => {
    // Given a page with mask selectors
    const page = createMockPageForScreenshot(Buffer.from(""));

    // When capturing with masks
    await captureScreenshot(page as any, { masks: [".ad-banner", "#cookie-popup"] });

    // Then locator is called for each mask
    expect(page.locator).toHaveBeenCalledWith(".ad-banner");
    expect(page.locator).toHaveBeenCalledWith("#cookie-popup");

    // And screenshot receives mask array
    expect(page.screenshot).toHaveBeenCalledWith(
      expect.objectContaining({ mask: expect.any(Array) })
    );
  });

  it("shouldRespectFullPageFalseOption", async () => {
    // Given a page
    const page = createMockPageForScreenshot(Buffer.from(""));

    // When capturing with fullPage: false
    await captureScreenshot(page as any, { fullPage: false });

    // Then fullPage is false
    expect(page.screenshot).toHaveBeenCalledWith(expect.objectContaining({ fullPage: false }));
  });
});

// -- Storage state tests --

function createMockPageForStorage(storageState: any) {
  const context = {
    storageState: vi.fn().mockResolvedValue(storageState),
    addCookies: vi.fn().mockResolvedValue(undefined),
  };
  return {
    context: vi.fn().mockReturnValue(context),
    goto: vi.fn().mockResolvedValue(undefined),
    evaluate: vi.fn().mockResolvedValue(undefined),
    _context: context,
  };
}

describe("captureStorageState", () => {
  it("shouldReturnInitialStateFromBrowserContext", async () => {
    // Given a browser context with cookies and localStorage
    const storageState = {
      cookies: [
        {
          name: "sid",
          value: "abc",
          domain: ".example.com",
          path: "/",
          expires: 1800000000,
          httpOnly: true,
          secure: true,
          sameSite: "Lax",
        },
      ],
      origins: [
        {
          origin: "https://example.com",
          localStorage: [{ name: "theme", value: "dark" }],
        },
      ],
    };
    const page = createMockPageForStorage(storageState);

    // When capturing
    const result = await captureStorageState(page as any, "https://example.com");

    // Then it maps to InitialState shape
    expect(result.url).toBe("https://example.com");
    expect(result.cookies).toHaveLength(1);
    expect(result.cookies[0]!.name).toBe("sid");
    expect(result.localStorage).toHaveLength(1);
    expect(result.localStorage[0]!.entries).toHaveLength(1);
    expect(result.unsupportedState).toContain("sessionStorage");
  });

  it("shouldHandleEmptyStorageState", async () => {
    // Given an empty browser context
    const page = createMockPageForStorage({ cookies: [], origins: [] });

    // When capturing
    const result = await captureStorageState(page as any, "about:blank");

    // Then arrays are empty
    expect(result.cookies).toHaveLength(0);
    expect(result.localStorage).toHaveLength(0);
  });
});

describe("restoreStorageState", () => {
  it("shouldRestoreCookiesViaContextAddCookies", async () => {
    // Given initial state with cookies
    const state: InitialState = {
      url: "https://example.com",
      cookies: [
        {
          name: "sid",
          value: "abc",
          domain: ".example.com",
          path: "/",
          expires: 1800000000,
          httpOnly: true,
          secure: true,
          sameSite: "Lax",
        },
      ],
      localStorage: [],
      unsupportedState: [],
    };
    const page = createMockPageForStorage({ cookies: [], origins: [] });

    // When restoring
    await restoreStorageState(page as any, state);

    // Then cookies are added to context
    expect(page._context.addCookies).toHaveBeenCalledWith(
      expect.arrayContaining([expect.objectContaining({ name: "sid" })])
    );
  });

  it("shouldRestoreLocalStorageByNavigatingToOrigin", async () => {
    // Given initial state with localStorage entries
    const state: InitialState = {
      url: "https://example.com/app",
      cookies: [],
      localStorage: [
        {
          origin: "https://example.com",
          entries: [{ name: "theme", value: "dark" }],
        },
      ],
      unsupportedState: [],
    };
    const page = createMockPageForStorage({ cookies: [], origins: [] });

    // When restoring
    await restoreStorageState(page as any, state);

    // Then it navigates to the origin to set localStorage
    expect(page.goto).toHaveBeenCalledWith("https://example.com", {
      waitUntil: "domcontentloaded",
    });
    expect(page.evaluate).toHaveBeenCalled();

    // And navigates to the initial URL
    expect(page.goto).toHaveBeenCalledWith("https://example.com/app", {
      waitUntil: "domcontentloaded",
    });
  });

  it("shouldSkipNavigationForAboutBlankUrl", async () => {
    // Given initial state with about:blank URL
    const state: InitialState = {
      url: "about:blank",
      cookies: [],
      localStorage: [],
      unsupportedState: [],
    };
    const page = createMockPageForStorage({ cookies: [], origins: [] });

    // When restoring
    await restoreStorageState(page as any, state);

    // Then no navigation occurs (no cookies to add, no localStorage, no URL to navigate to)
    expect(page.goto).not.toHaveBeenCalled();
  });

  it("shouldSkipEmptyLocalStorageOrigins", async () => {
    // Given initial state with an origin that has no entries
    const state: InitialState = {
      url: "https://example.com",
      cookies: [],
      localStorage: [{ origin: "https://example.com", entries: [] }],
      unsupportedState: [],
    };
    const page = createMockPageForStorage({ cookies: [], origins: [] });

    // When restoring
    await restoreStorageState(page as any, state);

    // Then it does not navigate to set empty localStorage
    // Only the final URL navigation happens
    expect(page.goto).toHaveBeenCalledTimes(1);
    expect(page.goto).toHaveBeenCalledWith("https://example.com", {
      waitUntil: "domcontentloaded",
    });
  });
});
