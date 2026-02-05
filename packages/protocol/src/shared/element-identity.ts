/**
 * @fileoverview Element identity utilities for stable reference generation
 * @module @browseragentprotocol/protocol/shared/element-identity
 *
 * This module provides utilities for generating stable element references
 * that persist across multiple observations, even when DOM changes occur.
 */

import type { ElementIdentity, BAPSelector, RefSelector } from "../types/index.js";

/**
 * Generate a short hash from a string (6 characters)
 */
function shortHash(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  // Convert to base36 and take first 6 chars
  const hashStr = Math.abs(hash).toString(36);
  return hashStr.slice(0, 6).padStart(6, "0");
}

/**
 * Normalize a string for use in refs (lowercase, remove special chars)
 */
function normalizeForRef(str: string): string {
  return str
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "")
    .slice(0, 12);
}

/**
 * Generate a stable reference from element identity
 *
 * Priority order for ref generation:
 * 1. data-testid (highest stability)
 * 2. HTML id attribute
 * 3. aria-label
 * 4. Hash of combined identity properties
 *
 * @param identity Element identity information
 * @returns Stable reference string (e.g., "@submitBtn" or "@e7f3a2")
 */
export function generateStableRef(identity: ElementIdentity): string {
  // Priority 1: data-testid (most stable, developer-controlled)
  if (identity.testId) {
    const normalized = normalizeForRef(identity.testId);
    if (normalized.length > 0) {
      return `@${normalized}`;
    }
  }

  // Priority 2: HTML id (fairly stable)
  if (identity.id) {
    const normalized = normalizeForRef(identity.id);
    if (normalized.length > 0) {
      return `@${normalized}`;
    }
  }

  // Priority 3: aria-label (human-readable)
  if (identity.ariaLabel) {
    const normalized = normalizeForRef(identity.ariaLabel);
    if (normalized.length > 0) {
      return `@${normalized}`;
    }
  }

  // Priority 4: Hash-based ref from combined properties
  const hashInput = [
    identity.role,
    identity.name ?? "",
    identity.tagName,
    identity.parentRole ?? "",
    String(identity.siblingIndex ?? 0),
  ].join("|");

  return `@e${shortHash(hashInput)}`;
}

/**
 * Create a hash of element identity for comparison
 * Used to check if two identities refer to the same element
 */
export function hashIdentity(identity: ElementIdentity): string {
  const parts = [
    identity.testId ?? "",
    identity.id ?? "",
    identity.ariaLabel ?? "",
    identity.role,
    identity.name ?? "",
    identity.tagName,
    identity.parentRole ?? "",
    String(identity.siblingIndex ?? 0),
  ];
  return shortHash(parts.join("|"));
}

/**
 * Compare two element identities for equality
 * Returns a confidence score (0-1) for how likely they are the same element
 */
export function compareIdentities(
  a: ElementIdentity,
  b: ElementIdentity
): number {
  let score = 0;
  let maxScore = 0;

  // High-weight comparisons (stable identifiers)
  if (a.testId || b.testId) {
    maxScore += 3;
    if (a.testId === b.testId && a.testId) score += 3;
  }

  if (a.id || b.id) {
    maxScore += 3;
    if (a.id === b.id && a.id) score += 3;
  }

  if (a.ariaLabel || b.ariaLabel) {
    maxScore += 2;
    if (a.ariaLabel === b.ariaLabel && a.ariaLabel) score += 2;
  }

  // Medium-weight comparisons
  maxScore += 2;
  if (a.role === b.role) score += 2;

  if (a.name || b.name) {
    maxScore += 2;
    if (a.name === b.name && a.name) score += 2;
  }

  maxScore += 1;
  if (a.tagName === b.tagName) score += 1;

  // Low-weight comparisons (context)
  if (a.parentRole || b.parentRole) {
    maxScore += 1;
    if (a.parentRole === b.parentRole) score += 1;
  }

  if (a.siblingIndex !== undefined || b.siblingIndex !== undefined) {
    maxScore += 1;
    if (a.siblingIndex === b.siblingIndex) score += 1;
  }

  return maxScore > 0 ? score / maxScore : 0;
}

/**
 * Extract element identity from DOM element properties
 * This is typically called in browser context via page.evaluate()
 */
export interface DOMElementInfo {
  testId?: string;
  id?: string;
  ariaLabel?: string;
  role: string;
  name?: string;
  tagName: string;
  parentRole?: string;
  siblingIndex?: number;
}

/**
 * Convert DOM element info to ElementIdentity
 */
export function domInfoToIdentity(info: DOMElementInfo): ElementIdentity {
  return {
    testId: info.testId || undefined,
    id: info.id || undefined,
    ariaLabel: info.ariaLabel || undefined,
    role: info.role,
    name: info.name || undefined,
    tagName: info.tagName,
    parentRole: info.parentRole || undefined,
    siblingIndex: info.siblingIndex,
  };
}

/**
 * Create a ref-based selector from a stable ref
 */
export function refToSelector(refId: string): RefSelector {
  return {
    type: "ref",
    ref: refId,
  };
}

/**
 * Page element registry entry
 */
export interface ElementRegistryEntry {
  ref: string;
  selector: BAPSelector;
  identity: ElementIdentity;
  lastSeen: number;
  bounds?: { x: number; y: number; width: number; height: number };
}

/**
 * Page element registry for tracking elements across observations
 */
export interface PageElementRegistry {
  /** Map from stable ref to element info */
  elements: Map<string, ElementRegistryEntry>;
  /** Last observation timestamp */
  lastObservation: number;
  /** Page URL when registry was created */
  pageUrl: string;
}

/**
 * Create a new empty page element registry
 */
export function createElementRegistry(pageUrl: string): PageElementRegistry {
  return {
    elements: new Map(),
    lastObservation: Date.now(),
    pageUrl,
  };
}

/**
 * Threshold for considering an element stale (ms)
 * Elements not seen for this duration will be marked for cleanup
 */
export const ELEMENT_STALE_THRESHOLD = 60000; // 1 minute

/**
 * Clean up stale entries from registry
 * @param registry The registry to clean
 * @param threshold Maximum age in ms for entries (default: ELEMENT_STALE_THRESHOLD)
 * @returns Number of entries removed
 */
export function cleanupStaleEntries(
  registry: PageElementRegistry,
  threshold: number = ELEMENT_STALE_THRESHOLD
): number {
  const now = Date.now();
  let removed = 0;

  for (const [ref, entry] of registry.elements) {
    if (now - entry.lastSeen > threshold) {
      registry.elements.delete(ref);
      removed++;
    }
  }

  return removed;
}
