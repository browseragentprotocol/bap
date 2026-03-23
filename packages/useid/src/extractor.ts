/**
 * Feature extraction from DBAR snapshots into typed NormalizedElement records.
 *
 * Strategy:
 * - Accessibility tree (Playwright) is the primary source for semantics (role, name)
 * - DOM snapshot (CDP DOMSnapshot.captureSnapshot) provides spatial data (layout bounds)
 * - Join is heuristic: walk the a11y tree, match to DOM nodes by structural position
 * - If no DOM match, spatial features default to zero bbox
 */

import type { DOMSnapshotResult, AccessibilitySnapshotResult } from "@browseragentprotocol/dbar";
import type { NormalizedElement, SemanticRegion } from "./types.js";
import { normalizeAccessibleName, normalizeRole, normalizeTag } from "./canonicalizer.js";
import {
  LANDMARK_ROLE_MAP,
  LANDMARK_TAG_MAP,
  MAX_ANCESTOR_LEVELS,
  MAX_SIBLING_TOKENS,
} from "./constants.js";

// ── Internal types for raw CDP DOMSnapshot response ─────────────────────────

interface CDPDOMSnapshotDocument {
  nodes: {
    parentIndex: number[];
    nodeType: number[];
    nodeName: number[]; // indices into strings table
    nodeValue: number[];
    backendNodeId: number[];
    attributes?: Array<{ index: number[]; value: number[] }>;
  };
  layout?: {
    nodeIndex: number[];
    bounds: number[][]; // [x, y, width, height] per layout node
  };
}

interface CDPDOMSnapshot {
  documents: CDPDOMSnapshotDocument[];
  strings: string[];
}

// ── Internal types for Playwright accessibility snapshot ─────────────────────

interface AXNode {
  role: string;
  name: string;
  description?: string;
  value?: string;
  children?: AXNode[];
}

// ── Flattened a11y element ──────────────────────────────────────────────────

interface FlatAXElement {
  role: string;
  name: string;
  description?: string;
  depth: number;
  ancestorRoles: string[];
  siblingNames: string[];
  childIndex: number;
}

// ── Public API ──────────────────────────────────────────────────────────────

export interface ExtractOptions {
  maxAncestorLevels?: number;
  maxSiblingTokens?: number;
}

/**
 * Extract NormalizedElement[] from DBAR snapshot data.
 * Filters to interactive/actionable elements (buttons, links, inputs, etc.)
 */
export function extractElements(
  domSnapshot: DOMSnapshotResult,
  accessibilitySnapshot: AccessibilitySnapshotResult,
  options: ExtractOptions = {}
): NormalizedElement[] {
  const maxAncestors = options.maxAncestorLevels ?? MAX_ANCESTOR_LEVELS;
  const maxSiblings = options.maxSiblingTokens ?? MAX_SIBLING_TOKENS;

  // Parse a11y tree into flat elements
  const axElements = flattenAccessibilityTree(
    accessibilitySnapshot.tree as AXNode | null,
    maxAncestors,
    maxSiblings
  );

  // Parse DOM snapshot for layout data
  const layoutMap = extractLayoutMap(domSnapshot.snapshot as CDPDOMSnapshot | null);
  const domStructure = extractDOMStructure(domSnapshot.snapshot as CDPDOMSnapshot | null);

  // Build normalized elements
  const elements: NormalizedElement[] = [];
  let elementIndex = 0;

  for (const ax of axElements) {
    // Always skip structural container roles (not actionable elements)
    if (isStructuralRole(ax.role)) continue;
    // Skip generic roles that have no name (not identifiable)
    if (isGenericRole(ax.role) && !ax.name) continue;

    const normalizedRole = normalizeRole(ax.role);
    const normalizedName = normalizeAccessibleName(ax.name);

    // Find matching DOM node for spatial data
    const domMatch = findDOMMatch(ax, domStructure, layoutMap);
    const bbox = domMatch?.bounds ?? { x: 0, y: 0, w: 0, h: 0 };

    // Determine semantic region from ancestor roles
    const region = detectRegion(ax.ancestorRoles);

    // Detect form association from DOM structure
    const formAssociation = domMatch?.labelText;

    // Build ancestor tag chain from DOM (if available)
    const ancestorTags = domMatch?.ancestorTags?.slice(-maxAncestors) ?? [];

    // Build selector hint
    const selectorHint = buildSelectorHint(normalizedRole, normalizedName, elementIndex);

    elements.push({
      index: elementIndex,
      role: normalizedRole,
      accessibleName: normalizedName,
      accessibleDescription: ax.description,
      tagName: domMatch?.tagName ?? roleToTag(normalizedRole),
      ancestorRoles: ax.ancestorRoles.slice(-maxAncestors),
      ancestorTags,
      siblingTokens: ax.siblingNames.slice(0, maxSiblings),
      formAssociation,
      domDepth: ax.depth,
      bbox,
      region,
      selectorHint,
    });

    elementIndex++;
  }

  return elements;
}

