/**
 * @fileoverview Browser launch argument sanitization
 * @module @browseragentprotocol/server-playwright/security/arg-sanitizer
 */

import { ALLOWED_BROWSER_ARGS, BLOCKED_BROWSER_ARGS } from "../config.js";

/**
 * Sanitize browser launch arguments.
 * Filters out dangerous args and only allows safe, known args.
 */
export function sanitizeBrowserArgs(
  args: readonly string[] | undefined,
  log: (message: string) => void
): string[] {
  if (!args || args.length === 0) {
    return [];
  }

  return args.filter((arg) => {
    const argName = arg.split("=")[0];

    // Check blocklist first - always reject these
    if (BLOCKED_BROWSER_ARGS.includes(argName)) {
      log(`Security: Blocked browser arg filtered: ${argName}`);
      return false;
    }

    // Check allowlist
    const isAllowed = ALLOWED_BROWSER_ARGS.some((pattern) => {
      if (typeof pattern === "string") {
        return arg === pattern || arg.startsWith(pattern + "=");
      }
      return pattern.test(arg);
    });

    if (!isAllowed) {
      log(`Security: Unknown browser arg filtered: ${arg}`);
      return false;
    }

    return true;
  });
}
