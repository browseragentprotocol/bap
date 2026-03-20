/**
 * @fileoverview Interactive element discovery via page.evaluate
 * @module @browseragentprotocol/server-playwright/elements/interactive
 */

import type { Page as PlaywrightPage } from "playwright";
import type {
  BAPSelector,
  AriaRole,
  InteractiveElement,
  ActionHint,
  ElementIdentity,
  RefStability,
} from "@browseragentprotocol/protocol";
import {
  generateStableRef,
  compareIdentities,
  type PageElementRegistry,
} from "@browseragentprotocol/protocol";

export interface GetInteractiveElementsOptions {
  maxElements: number;
  filterRoles?: string[];
  includeBounds: boolean;
  registry?: PageElementRegistry;
  stableRefs?: boolean;
  refreshRefs?: boolean;
  includeRefHistory?: boolean;
}

type RawElement = {
  index: number;
  role: string;
  name: string | undefined;
  value: string | undefined;
  tagName: string;
  focused: boolean;
  disabled: boolean;
  actionHints: string[];
  selectorType: string;
  selectorValue: string;
  cssPath: string;
  bounds: { x: number; y: number; width: number; height: number } | undefined;
  testId?: string;
  id?: string;
  ariaLabel?: string;
  parentRole?: string;
  siblingIndex?: number;
};

/**
 * Get interactive elements with pre-computed selectors.
 * Supports stable refs that persist across observations.
 */
