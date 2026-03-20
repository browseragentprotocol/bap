/**
 * @fileoverview BAP selector to Playwright locator resolution
 * @module @browseragentprotocol/server-playwright/selectors/resolver
 */

import type { Page as PlaywrightPage, Locator } from "playwright";
import { type BAPSelector, type AriaRole, ErrorCodes } from "@browseragentprotocol/protocol";
import { BAPServerError } from "../errors.js";
import { validateSelectorValue } from "../security/selector-validator.js";
import type { PageOwner } from "../types.js";

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
  }

  // No healing succeeded — return original (will fail with meaningful error on use)
  return locator;
}
