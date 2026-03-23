/**
 * Weighted scoring matcher for uSEID resolution.
 *
 * Scoring dimensions:
 * - Semantic (0.5): role match + accessible name similarity
 * - Structural (0.3): ancestor chain Jaccard + sibling token overlap
 * - Spatial (0.2): inverse normalized bbox center distance
 */

import type { NormalizedElement, USEIDSignature, CandidateResult, MatchWeights } from "./types.js";
import { nameSimilarity, jaccardSimilarity, normalizeRole } from "./canonicalizer.js";
import {
  DEFAULT_WEIGHTS,
  NAME_CHANGE_PENALTY,
  DEFAULT_VIEWPORT_WIDTH,
  DEFAULT_VIEWPORT_HEIGHT,
} from "./constants.js";

export interface MatcherConfig {
  weights?: MatchWeights;
}

/**
 * Score all candidate elements against a uSEID signature.
 * Returns candidates sorted by confidence (highest first).
 */
export function scoreCandidates(
  signature: USEIDSignature,
  candidates: NormalizedElement[],
  config: MatcherConfig = {}
): CandidateResult[] {
  const weights = config.weights ?? DEFAULT_WEIGHTS;

  const results: CandidateResult[] = candidates.map((candidate) => {
    const semantic = computeSemanticScore(signature, candidate);
    const structural = computeStructuralScore(signature, candidate);
    const spatial = computeSpatialScore(signature, candidate);

    const confidence =
      semantic * weights.semantic + structural * weights.structural + spatial * weights.spatial;

    return {
      candidateIndex: candidate.index,
      selectorHint: candidate.selectorHint,
      confidence,
      scores: { semantic, structural, spatial },
      role: candidate.role,
      accessibleName: candidate.accessibleName,
    };
  });

  // Sort by confidence descending
  results.sort((a, b) => b.confidence - a.confidence);
  return results;
}

/**
 * Semantic score: role match (required) + name similarity.
 * Role mismatch = 0. Name change beyond normalization = penalty.
 */
function computeSemanticScore(sig: USEIDSignature, el: NormalizedElement): number {
  const sigRole = normalizeRole(sig.semantic.role);
  const elRole = normalizeRole(el.role);

  // Invariant: role must match
  if (sigRole !== elRole) return 0;

  // Name similarity
  const similarity = nameSimilarity(sig.semantic.accessibleName, el.accessibleName);

  // Apply penalty for name changes beyond normalization
  if (similarity < 0.8 && similarity > 0) {
    return similarity * NAME_CHANGE_PENALTY;
  }

  return similarity;
}

/**
 * Structural score: ancestor chain Jaccard + sibling token overlap.
 */
function computeStructuralScore(sig: USEIDSignature, el: NormalizedElement): number {
  // Ancestor role chain similarity (weight 0.6)
  const ancestorSim = jaccardSimilarity(sig.structure.ancestorRoles, el.ancestorRoles);

  // Sibling token overlap (weight 0.3)
  const siblingSim = jaccardSimilarity(sig.structure.siblingTokens, el.siblingTokens);

  // Depth proximity (weight 0.1)
  const depthDiff = Math.abs(sig.structure.domDepth - el.domDepth);
  const depthSim = 1 / (1 + depthDiff);

  return ancestorSim * 0.6 + siblingSim * 0.3 + depthSim * 0.1;
}

/**
 * Spatial score: inverse normalized distance between bbox centers.
 * Returns 0 if either bbox is zero-area (no spatial data).
 */
function computeSpatialScore(sig: USEIDSignature, el: NormalizedElement): number {
  const sigBbox = sig.spatial.bbox;
  const elBbox = el.bbox;

  // Skip if either has no spatial data
  if (sigBbox.w === 0 && sigBbox.h === 0) return 0;
  if (elBbox.w === 0 && elBbox.h === 0) return 0;

  // Compute center points
  const sigCx = sigBbox.x + sigBbox.w / 2;
  const sigCy = sigBbox.y + sigBbox.h / 2;
  const elCx = elBbox.x + elBbox.w / 2;
  const elCy = elBbox.y + elBbox.h / 2;

  // Euclidean distance normalized by viewport diagonal
  const diagonal = Math.sqrt(DEFAULT_VIEWPORT_WIDTH ** 2 + DEFAULT_VIEWPORT_HEIGHT ** 2);
  const distance = Math.sqrt((sigCx - elCx) ** 2 + (sigCy - elCy) ** 2);

  return Math.max(0, 1 - distance / diagonal);
}
