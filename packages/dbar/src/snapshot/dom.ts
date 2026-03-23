import { createHash } from "node:crypto";
import type { CDPSession } from "playwright-core";

/** Result of a CDP DOM snapshot capture with a deterministic hash. */
export interface DOMSnapshotResult {
  snapshot: unknown;
  hash: string;
  serialized: string;
}

/**
 * Capture a DOM snapshot via CDP `DOMSnapshot.captureSnapshot` and produce
 * a SHA-256 hash of the canonicalized JSON for determinism comparison.
 *
 * @param cdpSession - Active CDP session to the target page
 * @returns Snapshot data, its canonical JSON string, and SHA-256 hash
 */
export async function captureDOMSnapshot(cdpSession: CDPSession): Promise<DOMSnapshotResult> {
  await cdpSession.send("DOMSnapshot.enable" as any);

  const snapshot = await cdpSession.send(
    "DOMSnapshot.captureSnapshot" as any,
    {
      computedStyles: ["display", "visibility", "opacity", "position"],
      includePaintOrder: false,
      includeDOMRects: true,
    } as any
  );

  // Canonicalize by JSON-serializing with sorted keys
  const serialized = JSON.stringify(snapshot, Object.keys(snapshot as object).sort());
  const hash = createHash("sha256").update(serialized).digest("hex");

  return { snapshot, hash, serialized };
}