export async function getInteractiveElements(
  page: PlaywrightPage,
  options: GetInteractiveElementsOptions
): Promise<{ elements: InteractiveElement[]; total: number }> {
  const useStableRefs = options.stableRefs !== false && options.registry;
  const registry = options.registry;

  // This function runs in browser context where DOM types exist
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const browserFn = (opts: { includeBounds: boolean }): any[] => {
    const selectors = [
      "a[href]",
      "button",
      'input:not([type="hidden"])',
      "select",
      "textarea",
      '[role="button"]',
      '[role="link"]',
      '[role="menuitem"]',
      '[role="tab"]',
      '[role="checkbox"]',
      '[role="radio"]',
      '[role="switch"]',
      '[role="textbox"]',
      '[role="combobox"]',
      '[role="listbox"]',
      '[role="slider"]',
      '[contenteditable="true"]',
      "[onclick]",
      '[tabindex]:not([tabindex="-1"])',
    ].join(",");

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    function getCssPath(element: any): string {
      const pathParts: string[] = [];
      let current = element;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      while (current && (current as any).tagName !== "BODY") {
        let selector = current.tagName.toLowerCase();
        if (current.id) {
          selector = `#${current.id}`;
          pathParts.unshift(selector);
          break;
        }
        const parent = current.parentElement;
        if (parent) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const siblings = Array.from(parent.children).filter(
            (c: any) => c.tagName === current.tagName
          );
          if (siblings.length > 1) {
            const idx = siblings.indexOf(current) + 1;
            selector += `:nth-of-type(${idx})`;
          }
        }
        pathParts.unshift(selector);
        current = parent;
      }
      return pathParts.join(" > ");
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const doc = (globalThis as any).document;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const win = (globalThis as any).window;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const elements: any[] = Array.from(doc.querySelectorAll(selectors));

    return (
      elements
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .filter((el: any) => {
          const style = win.getComputedStyle(el);
          if (style.display === "none" || style.visibility === "hidden") return false;
          const rect = el.getBoundingClientRect();
          if (rect.width === 0 || rect.height === 0) return false;
          return true;
        })
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .map((el: any, index: number) => {
          const rect = el.getBoundingClientRect();
          const role = el.getAttribute("role") || el.tagName.toLowerCase();

          const hints: string[] = [];
          if (
            el.tagName === "A" ||
            el.tagName === "BUTTON" ||
            el.getAttribute("role") === "button"
          ) {
            hints.push("clickable");
          }
          if (
            el.tagName === "INPUT" ||
            el.tagName === "TEXTAREA" ||
            el.getAttribute("contenteditable")
          ) {
            hints.push("editable");
          }
          if (el.tagName === "SELECT") {
            hints.push("selectable");
          }
          if (el.type === "checkbox" || el.getAttribute("role") === "checkbox") {
            hints.push("checkable");
          }

          let selectorValue: string;
          let selectorType: "css" | "testId" | "role" | "text";

          const ariaLabel = el.getAttribute("aria-label");
          const text = el.textContent?.trim().slice(0, 50);
          const testIdAttr = el.getAttribute("data-testid");
          const name = el.getAttribute("name");
          const id = el.getAttribute("id");

          if (testIdAttr) {
            selectorType = "testId";
            selectorValue = testIdAttr;
          } else if (ariaLabel) {
            selectorType = "role";
            selectorValue = JSON.stringify({ role, name: ariaLabel });
          } else if (text && text.length > 0 && text.length < 50) {
            selectorType = "text";
            selectorValue = text;
          } else if (id) {
            selectorType = "css";
            selectorValue = `#${id}`;
          } else if (name) {
            selectorType = "css";
            selectorValue = `[name="${name}"]`;
          } else {
            selectorType = "css";
            selectorValue = getCssPath(el);
          }

          const parent = el.parentElement;
          let parentRole: string | undefined;
          if (parent) {
            parentRole = parent.getAttribute("role") || undefined;
          }

          let siblingIndex: number | undefined;
          if (parent) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const siblings = Array.from(parent.children).filter(
              (c: any) => (c.getAttribute("role") || c.tagName.toLowerCase()) === role
            );
            if (siblings.length > 1) {
              siblingIndex = siblings.indexOf(el);
            }
          }

          const cssPath = getCssPath(el);

          return {
            index,
            role,
            name: ariaLabel || text || undefined,
            value: el.value || undefined,
            tagName: el.tagName.toLowerCase(),
            focused: doc.activeElement === el,
            disabled: el.disabled || false,
            actionHints: hints,
            selectorType,
            selectorValue,
            cssPath,
            bounds: opts.includeBounds
              ? {
                  x: Math.round(rect.x),
                  y: Math.round(rect.y),
                  width: Math.round(rect.width),
                  height: Math.round(rect.height),
                }
              : undefined,
            testId: testIdAttr || undefined,
            id: id || undefined,
            ariaLabel: ariaLabel || undefined,
            parentRole,
            siblingIndex,
          };
        })
    );
  };

  const rawElements: RawElement[] = await page.evaluate(browserFn, {
    includeBounds: options.includeBounds,
  });

  const total = rawElements.length;

  let filtered = rawElements;
  if (options.filterRoles) {
    filtered = filtered.filter((el) => options.filterRoles!.includes(el.role));
  }
  filtered = filtered.slice(0, options.maxElements);

  const elements: InteractiveElement[] = filtered.map((el, i) => {
    let selector: BAPSelector;

    if (el.selectorType === "testId") {
      selector = { type: "testId", value: el.selectorValue };
    } else if (el.selectorType === "role") {
      const parsed = JSON.parse(el.selectorValue);
      selector = { type: "role", role: parsed.role as AriaRole, name: parsed.name };
    } else if (el.selectorType === "text") {
      selector = { type: "text", value: el.selectorValue };
    } else {
      selector = { type: "css", value: el.selectorValue };
    }

    let ref: string;
    let stability: RefStability | undefined;
    let previousRef: string | undefined;

    if (useStableRefs && registry) {
      const identity: ElementIdentity = {
        testId: el.testId,
        id: el.id,
        ariaLabel: el.ariaLabel,
        role: el.role,
        name: el.name,
        tagName: el.tagName,
        parentRole: el.parentRole,
        siblingIndex: el.siblingIndex,
      };

      ref = generateStableRef(identity);

      const existing = registry.elements.get(ref);
      if (existing) {
        const matchScore = compareIdentities(identity, existing.identity);
        if (matchScore > 0.8) {
          existing.lastSeen = Date.now();
          existing.bounds = el.bounds;
          stability = "stable";
        } else {
          ref = `${ref}_${i + 1}`;
          stability = "new";
        }
      } else {
        stability = "new";
      }

      if (options.refreshRefs && options.includeRefHistory) {
        for (const [oldRef, entry] of registry.elements) {
          if (oldRef !== ref) {
            const matchScore = compareIdentities(identity, entry.identity);
            if (matchScore > 0.8) {
              previousRef = oldRef;
              stability = "moved";
              break;
            }
          }
        }
      }

      // Fusion 4: include cached CSS selector for fast resolution
      registry.elements.set(ref, {
        ref,
        selector,
        identity,
        lastSeen: Date.now(),
        bounds: el.bounds,
        cachedCssSelector: el.cssPath || undefined,
      });
    } else {
      ref = `@e${i + 1}`;
    }

    // Build alternative selectors ordered by reliability
    const alts: BAPSelector[] = [];
    if (el.testId) {
      alts.push({ type: "testId", value: el.testId });
    }
    if (el.ariaLabel) {
      alts.push({ type: "role", role: el.role as AriaRole, name: el.ariaLabel });
    }
    if (el.id) {
      // Escape CSS special chars in id (dots, colons, brackets are valid in HTML id but not bare CSS)
      const escapedId = el.id.replace(/([^\w-])/g, "\\$1");
      alts.push({ type: "css", value: `#${escapedId}` });
    }
    if (el.name && el.name.length < 50) {
      alts.push({ type: "text", value: el.name });
    }
    if (el.cssPath) {
      alts.push({ type: "css", value: el.cssPath });
    }
    // Remove the primary selector from alternatives (avoid duplicate)
    // Compare by serialized form to handle role selectors (which have role+name, not value)
    const primaryKey = JSON.stringify(selector);
    const altSelectors = alts.filter((a) => JSON.stringify(a) !== primaryKey);

    const element: InteractiveElement = {
      ref,
      selector,
      role: el.role,
      name: el.name,
      value: el.value,
      actionHints: el.actionHints as ActionHint[],
      bounds: el.bounds,
      tagName: el.tagName,
      focused: el.focused,
      disabled: el.disabled,
      ...(altSelectors.length > 0 ? { alternativeSelectors: altSelectors } : {}),
    };

    if (useStableRefs) {
      element.stability = stability;
      if (previousRef) {
        element.previousRef = previousRef;
      }
    }

    return element;
  });

  if (registry) {
    registry.lastObservation = Date.now();
  }

  return { elements, total };
}
