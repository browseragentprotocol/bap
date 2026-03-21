/**
 * @fileoverview CDP Session Manager
 * @module @browseragentprotocol/server-playwright/cdp/session
 *
 * Gets and caches CDP sessions from Playwright pages via the private
 * `_client()` API. Gracefully degrades when CDP is unavailable
 * (Firefox, WebKit, or future Playwright versions that remove _client).
 */

import type { Page as PlaywrightPage, CDPSession } from "playwright";

/**
 * Attempt to get a CDP session from a Playwright page.
 * Returns null if CDP is unavailable (Firefox, WebKit, or _client removed).
 */
export function getCDPSession(page: PlaywrightPage): CDPSession | null {
  try {
    // Playwright exposes _client() on Chromium pages — private but stable since v1.0
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const client = (page as any)._client?.();
    if (client && typeof client.send === "function") {
      return client as CDPSession;
    }
  } catch {
    // Not available — Firefox, WebKit, or API changed
  }
  return null;
}

/**
 * Check if CDP is available for a given page.
 * Use this before attempting CDP fast-path operations.
 */
export function isCDPAvailable(page: PlaywrightPage): boolean {
  return getCDPSession(page) !== null;
}

/**
 * Create a new CDP session for a page's target.
 * This is the public Playwright API (works on Chromium only).
 * Use this when you need a separate session that won't interfere
 * with Playwright's internal session.
 */
export async function createCDPSession(page: PlaywrightPage): Promise<CDPSession | null> {
  try {
    const context = page.context();
    // newCDPSession is only available on Chromium browser contexts
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if (typeof (context as any).newCDPSession === "function") {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return await (context as any).newCDPSession(page);
    }
  } catch {
    // Not Chromium or API unavailable
  }
  return null;
}
