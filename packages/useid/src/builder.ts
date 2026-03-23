/**
 * uSEID Builder — assembles a USEIDSignature from DBAR snapshot data.
 */

import { createHash } from "node:crypto";
import type { DOMSnapshotResult, AccessibilitySnapshotResult } from "@browseragentprotocol/dbar";
import type { USEIDSignature, USEIDConfig, FramePathEntry } from "./types.js";
import { USEIDConfigSchema } from "./types.js";
import { extractElements } from "./extractor.js";
import { normalizeAccessibleName } from "./canonicalizer.js";
import { USEID_VERSION, DEFAULT_VIEWPORT_WIDTH, DEFAULT_VIEWPORT_HEIGHT } from "./constants.js";

export interface BuildUSEIDOptions {
  domSnapshot: DOMSnapshotResult;
  accessibilitySnapshot: AccessibilitySnapshotResult;
  elementIndex: number;
  pageUrl: string;
  framePath?: FramePathEntry[];
  config?: Partial<USEIDConfig>;
}

/**
 * Build a uSEID signature from DBAR snapshot evidence.
 *
 * @param opts - Snapshot data, target element index, page URL, optional frame path
 * @returns A versioned USEIDSignature bound to the page origin and path
 * @throws If elementIndex is out of range
 */
export function buildUSEID(opts: BuildUSEIDOptions): USEIDSignature {
  const config = USEIDConfigSchema.parse(opts.config ?? {});

  // Extract normalized elements from snapshots
  const elements = extractElements(opts.domSnapshot, opts.accessibilitySnapshot, {
    maxAncestorLevels: config.maxAncestorLevels,
    maxSiblingTokens: config.maxSiblingTokens,
  });

  if (opts.elementIndex < 0 || opts.elementIndex >= elements.length) {
    throw new RangeError(`elementIndex ${opts.elementIndex} out of range [0, ${elements.length})`);
  }

  const element = elements[opts.elementIndex]!;

  // Parse page URL for origin and path
  const url = new URL(opts.pageUrl);
  const origin = url.origin;
  const pagePath = url.pathname;

  // Compute viewport-relative position
  const viewportWidth = DEFAULT_VIEWPORT_WIDTH;
  const viewportHeight = DEFAULT_VIEWPORT_HEIGHT;
  const viewportRelative = {
    top: viewportHeight > 0 ? element.bbox.y / viewportHeight : 0,
    left: viewportWidth > 0 ? element.bbox.x / viewportWidth : 0,
  };

  // Compute confidence based on available evidence
  let confidence = 0;
  if (element.accessibleName) confidence += 0.4;
  if (element.role) confidence += 0.2;
  if (element.ancestorRoles.length > 0) confidence += 0.15;
  if (element.bbox.w > 0 && element.bbox.h > 0) confidence += 0.15;
  if (element.siblingTokens.length > 0) confidence += 0.1;
  confidence = Math.min(confidence, 1);

  // Compute hash of canonical (origin + pagePath + semantic core)
  const hashInput = [
    origin,
    pagePath,
    element.role,
    normalizeAccessibleName(element.accessibleName),
  ].join("|");
  const hash = createHash("sha256").update(hashInput).digest("hex");

  return {
    version: USEID_VERSION,
    origin,
    pagePath,
    framePath: opts.framePath,
    semantic: {
      role: element.role,
      accessibleName: element.accessibleName,
      accessibleDescription: element.accessibleDescription,
    },
    structure: {
      ancestorRoles: element.ancestorRoles,
      ancestorTags: element.ancestorTags,
      siblingTokens: element.siblingTokens,
      formAssociation: element.formAssociation,
      domDepth: element.domDepth,
    },
    spatial: {
      bbox: element.bbox,
      viewportRelative,
      region: element.region,
    },
    stability: {
      confidence,
    },
    hash,
  };
}
