/**
 * @fileoverview URL validation for navigation security
 * @module @browseragentprotocol/server-playwright/security/url-validator
 */

import { ErrorCodes } from "@browseragentprotocol/protocol";
import { BAPServerError } from "../errors.js";
import { DEFAULT_BLOCKED_PROTOCOLS } from "../config.js";
import type { ResolvedOptions } from "../config.js";

/**
 * Validate a URL for security concerns.
 * Blocks dangerous protocols and cloud metadata endpoints by default.
 */
export function validateUrl(
  url: string,
  options: ResolvedOptions,
  log: (message: string, context?: Record<string, unknown>) => void
): void {
  const security = options.security;
  const blockedProtocols = security.blockedProtocols ?? DEFAULT_BLOCKED_PROTOCOLS;
  const blockedHosts = security.blockedHosts ?? [];

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new BAPServerError(ErrorCodes.InvalidParams, `Invalid URL: ${url}`);
  }

  const protocol = parsed.protocol.replace(":", "");

  // Check allowed protocols first (if specified, takes precedence)
  if (security.allowedProtocols?.length) {
    if (!security.allowedProtocols.includes(protocol)) {
      throw new BAPServerError(
        ErrorCodes.InvalidParams,
        `Protocol not allowed: ${protocol}. Allowed: ${security.allowedProtocols.join(", ")}`
      );
    }
  } else {
    if (blockedProtocols.includes(protocol)) {
      throw new BAPServerError(
        ErrorCodes.InvalidParams,
        `Blocked protocol: ${protocol}`,
        false,
        undefined,
        undefined,
        "Use https:// or http:// protocol for navigation"
      );
    }
  }

  // Check allowed hosts first (if specified, takes precedence)
  if (security.allowedHosts?.length) {
    const isAllowed = security.allowedHosts.some((pattern) => {
      if (pattern.startsWith("*.")) {
        const domain = pattern.slice(2);
        return parsed.hostname === domain || parsed.hostname.endsWith("." + domain);
      }
      return parsed.hostname === pattern;
    });
    if (!isAllowed) {
      throw new BAPServerError(ErrorCodes.InvalidParams, `Host not allowed: ${parsed.hostname}`);
    }
  } else {
    if (blockedHosts.includes(parsed.hostname)) {
      throw new BAPServerError(
        ErrorCodes.InvalidParams,
        `Blocked host (cloud metadata endpoint): ${parsed.hostname}`
      );
    }
  }

  // Log warning for internal IPs (but don't block by default)
  const hostname = parsed.hostname;
  if (
    hostname === "localhost" ||
    hostname.startsWith("127.") ||
    hostname.startsWith("10.") ||
    hostname.startsWith("192.168.") ||
    hostname.match(/^172\.(1[6-9]|2[0-9]|3[0-1])\./)
  ) {
    log(`Warning: Navigation to internal address: ${hostname}`);
  }
}
