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

/**
 * Restore browser storage state from a capsule's `InitialState`.
 * Sets cookies via context, then navigates to each origin to restore
 * localStorage entries, and finally navigates to the initial URL.
 *
 * @param page - Playwright Page instance
 * @param state - Previously captured InitialState to restore
 */
export async function restoreStorageState(page: Page, state: InitialState): Promise<void> {
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
    await page.goto(origin.origin, { waitUntil: "domcontentloaded" });
    await page.evaluate((entries: Array<{ name: string; value: string }>) => {
      for (const { name, value } of entries) {
        localStorage.setItem(name, value);
      }
    }, origin.entries);
  }

  // Navigate to the initial URL
  if (state.url && state.url !== "about:blank") {
    await page.goto(state.url, { waitUntil: "domcontentloaded" });
  }
}
