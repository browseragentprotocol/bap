/**
 * @fileoverview BAP selector to Playwright locator resolution
 * @module @browseragentprotocol/server-playwright/selectors/resolver
 */

import type { Page as PlaywrightPage, Locator } from "playwright";
import { type BAPSelector, type AriaRole, ErrorCodes } from "@browseragentprotocol/protocol";
import { BAPServerError } from "../errors.js";
import { validateSelectorValue } from "../security/selector-validator.js";
import type { PageOwner, ElementRegistryEntryWithUSEID } from "../types.js";

export interface SelectorResolverDeps {
  logSecurity: (event: string, details: Record<string, unknown>) => void;
  getPageId: (page: PlaywrightPage) => string;
  findPageOwner: (pageId: string) => PageOwner | null;
}

/**
 * Resolve a BAP selector to a Playwright locator.
 */
export function resolveSelector(
  page: PlaywrightPage,
  selector: BAPSelector,
  deps: SelectorResolverDeps
): Locator {
  switch (selector.type) {
    case "css":
      validateSelectorValue(selector.value, "css", deps.logSecurity);
      return page.locator(selector.value);

    case "xpath":
      validateSelectorValue(selector.value, "xpath", deps.logSecurity);
      return page.locator(`xpath=${selector.value}`);

    case "role":
      return page.getByRole(selector.role as AriaRole, {
        name: selector.name,
        exact: selector.exact,
      });

    case "text":
      return page.getByText(selector.value, { exact: selector.exact });

    case "label":
      return page.getByLabel(selector.value, { exact: selector.exact });

    case "placeholder":
      return page.getByPlaceholder(selector.value, { exact: selector.exact });

    case "testId":
      return page.getByTestId(selector.value);

    case "semantic":
      // Semantic selectors require AI resolution — fall back to text search
      return page.getByText(selector.description);

    case "coordinates":
      // For coordinates, return body locator; action handlers use mouse.click
      return page.locator("body");

    case "ref": {
      const pageId = deps.getPageId(page);
      const owner = deps.findPageOwner(pageId);
      if (!owner) {
        throw new BAPServerError(
          ErrorCodes.ElementNotFound,
          `No client state available for ref lookup: ${selector.ref}`
        );
      }
      const registry = owner.state.elementRegistries.get(pageId);
      if (!registry) {
        throw new BAPServerError(
          ErrorCodes.ElementNotFound,
          `No element registry found for page. Call agent/observe first to populate refs.`
        );
      }
      const entry = registry.elements.get(selector.ref);
      if (!entry) {
        throw new BAPServerError(
          ErrorCodes.ElementNotFound,
          `Element ref not found: ${selector.ref}. The element may have been removed or the ref may be stale.`
        );
      }
      // Fusion 4: Use cached CSS selector for fast resolution
      if (entry.cachedCssSelector) {
        return page.locator(entry.cachedCssSelector);
      }
      // Fallback: Use the stored semantic selector
      return resolveSelector(page, entry.selector, deps);
    }

    default:
      throw new BAPServerError(
        ErrorCodes.InvalidParams,
        `Unknown selector type: ${(selector as { type: string }).type}`
      );
  }
}

/** Minimum confidence for accepting a uSEID resolution result. */
const USEID_CONFIDENCE_THRESHOLD = 0.85;

// Minimal type stubs for @pyyush/useid — avoids hard type dependency on an optional package.
// These mirror the subset of the uSEID API consumed by the resolver.
interface USEIDDOMSnapshot { snapshot: unknown; hash?: string; serialized?: string }
interface USEIDAccessibilitySnapshot { tree: unknown; hash?: string; serialized?: string }
interface USEIDResolveResolved { resolved: true; selectorHint: string; candidateIndex: number; confidence: number }
interface USEIDResolveAbstained { resolved: false; candidates: unknown[]; explanation: string; abstentionReason: string }
type USEIDResolveResult = USEIDResolveResolved | USEIDResolveAbstained;

/**
 * Self-healing selector resolution.
 * Tries the primary selector first. If it fails (0 matches), attempts
 * alternative identity signals from the element registry before erroring.
 *
 * Fallback chain for ref selectors:
 * 1. cachedCssSelector (fast path)
 * 2. stored semantic selector (text/role/testId)
 * 3. ariaLabel → getByRole(role, { name: ariaLabel })
 * 4. testId → getByTestId(testId)
 * 5. id → page.locator(`#${id}`)
 * 6. uSEID weighted matching (semantic 0.5 / structural 0.3 / spatial 0.2)
 */
