/**
 * @fileoverview BAP selector types with Zod schemas
 * @module bap-core/types/selectors
 */

import { z } from "zod";

// =============================================================================
// ARIA Roles
// =============================================================================

/**
 * ARIA roles for role-based selectors
 * @see https://www.w3.org/TR/wai-aria-1.2/#role_definitions
 */
export const AriaRoleSchema = z.enum([
  "alert",
  "alertdialog",
  "application",
  "article",
  "banner",
  "button",
  "cell",
  "checkbox",
  "columnheader",
  "combobox",
  "complementary",
  "contentinfo",
  "definition",
  "dialog",
  "directory",
  "document",
  "feed",
  "figure",
  "form",
  "grid",
  "gridcell",
  "group",
  "heading",
  "img",
  "link",
  "list",
  "listbox",
  "listitem",
  "log",
  "main",
  "marquee",
  "math",
  "menu",
  "menubar",
  "menuitem",
  "menuitemcheckbox",
  "menuitemradio",
  "navigation",
  "none",
  "note",
  "option",
  "presentation",
  "progressbar",
  "radio",
  "radiogroup",
  "region",
  "row",
  "rowgroup",
  "rowheader",
  "scrollbar",
  "search",
  "searchbox",
  "separator",
  "slider",
  "spinbutton",
  "status",
  "switch",
  "tab",
  "table",
  "tablist",
  "tabpanel",
  "term",
  "textbox",
  "timer",
  "toolbar",
  "tooltip",
  "tree",
  "treegrid",
  "treeitem",
]);
export type AriaRole = z.infer<typeof AriaRoleSchema>;

// =============================================================================
// Selector Schemas
// =============================================================================

/** CSS selector */
export const CSSSelectorSchema = z.object({
  type: z.literal("css"),
  value: z.string(),
});
export type CSSSelector = z.infer<typeof CSSSelectorSchema>;

/** XPath selector */
export const XPathSelectorSchema = z.object({
  type: z.literal("xpath"),
  value: z.string(),
});
export type XPathSelector = z.infer<typeof XPathSelectorSchema>;

/** Role-based selector (ARIA) */
export const RoleSelectorSchema = z.object({
  type: z.literal("role"),
  role: AriaRoleSchema,
  name: z.string().optional(),
  exact: z.boolean().optional(),
});
export type RoleSelector = z.infer<typeof RoleSelectorSchema>;

/** Text content selector */
export const TextSelectorSchema = z.object({
  type: z.literal("text"),
  value: z.string(),
  exact: z.boolean().optional(),
});
export type TextSelector = z.infer<typeof TextSelectorSchema>;

/** Label selector (for form elements) */
export const LabelSelectorSchema = z.object({
  type: z.literal("label"),
  value: z.string(),
  exact: z.boolean().optional(),
});
export type LabelSelector = z.infer<typeof LabelSelectorSchema>;

/** Placeholder selector (for inputs) */
export const PlaceholderSelectorSchema = z.object({
  type: z.literal("placeholder"),
  value: z.string(),
  exact: z.boolean().optional(),
});
export type PlaceholderSelector = z.infer<typeof PlaceholderSelectorSchema>;

/** Test ID selector (data-testid attribute) */
export const TestIdSelectorSchema = z.object({
  type: z.literal("testId"),
  value: z.string(),
});
export type TestIdSelector = z.infer<typeof TestIdSelectorSchema>;

/** Semantic selector (AI-resolved) */
export const SemanticSelectorSchema = z.object({
  type: z.literal("semantic"),
  description: z.string(),
});
export type SemanticSelector = z.infer<typeof SemanticSelectorSchema>;

/** Coordinate-based selector */
export const CoordinatesSelectorSchema = z.object({
  type: z.literal("coordinates"),
  x: z.number(),
  y: z.number(),
});
export type CoordinatesSelector = z.infer<typeof CoordinatesSelectorSchema>;

/**
 * Ref selector - reference a stable element by its ref ID
 * Used with the Element Reference System for targeting elements by their stable refs
 */
export const RefSelectorSchema = z.object({
  type: z.literal("ref"),
  /** Element reference (e.g., "@submitBtn" or "@e1") */
  ref: z.string(),
});
export type RefSelector = z.infer<typeof RefSelectorSchema>;

/**
 * Union of all selector types with discriminator
 *
 * @example
 * // Role-based (recommended)
 * const submitBtn: BAPSelector = { type: "role", role: "button", name: "Submit" };
 *
 * // Text-based
 * const heading: BAPSelector = { type: "text", value: "Welcome", exact: false };
 *
 * // CSS fallback
 * const custom: BAPSelector = { type: "css", value: ".my-custom-class" };
 *
 * // Ref-based (for stable element refs)
 * const element: BAPSelector = { type: "ref", ref: "@submitBtn" };
 */
export const BAPSelectorSchema = z.discriminatedUnion("type", [
  CSSSelectorSchema,
  XPathSelectorSchema,
  RoleSelectorSchema,
  TextSelectorSchema,
  LabelSelectorSchema,
  PlaceholderSelectorSchema,
  TestIdSelectorSchema,
  SemanticSelectorSchema,
  CoordinatesSelectorSchema,
  RefSelectorSchema,
]);
export type BAPSelector = z.infer<typeof BAPSelectorSchema>;

// =============================================================================
// Selector Factory Functions
// =============================================================================

/** Create a CSS selector */
export function css(value: string): CSSSelector {
  return { type: "css", value };
}

/** Create an XPath selector */
export function xpath(value: string): XPathSelector {
  return { type: "xpath", value };
}

/** Create a role-based selector (recommended) */
export function role(role: AriaRole, name?: string, exact?: boolean): RoleSelector {
  return { type: "role", role, name, exact };
}

/** Create a text selector */
export function text(value: string, exact?: boolean): TextSelector {
  return { type: "text", value, exact };
}

/** Create a label selector */
export function label(value: string, exact?: boolean): LabelSelector {
  return { type: "label", value, exact };
}

/** Create a placeholder selector */
export function placeholder(value: string, exact?: boolean): PlaceholderSelector {
  return { type: "placeholder", value, exact };
}

/** Create a test ID selector */
export function testId(value: string): TestIdSelector {
  return { type: "testId", value };
}

/** Create a semantic selector (AI-resolved) */
export function semantic(description: string): SemanticSelector {
  return { type: "semantic", description };
}

/** Create a coordinates selector */
export function coords(x: number, y: number): CoordinatesSelector {
  return { type: "coordinates", x, y };
}

/** Create a ref selector (for stable element refs) */
export function ref(refId: string): RefSelector {
  return { type: "ref", ref: refId };
}
