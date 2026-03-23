/** Default safety threshold — abstain if confidence below this */
export const DEFAULT_THRESHOLD = 0.85;

/** Default margin between top-1 and top-2 candidates */
export const DEFAULT_MARGIN_CONSTRAINT = 0.1;

/** Default scoring weights */
export const DEFAULT_WEIGHTS = {
  semantic: 0.5,
  structural: 0.3,
  spatial: 0.2,
} as const;

/** Max ancestor levels stored in a signature */
export const MAX_ANCESTOR_LEVELS = 10;

/** Max sibling tokens stored in a signature */
export const MAX_SIBLING_TOKENS = 5;

/** Semantic score multiplier when accessible name changes beyond normalization */
export const NAME_CHANGE_PENALTY = 0.3;

/** Semantic sub-scores for name matching quality */
export const NAME_MATCH_EXACT = 1.0;
export const NAME_MATCH_NORMALIZED = 0.8;
export const NAME_MATCH_FUZZY = 0.5;

/** Default viewport dimensions for spatial normalization */
export const DEFAULT_VIEWPORT_WIDTH = 1024;
export const DEFAULT_VIEWPORT_HEIGHT = 768;

/** uSEID schema version */
export const USEID_VERSION = 1 as const;

/** Landmark roles that map to semantic regions */
export const LANDMARK_ROLE_MAP: Record<string, string> = {
  banner: "header",
  navigation: "nav",
  main: "main",
  contentinfo: "footer",
  complementary: "aside",
};

/** Landmark tags that map to semantic regions */
export const LANDMARK_TAG_MAP: Record<string, string> = {
  header: "header",
  nav: "nav",
  main: "main",
  footer: "footer",
  aside: "aside",
};
