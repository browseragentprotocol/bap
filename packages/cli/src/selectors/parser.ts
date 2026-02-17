/**
 * @fileoverview CLI selector parser
 *
 * Extended from packages/mcp/src/index.ts:97-163 with:
 * - e<N> positional ref support (playwright-cli compatibility)
 * - Quoted string handling: role:button:"Submit" strips quotes from name
 */

import type { BAPSelector, AriaRole } from "@browseragentprotocol/protocol";

/**
 * Strip surrounding single or double quotes from a string.
 */
export function stripQuotes(s: string): string {
  if (s.length >= 2) {
    if (
      (s[0] === '"' && s[s.length - 1] === '"') ||
      (s[0] === "'" && s[s.length - 1] === "'")
    ) {
      return s.slice(1, -1);
    }
  }
  return s;
}

/**
 * Parse a selector string into a BAPSelector object.
 *
 * Supports all BAP selector types plus playwright-cli compatible e<N> refs:
 * - e15                          -> { type: "ref", ref: "e15" }
 * - @e1                          -> { type: "ref", ref: "@e1" }
 * - role:button:"Submit"         -> { type: "role", role: "button", name: "Submit" }
 * - role:button:Submit           -> { type: "role", role: "button", name: "Submit" }
 * - text:"Sign in"              -> { type: "text", value: "Sign in" }
 * - label:"Email"               -> { type: "label", value: "Email" }
 * - placeholder:"Search..."     -> { type: "placeholder", value: "Search..." }
 * - testid:submit-btn            -> { type: "testId", value: "submit-btn" }
 * - css:.btn-primary             -> { type: "css", value: ".btn-primary" }
 * - xpath://button[@id='submit'] -> { type: "xpath", value: "//button[@id='submit']" }
 * - coords:100,200              -> { type: "coordinates", x: 100, y: 200 }
 * - #submit-btn                  -> { type: "css", value: "#submit-btn" }
 */
export function parseSelector(selector: string): BAPSelector {
  // Playwright-CLI compat: e<N> positional refs
  if (/^e\d+$/.test(selector)) {
    return { type: "ref", ref: selector };
  }

  // BAP stable refs: @e1, @submitBtn
  if (selector.startsWith("@")) {
    return { type: "ref", ref: selector };
  }

  // Ref selector: ref:@submitBtn
  if (selector.startsWith("ref:")) {
    return { type: "ref", ref: selector.slice(4) };
  }

  // Role selector: role:button:"Submit" or role:button:Submit
  if (selector.startsWith("role:")) {
    const rest = selector.slice(5);
    const colonIdx = rest.indexOf(":");
    if (colonIdx === -1) {
      return { type: "role", role: rest as AriaRole };
    }
    const role = rest.slice(0, colonIdx) as AriaRole;
    const name = stripQuotes(rest.slice(colonIdx + 1)) || undefined;
    return { type: "role", role, name };
  }

  // Text selector: text:"content" or text:content
  if (selector.startsWith("text:")) {
    return { type: "text", value: stripQuotes(selector.slice(5)) };
  }

  // Label selector: label:"Email" or label:Email
  if (selector.startsWith("label:")) {
    return { type: "label", value: stripQuotes(selector.slice(6)) };
  }

  // Placeholder selector: placeholder:"Search..."
  if (selector.startsWith("placeholder:")) {
    return { type: "placeholder", value: stripQuotes(selector.slice(12)) };
  }

  // TestId selector: testid:submit-button
  if (selector.startsWith("testid:")) {
    return { type: "testId", value: selector.slice(7) };
  }

  // CSS selector: css:.btn-primary
  if (selector.startsWith("css:")) {
    return { type: "css", value: selector.slice(4) };
  }

  // XPath selector: xpath://button[@id='submit']
  if (selector.startsWith("xpath:")) {
    return { type: "xpath", value: selector.slice(6) };
  }

  // Coordinates selector: coords:100,200
  if (selector.startsWith("coords:")) {
    const coords = selector.slice(7).split(",");
    if (coords.length >= 2 && coords[0] && coords[1]) {
      const x = parseInt(coords[0], 10);
      const y = parseInt(coords[1], 10);
      if (!isNaN(x) && !isNaN(y)) {
        return { type: "coordinates", x, y };
      }
    }
  }

  // CSS shorthand for IDs and classes
  if (selector.startsWith("#") || selector.startsWith(".")) {
    return { type: "css", value: selector };
  }

  // Default to text selector for plain strings
  return { type: "text", value: selector };
}

/**
 * Format a BAPSelector for display in CLI output.
 */
export function formatSelectorForDisplay(selector: BAPSelector): string {
  switch (selector.type) {
    case "role":
      return `role:${selector.role}${selector.name ? `:"${selector.name}"` : ""}`;
    case "text":
      return `text:"${selector.value}"`;
    case "label":
      return `label:"${selector.value}"`;
    case "testId":
      return `testId:${selector.value}`;
    case "css":
      return selector.value.startsWith("#") || selector.value.startsWith(".")
        ? selector.value
        : `css:${selector.value}`;
    case "xpath":
      return `xpath:${selector.value}`;
    case "placeholder":
      return `placeholder:"${selector.value}"`;
    case "ref":
      return selector.ref;
    case "coordinates":
      return `coords:${selector.x},${selector.y}`;
    case "semantic":
      return `semantic:${selector.description}`;
    default:
      return JSON.stringify(selector);
  }
}
