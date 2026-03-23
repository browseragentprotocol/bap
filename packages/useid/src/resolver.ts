/**
 * uSEID Resolver — top-level orchestrator for resolving signatures.
 */

import { createHash } from "node:crypto";
import type { DOMSnapshotResult, AccessibilitySnapshotResult } from "@browseragentprotocol/dbar";
import type { USEIDSignature, USEIDConfig, ResolveResult, FramePathEntry } from "./types.js";
import { USEIDConfigSchema } from "./types.js";
import { extractElements } from "./extractor.js";
import { generateCandidates } from "./candidate.js";
import { scoreCandidates } from "./matcher.js";
import { applySafetyGate } from "./safety.js";
import { normalizeAccessibleName } from "./canonicalizer.js";

export interface ResolveUSEIDOptions {
  signature: USEIDSignature;
  domSnapshot: DOMSnapshotResult;
  accessibilitySnapshot: AccessibilitySnapshotResult;
  pageUrl: string;
  framePath?: FramePathEntry[];
  config?: Partial<USEIDConfig>;
}

/**
 * Resolve a uSEID signature against current page snapshots.
 * Returns a selector hint + confidence, or abstains with explanation.
 */
export function resolveUSEID(opts: ResolveUSEIDOptions): ResolveResult {
  const config = USEIDConfigSchema.parse(opts.config ?? {});

  // Extract normalized elements from current snapshots
  const elements = extractElements(opts.domSnapshot, opts.accessibilitySnapshot, {
    maxAncestorLevels: config.maxAncestorLevels,
    maxSiblingTokens: config.maxSiblingTokens,
  });

  // Generate candidates
  const candidates = generateCandidates(opts.signature, elements);

  // Score candidates
  const scored = scoreCandidates(opts.signature, candidates, {
    weights: config.weights,
  });

  // Apply safety gate
  return applySafetyGate(scored, opts.signature, opts.pageUrl, opts.framePath, {
    threshold: config.threshold,
    marginConstraint: config.marginConstraint,
  });
}

/**
 * Compare two uSEID signatures for similarity.
 * Returns a score from 0 (completely different) to 1 (identical).
 */
export function compareUSEID(a: USEIDSignature, b: USEIDSignature): number {
  // Fast path: identical hashes
  if (a.hash === b.hash) return 1;

  // Compare binding
  if (a.origin !== b.origin) return 0;
  if (a.pagePath !== b.pagePath) return 0;

  // Compare semantic core
  if (a.semantic.role !== b.semantic.role) return 0;

  const nameSim =
    normalizeAccessibleName(a.semantic.accessibleName) ===
    normalizeAccessibleName(b.semantic.accessibleName)
      ? 1
      : 0.5;

  return nameSim;
}

/**
 * Generate a human-readable explanation of a resolution result.
 */
export function explainResolution(result: ResolveResult): string {
  if (result.resolved) {
    return `Resolved with confidence ${result.confidence.toFixed(3)}: ${result.selectorHint}`;
  }
  const candidateList = result.candidates
    .slice(0, 3)
    .map((c) => `  - ${c.role}[name="${c.accessibleName}"] (${c.confidence.toFixed(3)})`)
    .join("\n");
  return `Abstained (${result.abstentionReason}): ${result.explanation}\nTop candidates:\n${candidateList}`;
}

/**
 * Redact PII from a uSEID signature for logging/auditing.
 * Redacted signatures are NOT resolvable — too much signal is removed.
 * Use for log-safe storage only.
 */
export function redactUSEID(signature: USEIDSignature): USEIDSignature {
  const hashName = createHash("sha256")
    .update(signature.semantic.accessibleName)
    .digest("hex")
    .slice(0, 16);

  return {
    ...signature,
    semantic: {
      role: signature.semantic.role,
      accessibleName: `[redacted:${hashName}]`,
      accessibleDescription: signature.semantic.accessibleDescription ? "[redacted]" : undefined,
    },
    structure: {
      ...signature.structure,
      siblingTokens: [],
      formAssociation: undefined,
    },
    // Recompute hash with redacted content
    hash: createHash("sha256")
      .update(
        `${signature.origin}|${signature.pagePath}|${signature.semantic.role}|[redacted:${hashName}]`
      )
      .digest("hex"),
  };
}
