/**
 * @fileoverview Composite step parser for `bap act` syntax
 *
 * Parses step strings like:
 *   fill:role:textbox:"Email"="user@example.com"
 *   click:e15
 *   goto:https://example.com
 *   press:Enter
 *   snapshot
 */

import type { ExecutionStep, BAPSelector } from "@browseragentprotocol/protocol";
import { parseSelector, stripQuotes } from "./parser.js";

// =============================================================================
// Types
// =============================================================================

export interface ParsedStep {
  /** BAP protocol action (e.g., "action/fill", "action/click") */
  action: string;
  /** Parsed selector (for actions that target elements) */
  selector?: BAPSelector;
  /** Value for fill/type/select */
  value?: string;
  /** URL for goto */
  url?: string;
  /** Key for press */
  key?: string;
}

// =============================================================================
// Action Name Mapping
// =============================================================================

const ACTION_MAP: Record<string, string> = {
  click: "action/click",
  dblclick: "action/dblclick",
  fill: "action/fill",
  type: "action/type",
  press: "action/press",
  select: "action/select",
  check: "action/check",
  uncheck: "action/uncheck",
  hover: "action/hover",
  scroll: "action/scroll",
  goto: "page/navigate",
  back: "page/goBack",
  forward: "page/goForward",
  reload: "page/reload",
  snapshot: "observe/ariaSnapshot",
  screenshot: "observe/screenshot",
};

/** Actions that take no arguments */
const PARAMETERLESS = new Set([
  "snapshot", "screenshot", "back", "forward", "reload", "close",
]);

// =============================================================================
// Parsing
// =============================================================================

/**
 * Find the last `=` in a string that is NOT inside quotes.
 * Scans right-to-left. Returns -1 if not found.
 */
function findUnquotedEquals(s: string): number {
  let inQuote = false;
  let quoteChar = "";

  for (let i = s.length - 1; i >= 0; i--) {
    const ch = s[i]!;
    if (inQuote) {
      if (ch === quoteChar) {
        inQuote = false;
      }
    } else if (ch === '"' || ch === "'") {
      inQuote = true;
      quoteChar = ch;
    } else if (ch === "=") {
      return i;
    }
  }

  return -1;
}

/**
 * Parse a single composite step from CLI syntax.
 *
 * @param raw - The raw step string (e.g., 'fill:role:textbox:"Email"="user@example.com"')
 * @returns Parsed step with action, selector, value, url, or key
 */
export function parseCompositeStep(raw: string): ParsedStep {
  // Parameterless actions: just the action name
  if (PARAMETERLESS.has(raw)) {
    return { action: ACTION_MAP[raw] ?? raw };
  }

  // Find first colon to split action:rest
  const firstColon = raw.indexOf(":");
  if (firstColon === -1) {
    throw new Error(`Invalid step: "${raw}". Expected action:target or action:target=value`);
  }

  const actionName = raw.slice(0, firstColon);
  const rest = raw.slice(firstColon + 1);
  const action = ACTION_MAP[actionName] ?? `action/${actionName}`;

  // Special case: goto takes a URL (URLs contain colons, so no further splitting)
  if (actionName === "goto") {
    return { action, url: rest };
  }

  // Special case: press takes a key name
  if (actionName === "press") {
    return { action, key: rest };
  }

  // For fill/type/select: find the value separator (=)
  // The = that separates selector from value is the last unquoted =
  const equalsIdx = findUnquotedEquals(rest);

  if (equalsIdx !== -1) {
    const selectorStr = rest.slice(0, equalsIdx);
    const value = stripQuotes(rest.slice(equalsIdx + 1));
    return {
      action,
      selector: parseSelector(selectorStr),
      value,
    };
  }

  // No value: click, check, uncheck, hover, etc.
  return {
    action,
    selector: parseSelector(rest),
  };
}

/**
 * Parse multiple composite steps from CLI args.
 */
export function parseCompositeSteps(args: string[]): ParsedStep[] {
  return args.map(parseCompositeStep);
}

/**
 * Convert parsed steps to ExecutionStep objects for client.act().
 */
export function toExecutionSteps(steps: ParsedStep[]): ExecutionStep[] {
  return steps.map((s): ExecutionStep => {
    const step: ExecutionStep = {
      action: s.action,
      params: {},
    };

    if (s.selector) {
      step.params!.selector = s.selector;
    }
    if (s.value !== undefined) {
      step.params!.value = s.value;
    }
    if (s.url) {
      step.params!.url = s.url;
    }
    if (s.key) {
      step.params!.key = s.key;
    }

    return step;
  });
}
