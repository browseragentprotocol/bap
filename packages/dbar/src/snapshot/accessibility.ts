import { createHash } from "node:crypto";
import type { Page } from "playwright-core";

/** Result of an accessibility tree snapshot with a deterministic hash. */
export interface AccessibilitySnapshotResult {
  tree: unknown;
  hash: string;
  serialized: string;
}

/**
 * Capture the page's accessibility tree via Playwright and produce a
 * SHA-256 hash of the canonicalized JSON for determinism comparison.
 *
 * @param page - Playwright Page instance
 * @returns The accessibility tree, its canonical JSON string, and SHA-256 hash
 */
export async function captureAccessibilitySnapshot(
  page: Page
): Promise<AccessibilitySnapshotResult> {
  const tree = await (page as any).accessibility.snapshot({
    interestingOnly: false,
  });

  const serialized = canonicalizeTree(tree);
  const hash = createHash("sha256").update(serialized).digest("hex");

  return { tree, hash, serialized };
}

/**
 * Sort object keys recursively for deterministic JSON serialization.
 * Arrays preserve their element order; only object key order is normalized.
 */
function canonicalizeTree(node: unknown): string {
  return JSON.stringify(node, (_key, value: unknown) => {
    if (value && typeof value === "object" && !Array.isArray(value)) {
      const sorted: Record<string, unknown> = {};
      for (const k of Object.keys(value).sort()) {
        sorted[k] = (value as Record<string, unknown>)[k];
      }
      return sorted;
    }
    return value;
  });
}
