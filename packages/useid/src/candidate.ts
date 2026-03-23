/**
 * Candidate generation — finds potential matches from normalized elements.
 */

import type { NormalizedElement, USEIDSignature } from "./types.js";
import { normalizeRole } from "./canonicalizer.js";

/**
 * Generate candidate elements that could match a uSEID signature.
 * Strategy: start with role match, then widen to all elements if no role matches.
 */
export function generateCandidates(
  signature: USEIDSignature,
  elements: NormalizedElement[]
): NormalizedElement[] {
  const targetRole = normalizeRole(signature.semantic.role);

  // Primary: filter by matching role
  const roleMatches = elements.filter((e) => e.role === targetRole);
  if (roleMatches.length > 0) return roleMatches;

  // Fallback: return all elements (matcher will score them low)
  return elements;
}
