/**
 * @fileoverview Selector injection prevention
 * @module @browseragentprotocol/server-playwright/security/selector-validator
 */

import { ErrorCodes } from "@browseragentprotocol/protocol";
import { BAPServerError } from "../errors.js";

// PERF: Pre-compiled regex patterns for selector validation
const SELECTOR_PATTERNS = {
  cssJavascript: /url\s*\(\s*['"]?\s*javascript:/i,
  cssExpression: /expression\s*\(/i,
  xpathDocument: /\bdocument\s*\(/i,
};

const MAX_SELECTOR_LENGTH = 10000;

/**
 * SECURITY: Validate selector value for potential injection attacks.
 * PERF: Uses pre-compiled regex patterns.
 */
export function validateSelectorValue(
  value: string,
  type: string,
  logSecurity: (event: string, details: Record<string, unknown>) => void
): void {
  if (!value || !value.trim()) {
    throw new BAPServerError(ErrorCodes.InvalidParams, `Empty ${type} selector value`);
  }

  if (value.length > MAX_SELECTOR_LENGTH) {
    logSecurity("SELECTOR_TOO_LONG", { type, length: value.length });
    throw new BAPServerError(
      ErrorCodes.InvalidParams,
      `Selector too long (max ${MAX_SELECTOR_LENGTH} chars)`
    );
  }

  if (type === "css") {
    if (SELECTOR_PATTERNS.cssJavascript.test(value)) {
      logSecurity("SELECTOR_INJECTION", { type, pattern: "javascript:" });
      throw new BAPServerError(
        ErrorCodes.InvalidParams,
        "Invalid CSS selector: javascript: not allowed"
      );
    }
    if (SELECTOR_PATTERNS.cssExpression.test(value)) {
      logSecurity("SELECTOR_INJECTION", { type, pattern: "expression()" });
      throw new BAPServerError(
        ErrorCodes.InvalidParams,
        "Invalid CSS selector: expression() not allowed"
      );
    }
  }

  if (type === "xpath") {
    if (SELECTOR_PATTERNS.xpathDocument.test(value)) {
      logSecurity("SELECTOR_INJECTION", { type, pattern: "document()" });
      throw new BAPServerError(ErrorCodes.InvalidParams, "Invalid XPath: document() not allowed");
    }
  }
}
