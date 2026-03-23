// uSEID — Universal Semantic Element ID
// Stable cross-run element identity via ARIA semantics + DOM structure + visual anchoring

// Types and schemas
export {
  type FramePathEntry,
  type SemanticRegion,
  type USEIDSemantic,
  type USEIDStructure,
  type USEIDSpatial,
  type USEIDStability,
  type USEIDSignature,
  type MatchWeights,
  type USEIDConfig,
  type CandidateResult,
  type ResolveResult,
  type NormalizedElement,
  type BoundingBox,
  FramePathEntrySchema,
  SemanticRegionSchema,
  USEIDSemanticSchema,
  USEIDStructureSchema,
  USEIDSpatialSchema,
  USEIDStabilitySchema,
  USEIDSignatureSchema,
  MatchWeightsSchema,
  USEIDConfigSchema,
  CandidateResultSchema,
  ResolveResultSchema,
  BoundingBoxSchema,
} from "./types.js";

// Constants
export {
  DEFAULT_THRESHOLD,
  DEFAULT_MARGIN_CONSTRAINT,
  DEFAULT_WEIGHTS,
  MAX_ANCESTOR_LEVELS,
  MAX_SIBLING_TOKENS,
  USEID_VERSION,
  LANDMARK_ROLE_MAP,
  LANDMARK_TAG_MAP,
} from "./constants.js";
