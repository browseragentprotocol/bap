import { createHash } from "node:crypto";
import type { Page } from "playwright-core";

/** Result of a page screenshot with a deterministic hash. */
export interface ScreenshotResult {
  buffer: Buffer;
  hash: string;
}

/** Options for screenshot capture. */
export interface ScreenshotOptions {
  /** CSS selectors of dynamic content to mask */
  masks?: string[];
  /** Full page screenshot (default: true) */
  fullPage?: boolean;
}

/**
 * Capture a PNG screenshot via Playwright and produce a SHA-256 hash
 * for determinism comparison. Dynamic elements can be masked by CSS selector.
 *
 * @param page - Playwright Page instance
 * @param options - Masking and sizing options
 * @returns PNG buffer and its SHA-256 hash
 */
export async function captureScreenshot(
  page: Page,
  options: ScreenshotOptions = {}
): Promise<ScreenshotResult> {
  const mask = (options.masks ?? []).map((s) => page.locator(s));

  const buffer = await page.screenshot({
    fullPage: options.fullPage ?? true,
    type: "png",
    scale: "css",
    ...(mask.length > 0 ? { mask } : {}),
  });

  const hash = createHash("sha256").update(buffer).digest("hex");

  return { buffer, hash };
}