// ── Accessibility tree flattening ───────────────────────────────────────────

function flattenAccessibilityTree(
  root: AXNode | null,
  maxAncestors: number,
  maxSiblings: number
): FlatAXElement[] {
  if (!root) return [];

  const result: FlatAXElement[] = [];

  function walk(
    node: AXNode,
    depth: number,
    ancestorRoles: string[],
    siblings: AXNode[],
    childIndex: number
  ) {
    const siblingNames = siblings
      .filter((s) => s !== node && s.name)
      .map((s) => normalizeAccessibleName(s.name))
      .slice(0, maxSiblings);

    result.push({
      role: node.role,
      name: node.name ?? "",
      description: node.description,
      depth,
      ancestorRoles: ancestorRoles.slice(-maxAncestors),
      siblingNames,
      childIndex,
    });

    if (node.children) {
      const nextAncestors = [...ancestorRoles, normalizeRole(node.role)];
      for (let i = 0; i < node.children.length; i++) {
        walk(node.children[i]!, depth + 1, nextAncestors, node.children, i);
      }
    }
  }

  walk(root, 0, [], [], 0);
  return result;
}

// ── DOM snapshot parsing ────────────────────────────────────────────────────

interface DOMNodeInfo {
  index: number;
  tagName: string;
  parentIndex: number;
  backendNodeId: number;
  bounds?: { x: number; y: number; w: number; h: number };
  ancestorTags: string[];
  labelText?: string;
}

function extractDOMStructure(snapshot: CDPDOMSnapshot | null): DOMNodeInfo[] {
  if (!snapshot?.documents?.[0]?.nodes) return [];

  const doc = snapshot.documents[0];
  const strings = snapshot.strings ?? [];
  const nodes = doc.nodes;
  const nodeCount = nodes.parentIndex?.length ?? 0;

  const result: DOMNodeInfo[] = [];
  const layoutMap = extractLayoutMapFromDoc(doc);

  for (let i = 0; i < nodeCount; i++) {
    // Only process element nodes (nodeType 1)
    if (nodes.nodeType[i] !== 1) continue;

    const nameIndex = nodes.nodeName[i] ?? 0;
    const tagName = normalizeTag(strings[nameIndex] ?? "");
    const parentIdx = nodes.parentIndex[i] ?? -1;
    const backendNodeId = nodes.backendNodeId?.[i] ?? -1;

    // Build ancestor tag chain
    const ancestorTags: string[] = [];
    let current = parentIdx;
    let depth = 0;
    while (current >= 0 && depth < MAX_ANCESTOR_LEVELS) {
      if (nodes.nodeType[current] === 1) {
        const pNameIdx = nodes.nodeName[current] ?? 0;
        ancestorTags.unshift(normalizeTag(strings[pNameIdx] ?? ""));
      }
      current = nodes.parentIndex[current] ?? -1;
      depth++;
    }

    // Get bounds from layout
    const bounds = layoutMap.get(i);

    // Check for associated label (simplified: look for <label> parent or sibling)
    const labelText = findLabelForNode(i, nodes, strings, nodeCount);

    result.push({
      index: i,
      tagName,
      parentIndex: parentIdx,
      backendNodeId,
      bounds,
      ancestorTags,
      labelText,
    });
  }

  return result;
}

function extractLayoutMap(
  snapshot: CDPDOMSnapshot | null
): Map<number, { x: number; y: number; w: number; h: number }> {
  if (!snapshot?.documents?.[0]) return new Map();
  return extractLayoutMapFromDoc(snapshot.documents[0]);
}