export async function resolveSelectorWithHealing(
  page: PlaywrightPage,
  selector: BAPSelector,
  deps: SelectorResolverDeps
): Promise<Locator> {
  const locator = resolveSelector(page, selector, deps);

  // Only attempt healing for selectors that might go stale
  if (selector.type !== "ref" && selector.type !== "css" && selector.type !== "text") {
    return locator;
  }

  // Check if the primary locator matches anything
  try {
    const count = await locator.count();
    if (count > 0) return locator;
  } catch {
    // Locator evaluation failed — fall through to healing
  }

  // For ref selectors, try alternative identity signals from the registry
  if (selector.type === "ref") {
    const pageId = deps.getPageId(page);
    const owner = deps.findPageOwner(pageId);
    const registry = owner?.state.elementRegistries.get(pageId);
    const entry = registry?.elements.get(selector.ref);

    if (entry?.identity) {
      const { identity } = entry;

      // Try testId
      if (identity.testId) {
        const testIdLocator = page.getByTestId(identity.testId);
        try {
          if ((await testIdLocator.count()) > 0) return testIdLocator;
        } catch {
          /* continue */
        }
      }

      // Try ariaLabel + role
      if (identity.ariaLabel && identity.role) {
        const roleLocator = page.getByRole(identity.role as AriaRole, { name: identity.ariaLabel });
        try {
          if ((await roleLocator.count()) > 0) return roleLocator;
        } catch {
          /* continue */
        }
      }

      // Try id
      if (identity.id) {
        const idLocator = page.locator(`#${identity.id}`);
        try {
          if ((await idLocator.count()) > 0) return idLocator;
        } catch {
          /* continue */
        }
      }

      // Try name as text
      if (identity.name) {
        const textLocator = page.getByText(identity.name, { exact: false });
        try {
          if ((await textLocator.count()) > 0) return textLocator;
        } catch {
          /* continue */
        }
      }
    }

    // Last resort: uSEID weighted matching (semantic + structural + spatial)
    const useidLocator = await attemptUSEIDResolution(page, entry);
    if (useidLocator) return useidLocator;
  }

  // No healing succeeded — return original (will fail with meaningful error on use)
  return locator;
}

/**
 * Attempt uSEID-based element resolution as a last-resort healing strategy.
 *
 * Requires the entry to have a `useidSignature` (built during agent/observe).
 * Captures fresh DOM and accessibility snapshots, then calls resolveUSEID
 * with the stored signature. Accepts only high-confidence results (>= 0.85).
 *
 * @param page - Playwright page to resolve against
 * @param entry - Element registry entry (may have useidSignature)
 * @returns Locator if uSEID resolved with sufficient confidence, null otherwise
 */
async function attemptUSEIDResolution(
  page: PlaywrightPage,
  entry: ElementRegistryEntryWithUSEID | undefined
): Promise<Locator | null> {
  const signature = entry?.useidSignature;
  if (!signature) return null;

  try {
    // Dynamic import: @pyyush/useid is an optional dependency.
    // String indirection prevents TypeScript from resolving the module at compile time.
    const useidModule = "@pyyush/useid";
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { resolveUSEID } = await (import(useidModule) as Promise<any>) as {
      resolveUSEID: (opts: Record<string, unknown>) => USEIDResolveResult | Promise<USEIDResolveResult>;
    };

    // Snapshot capture with 5-second timeout to prevent hanging on slow pages
    const snapshots = await Promise.race([
      Promise.all([
        captureDOMSnapshot(page),
        captureA11ySnapshot(page),
      ]),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), 5000)),
    ]);
    if (!snapshots) return null; // Timed out

    const [domSnapshot, accessibilitySnapshot] = snapshots;
    if (!domSnapshot || !accessibilitySnapshot) return null;

    // resolveUSEID may be sync or async depending on the implementation
    const result = await Promise.resolve(resolveUSEID({
      signature,
      domSnapshot,
      accessibilitySnapshot,
      pageUrl: page.url(),
    }));

    if (!result.resolved) return null;
    if (result.confidence < USEID_CONFIDENCE_THRESHOLD) return null;

    return page.locator(result.selectorHint);
  } catch {
    // uSEID not installed, snapshot capture failed, or resolution threw
    return null;
  }
}

/** Capture a CDP DOMSnapshot. Returns null on non-Chromium or CDP failure. */
async function captureDOMSnapshot(page: PlaywrightPage): Promise<USEIDDOMSnapshot | null> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const cdpSession = await (page.context() as any).newCDPSession(page);
    const snapshot = await cdpSession.send("DOMSnapshot.captureSnapshot", {
      computedStyles: [],
      includeDOMRects: true,
      includePaintOrder: false,
    });
    await cdpSession.detach();
    return { snapshot };
  } catch {
    return null;
  }
}

/** Capture a Playwright accessibility snapshot. Returns null on failure. */
async function captureA11ySnapshot(page: PlaywrightPage): Promise<USEIDAccessibilitySnapshot | null> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const tree = await (page as any).accessibility.snapshot();
    return { tree };
  } catch {
    return null;
  }
}
