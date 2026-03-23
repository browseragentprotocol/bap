import { z } from "zod";

// ── Frame path entry ────────────────────────────────────────────────────────

export const FramePathEntrySchema = z.object({
  /** Frame URL (origin + path) */
  url: z.string(),
  /** Ordinal among same-URL sibling frames */
  index: z.number(),
});
export type FramePathEntry = z.infer<typeof FramePathEntrySchema>;

// ── Semantic region ─────────────────────────────────────────────────────────

export const SemanticRegionSchema = z.enum(["header", "main", "footer", "nav", "aside", "unknown"]);
export type SemanticRegion = z.infer<typeof SemanticRegionSchema>;

// ── uSEID Signature ────────────────────────────────────────────────────────

export const USEIDSemanticSchema = z.object({
  /** ARIA role */
  role: z.string(),
  /** Computed accessible name */
  accessibleName: z.string(),
  /** Computed accessible description */
  accessibleDescription: z.string().optional(),
});
export type USEIDSemantic = z.infer<typeof USEIDSemanticSchema>;

export const USEIDStructureSchema = z.object({
  /** Role chain to root (max 10 levels) */
  ancestorRoles: z.array(z.string()),
  /** Tag chain to root (max 10 levels) */
  ancestorTags: z.array(z.string()),
  /** Adjacent element accessible names (max 5) */
  siblingTokens: z.array(z.string()),
  /** Associated <label> text */
  formAssociation: z.string().optional(),
  /** DOM tree depth */
  domDepth: z.number(),
});
export type USEIDStructure = z.infer<typeof USEIDStructureSchema>;

export const BoundingBoxSchema = z.object({
  x: z.number(),
  y: z.number(),
  w: z.number(),
  h: z.number(),
});
export type BoundingBox = z.infer<typeof BoundingBoxSchema>;

export const USEIDSpatialSchema = z.object({
  /** Element bounding box in page coordinates */
  bbox: BoundingBoxSchema,
  /** Viewport-relative position (0-1 normalized) */
  viewportRelative: z.object({ top: z.number(), left: z.number() }),
  /** Semantic region derived from landmark role ancestry */
  region: SemanticRegionSchema,
});
export type USEIDSpatial = z.infer<typeof USEIDSpatialSchema>;

export const USEIDStabilitySchema = z.object({
  /** Builder confidence (0-1) */
  confidence: z.number().min(0).max(1),
});
export type USEIDStability = z.infer<typeof USEIDStabilitySchema>;

export const USEIDSignatureSchema = z.object({
  /** Schema version */
  version: z.literal(1),

  /** Page origin (e.g., "https://example.com") */
  origin: z.string(),
  /** Exact canonical path (e.g., "/product/123") */
  pagePath: z.string(),
  /** Stable frame binding (empty/undefined for main frame) */
  framePath: z.array(FramePathEntrySchema).optional(),

  /** Semantic core (primary identity) */
  semantic: USEIDSemanticSchema,
  /** Structural context (disambiguation) */
  structure: USEIDStructureSchema,
  /** Spatial context (visual anchoring) */
  spatial: USEIDSpatialSchema,
  /** Stability metadata */
  stability: USEIDStabilitySchema,
  /** SHA-256 of canonical (origin + pagePath + semantic core) */
  hash: z.string(),
});
export type USEIDSignature = z.infer<typeof USEIDSignatureSchema>;

// ── Configuration ──────────────────────────────────────────────────────────

export const MatchWeightsSchema = z.object({
  /** Weight for semantic similarity (default: 0.5) */
  semantic: z.number().min(0).max(1),
  /** Weight for structural similarity (default: 0.3) */
  structural: z.number().min(0).max(1),
  /** Weight for spatial similarity (default: 0.2) */
  spatial: z.number().min(0).max(1),
});
export type MatchWeights = z.infer<typeof MatchWeightsSchema>;

export const USEIDConfigSchema = z.object({
  /** Safety threshold (default: 0.85) */
  threshold: z.number().min(0).max(1).default(0.85),
  /** Margin between top-1 and top-2 (default: 0.1) */
  marginConstraint: z.number().min(0).max(1).default(0.1),
  /** Scoring weights */
  weights: MatchWeightsSchema.default({
    semantic: 0.5,
    structural: 0.3,
    spatial: 0.2,
  }),
  /** Max ancestor levels to store (default: 10) */
  maxAncestorLevels: z.number().default(10),
  /** Max sibling tokens to store (default: 5) */
  maxSiblingTokens: z.number().default(5),
});
export type USEIDConfig = z.infer<typeof USEIDConfigSchema>;

// ── Resolve results ────────────────────────────────────────────────────────

export const CandidateResultSchema = z.object({
  /** Index in the normalized element list */
  candidateIndex: z.number(),
  /** Selector hint for consumers to locate the element */
  selectorHint: z.string(),
  /** Overall confidence score (0-1) */
  confidence: z.number(),
  /** Per-dimension scores */
  scores: z.object({
    semantic: z.number(),
    structural: z.number(),
    spatial: z.number(),
  }),
  /** Role of the candidate element */
  role: z.string(),
  /** Accessible name of the candidate element */
  accessibleName: z.string(),
});
export type CandidateResult = z.infer<typeof CandidateResultSchema>;

export const ResolveResultSchema = z.discriminatedUnion("resolved", [
  z.object({
    resolved: z.literal(true),
    selectorHint: z.string(),
    candidateIndex: z.number(),
    confidence: z.number(),
    explanation: z.string(),
    framePath: z.array(FramePathEntrySchema).optional(),
  }),
  z.object({
    resolved: z.literal(false),
    candidates: z.array(CandidateResultSchema),
    explanation: z.string(),
    abstentionReason: z.string(),
  }),
]);
export type ResolveResult = z.infer<typeof ResolveResultSchema>;

// ── Normalized element (internal) ──────────────────────────────────────────

export interface NormalizedElement {
  /** Index in the flat element list */
  index: number;
  /** ARIA role */
  role: string;
  /** Computed accessible name */
  accessibleName: string;
  /** Computed accessible description */
  accessibleDescription?: string;
  /** HTML tag name */
  tagName: string;
  /** Ancestor roles (root → element, max depth) */
  ancestorRoles: string[];
  /** Ancestor tags (root → element, max depth) */
  ancestorTags: string[];
  /** Accessible names of adjacent siblings */
  siblingTokens: string[];
  /** Associated <label> text */
  formAssociation?: string;
  /** Depth in DOM tree */
  domDepth: number;
  /** Bounding box */
  bbox: { x: number; y: number; w: number; h: number };
  /** Semantic region from landmark ancestry */
  region: SemanticRegion;
  /** Selector hint for this element */
  selectorHint: string;
}
