import type { Page } from "playwright-core";

import type { InitialState } from "../capsule/types.js";

/**
 * Capture browser storage state (cookies + localStorage) as an
 * `InitialState` suitable for capsule serialization.
 *
 * @param page - Playwright Page instance
 * @param initialUrl - The URL to record as the capsule's starting point
 * @returns InitialState with cookies, localStorage, and unsupported-state markers
 */
export async function captureStorageState(page: Page, initialUrl: string): Promise<InitialState> {
  const context = page.context();
  const storageState = await context.storageState();

  return {
    url: initialUrl,
    cookies: storageState.cookies.map((c) => ({
      name: c.name,
      value: c.value,
      domain: c.domain,
      path: c.path,
      expires: c.expires,
      httpOnly: c.httpOnly,
      secure: c.secure,
      sameSite: c.sameSite as "Strict" | "Lax" | "None",
    })),
    localStorage: storageState.origins.map((o) => ({
      origin: o.origin,
      entries: o.localStorage.map((item) => ({
        name: item.name,
        value: item.value,
      })),
    })),
    unsupportedState: ["sessionStorage", "indexedDB", "serviceWorkers"],
  };
}

/** Protocols blocked during state restoration to prevent SSRF / script injection. */
const BLOCKED_PROTOCOLS = ["javascript:", "data:", "file:", "vbscript:"];

/** Hosts blocked during state restoration to prevent cloud metadata access. */
const BLOCKED_HOSTS = ["169.254.169.254", "metadata.google.internal", "metadata.internal"];

/**
 * Validate a URL before navigation during state restoration.
 * Blocks dangerous protocols and cloud metadata endpoints.
 *
 * @param url - URL to validate
 * @param validateUrl - Optional external validator (e.g. server's ctx.validateUrl)
 * @throws Error if the URL is unsafe
 */
function assertSafeUrl(url: string, validateUrl?: (url: string) => void): void {
  if (validateUrl) {
    validateUrl(url);
    return;
  }
  const lower = url.toLowerCase();
  for (const proto of BLOCKED_PROTOCOLS) {
    if (lower.startsWith(proto)) {
      throw new Error(`Blocked protocol in capsule URL: ${proto}`);
    }
  }
  try {
    const parsed = new URL(url);
    if (BLOCKED_HOSTS.includes(parsed.hostname)) {
      throw new Error(`Blocked host in capsule URL: ${parsed.hostname}`);
    }
  } catch (e) {
    if (e instanceof Error && e.message.startsWith("Blocked")) throw e;
    // Non-parseable URL — let Playwright handle the error
  }
}

/**
 * Restore browser storage state from a capsule's `InitialState`.
 * Sets cookies via context, then navigates to each origin to restore
 * localStorage entries, and finally navigates to the initial URL.
 *
 * All URLs are validated before navigation to prevent SSRF attacks from
 * malicious capsule archives (see BAP CLAUDE.md: "storage/setState must
 * validate URLs before navigation").
 *
 * @param page - Playwright Page instance
 * @param state - Previously captured InitialState to restore
 * @param validateUrl - Optional external URL validator callback
 */
export async function restoreStorageState(
  page: Page,
  state: InitialState,
  validateUrl?: (url: string) => void
): Promise<void> {
  const context = page.context();

  // Restore cookies
  if (state.cookies.length > 0) {
    await context.addCookies(
      state.cookies.map((c) => ({
        name: c.name,
        value: c.value,
        domain: c.domain,
        path: c.path,
        expires: c.expires,
        httpOnly: c.httpOnly,
        secure: c.secure,
        sameSite: c.sameSite,
      }))
    );
  }

  // Restore localStorage by navigating to each origin
  for (const origin of state.localStorage) {
    if (origin.entries.length === 0) continue;
    assertSafeUrl(origin.origin, validateUrl);
    await page.goto(origin.origin, { waitUntil: "domcontentloaded" });
    await page.evaluate((entries: Array<{ name: string; value: string }>) => {
      for (const { name, value } of entries) {
        localStorage.setItem(name, value);
      }
    }, origin.entries);
  }

  // Navigate to the initial URL
  if (state.url && state.url !== "about:blank") {
    assertSafeUrl(state.url, validateUrl);
    await page.goto(state.url, { waitUntil: "domcontentloaded" });
  }
}