function extractLayoutMapFromDoc(
  doc: CDPDOMSnapshotDocument
): Map<number, { x: number; y: number; w: number; h: number }> {
  const map = new Map<number, { x: number; y: number; w: number; h: number }>();
  if (!doc.layout?.nodeIndex || !doc.layout?.bounds) return map;

  const { nodeIndex, bounds } = doc.layout;
  for (let i = 0; i < nodeIndex.length; i++) {
    const nIdx = nodeIndex[i]!;
    const b = bounds[i];
    if (b && b.length >= 4) {
      map.set(nIdx, { x: b[0]!, y: b[1]!, w: b[2]!, h: b[3]! });
    }
  }
  return map;
}

// ── DOM-a11y matching ───────────────────────────────────────────────────────

function findDOMMatch(
  ax: FlatAXElement,
  domNodes: DOMNodeInfo[],
  _layoutMap: Map<number, { x: number; y: number; w: number; h: number }>
): DOMNodeInfo | undefined {
  if (domNodes.length === 0) return undefined;

  const targetTag = roleToTag(normalizeRole(ax.role));
  if (!targetTag) return undefined;

  // Find DOM nodes matching the expected tag
  const candidates = domNodes.filter((n) => n.tagName === targetTag);
  if (candidates.length === 0) return undefined;

  // If only one candidate, use it
  if (candidates.length === 1) return candidates[0];

  // Multiple candidates: prefer one at similar depth
  const bestByDepth = candidates.reduce((best, c) => {
    const depthDiff = Math.abs(c.ancestorTags.length - ax.depth);
    const bestDiff = Math.abs((best?.ancestorTags.length ?? Infinity) - ax.depth);
    return depthDiff < bestDiff ? c : best;
  }, candidates[0]);

  return bestByDepth;
}

// ── Utility functions ───────────────────────────────────────────────────────

/** Roles that are always skipped — structural containers, never actionable */
const STRUCTURAL_ROLES = new Set(["webarea", "rootwebarea", "document", "none", "presentation"]);
function isStructuralRole(role: string): boolean {
  return STRUCTURAL_ROLES.has(role.toLowerCase());
}

/** Roles that are skipped when they have no accessible name */
const GENERIC_ROLES = new Set([
  "generic",
  "group",
  "article",
  "section",
  "region",
  "list",
  "listitem",
  "paragraph",
  "blockquote",
  "figure",
  "separator",
  "status",
]);
function isGenericRole(role: string): boolean {
  const generic = GENERIC_ROLES;
  return generic.has(role.toLowerCase());
}

const ROLE_TAG_MAP: Record<string, string> = {
  button: "button",
  link: "a",
  textbox: "input",
  checkbox: "input",
  radio: "input",
  combobox: "select",
  listbox: "select",
  menuitem: "li",
  tab: "button",
  switch: "input",
  slider: "input",
  spinbutton: "input",
  searchbox: "input",
  heading: "h1",
  img: "img",
  navigation: "nav",
  banner: "header",
  contentinfo: "footer",
  main: "main",
  complementary: "aside",
};

function roleToTag(role: string): string {
  return ROLE_TAG_MAP[role] ?? "";
}

function detectRegion(ancestorRoles: string[]): SemanticRegion {
  // Walk ancestors from innermost to outermost looking for landmark roles
  for (let i = ancestorRoles.length - 1; i >= 0; i--) {
    const role = ancestorRoles[i]!;
    const region = LANDMARK_ROLE_MAP[role];
    if (region) return region as SemanticRegion;
  }
  return "unknown";
}

function buildSelectorHint(role: string, name: string, index: number): string {
  if (name) {
    return `role=${role}[name="${name}"]`;
  }
  return `role=${role}[index=${index}]`;
}

function findLabelForNode(
  nodeIndex: number,
  nodes: CDPDOMSnapshotDocument["nodes"],
  strings: string[],
  nodeCount: number
): string | undefined {
  // Check if parent is a <label>
  const parentIdx = nodes.parentIndex[nodeIndex] ?? -1;
  if (parentIdx >= 0 && parentIdx < nodeCount) {
    const parentNameIdx = nodes.nodeName[parentIdx] ?? 0;
    const parentTag = (strings[parentNameIdx] ?? "").toLowerCase();
    if (parentTag === "label") {
      // Look for text content in label's children
      for (let i = 0; i < nodeCount; i++) {
        if (nodes.parentIndex[i] === parentIdx && nodes.nodeType[i] === 3) {
          const textIdx = nodes.nodeValue[i] ?? 0;
          const text = strings[textIdx] ?? "";
          if (text.trim()) return normalizeAccessibleName(text);
        }
      }
    }
  }
  return undefined;
}
