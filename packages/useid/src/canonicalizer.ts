/**
 * Text and attribute normalization for uSEID.
 * All functions are pure — no side effects.
 */

/**
 * Normalize an accessible name for comparison:
 * - Collapse whitespace (including newlines, tabs) to single spaces
 * - Trim leading/trailing whitespace
 * - Lowercase for case-insensitive matching
 * - Normalize unicode to NFC form
 */
export function normalizeAccessibleName(name: string): string {
  if (!name) return "";
  return name.normalize("NFC").replace(/\s+/g, " ").trim().toLowerCase();
}

/**
 * Normalize an HTML tag name to lowercase.
 */
export function normalizeTag(tag: string): string {
  if (!tag) return "";
  return tag.toLowerCase();
}

/**
 * Normalize an ARIA role to lowercase.
 */
export function normalizeRole(role: string): string {
  if (!role) return "";
  return role.toLowerCase();
}

/**
 * Tokenize a label/name into comparable word tokens.
 * - Splits on whitespace, punctuation, and camelCase boundaries
 * - Lowercases all tokens
 * - Filters out empty tokens
 */
export function tokenize(text: string): string[] {
  if (!text) return [];
  return (
    text
      .normalize("NFC")
      // Insert space before uppercase in camelCase
      .replace(/([a-z])([A-Z])/g, "$1 $2")
      // Split on non-alphanumeric
      .split(/[^a-zA-Z0-9]+/)
      .map((t) => t.toLowerCase())
      .filter((t) => t.length > 0)
  );
}

/**
 * Compute the Jaccard similarity between two string arrays.
 * Returns 0 if both are empty, 1 if identical.
 */
export function jaccardSimilarity(a: string[], b: string[]): number {
  if (a.length === 0 && b.length === 0) return 1;
  if (a.length === 0 || b.length === 0) return 0;
  const setA = new Set(a);
  const setB = new Set(b);
  let intersection = 0;
  for (const item of setA) {
    if (setB.has(item)) intersection++;
  }
  const union = setA.size + setB.size - intersection;
  return union > 0 ? intersection / union : 0;
}

/**
 * Compute normalized string similarity between two accessible names.
 * Returns: 1.0 for exact match, 0.8 for normalized match, 0.5 for fuzzy, 0 for no match.
 */
export function nameSimilarity(a: string, b: string): number {
  if (a === b) return 1.0;
  const normA = normalizeAccessibleName(a);
  const normB = normalizeAccessibleName(b);
  if (normA === normB) return 0.8;
  // Fuzzy: check token overlap
  const tokensA = tokenize(a);
  const tokensB = tokenize(b);
  const jaccard = jaccardSimilarity(tokensA, tokensB);
  if (jaccard >= 0.5) return 0.5;
  return 0;
}
