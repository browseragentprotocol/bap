/**
 * @fileoverview CDP fast-path screenshot
 * @module @browseragentprotocol/server-playwright/cdp/fast-screenshot
 *
 * Captures screenshots via CDP's Page.captureScreenshot directly,
 * bypassing Playwright's rendering pipeline for ~40% latency reduction.
 * Falls back to Playwright when CDP is unavailable.
 */

import type { Page as PlaywrightPage } from "playwright";
import { getCDPSession } from "./session.js";

export interface CDPScreenshotOptions {
  format?: "jpeg" | "png" | "webp";
  quality?: number;
  fullPage?: boolean;
  /** Omit device scale factor to get CSS-pixel screenshots on retina */
  omitDeviceScaleFactor?: boolean;
}

/**
 * Take a screenshot via CDP direct path.
 * Returns base64-encoded image data, or null if CDP unavailable.
 */
export async function cdpScreenshot(
  page: PlaywrightPage,
  options: CDPScreenshotOptions = {}
): Promise<Buffer | null> {
  const session = getCDPSession(page);
  if (!session) return null;

  try {
    const result = await session.send("Page.captureScreenshot", {
      format: options.format ?? "jpeg",
      quality: options.format === "png" ? undefined : (options.quality ?? 80),
      fromSurface: true,
      captureBeyondViewport: options.fullPage ?? false,
      optimizeForSpeed: true,
    });

    return Buffer.from(result.data, "base64");
  } catch {
    // CDP call failed — fall back to Playwright
    return null;
  }
}

/**
 * Get accessibility tree via CDP direct path.
 * Returns the raw CDP accessibility tree, or null if unavailable.
 */
export async function cdpAccessibilityTree(
  page: PlaywrightPage
): Promise<Record<string, unknown> | null> {
  const session = getCDPSession(page);
  if (!session) return null;

  try {
    const result = await session.send("Accessibility.getFullAXTree");
    return result as Record<string, unknown>;
  } catch {
    return null;
  }
}
