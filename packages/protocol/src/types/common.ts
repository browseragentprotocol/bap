/**
 * @fileoverview Common BAP types with Zod schemas
 * @module bap-core/types/common
 */

import { z } from "zod";
import { BAPSelectorSchema } from "./selectors.js";

// =============================================================================
// Bounding Box
// =============================================================================

/** Rectangle representing element position and size */
export const BoundingBoxSchema = z.object({
  x: z.number(),
  y: z.number(),
  width: z.number(),
  height: z.number(),
});
export type BoundingBox = z.infer<typeof BoundingBoxSchema>;

// =============================================================================
// Action Options
// =============================================================================

/** Keyboard modifiers */
export const KeyModifierSchema = z.enum(["Alt", "Control", "Meta", "Shift"]);
export type KeyModifier = z.infer<typeof KeyModifierSchema>;

/** Mouse buttons */
export const MouseButtonSchema = z.enum(["left", "right", "middle"]);
export type MouseButton = z.infer<typeof MouseButtonSchema>;

/** Base options for all actions */
export const ActionOptionsSchema = z.object({
  timeout: z.number().optional(),
  force: z.boolean().optional(),
  noWaitAfter: z.boolean().optional(),
  trial: z.boolean().optional(),
});
export type ActionOptions = z.infer<typeof ActionOptionsSchema>;

/** Options for click actions */
export const ClickOptionsSchema = ActionOptionsSchema.extend({
  button: MouseButtonSchema.optional(),
  clickCount: z.number().optional(),
  modifiers: z.array(KeyModifierSchema).optional(),
  position: z.object({ x: z.number(), y: z.number() }).optional(),
});
export type ClickOptions = z.infer<typeof ClickOptionsSchema>;

/** Options for type actions */
export const TypeOptionsSchema = ActionOptionsSchema.extend({
  delay: z.number().optional(),
  clear: z.boolean().optional(),
});
export type TypeOptions = z.infer<typeof TypeOptionsSchema>;

/** Scroll direction */
export const ScrollDirectionSchema = z.enum(["up", "down", "left", "right"]);
export type ScrollDirection = z.infer<typeof ScrollDirectionSchema>;

/** Scroll amount */
export const ScrollAmountSchema = z.union([
  z.number(),
  z.literal("page"),
  z.literal("toElement"),
]);
export type ScrollAmount = z.infer<typeof ScrollAmountSchema>;

/** Options for scroll actions */
export const ScrollOptionsSchema = ActionOptionsSchema.extend({
  direction: ScrollDirectionSchema.optional(),
  amount: ScrollAmountSchema.optional(),
});
export type ScrollOptions = z.infer<typeof ScrollOptionsSchema>;

// =============================================================================
// Screenshot Options
// =============================================================================

/** Screenshot format */
export const ScreenshotFormatSchema = z.enum(["png", "jpeg", "webp"]);
export type ScreenshotFormat = z.infer<typeof ScreenshotFormatSchema>;

/** Screenshot scale mode */
export const ScreenshotScaleSchema = z.enum(["css", "device"]);
export type ScreenshotScale = z.infer<typeof ScreenshotScaleSchema>;

/** Options for screenshot capture */
export const ScreenshotOptionsSchema = z.object({
  fullPage: z.boolean().optional(),
  clip: BoundingBoxSchema.optional(),
  format: ScreenshotFormatSchema.optional(),
  quality: z.number().min(0).max(100).optional(),
  scale: ScreenshotScaleSchema.optional(),
  mask: z.array(BAPSelectorSchema).optional(),
});
export type ScreenshotOptions = z.infer<typeof ScreenshotOptionsSchema>;

// =============================================================================
// Page Types
// =============================================================================

/** Page loading status */
export const PageStatusSchema = z.enum(["loading", "ready", "error"]);
export type PageStatus = z.infer<typeof PageStatusSchema>;

/** Navigation wait condition */
export const WaitUntilStateSchema = z.enum([
  "load",
  "domcontentloaded",
  "networkidle",
  "commit",
]);
export type WaitUntilState = z.infer<typeof WaitUntilStateSchema>;

/** Viewport dimensions */
export const ViewportSchema = z.object({
  width: z.number(),
  height: z.number(),
});
export type Viewport = z.infer<typeof ViewportSchema>;

/** Represents a browser page (tab) */
export const PageSchema = z.object({
  id: z.string(),
  url: z.string(),
  title: z.string(),
  viewport: ViewportSchema,
  status: PageStatusSchema,
});
export type Page = z.infer<typeof PageSchema>;

// =============================================================================
// Storage Types
// =============================================================================

/** SameSite cookie attribute */
export const SameSiteAttributeSchema = z.enum(["Strict", "Lax", "None"]);
export type SameSiteAttribute = z.infer<typeof SameSiteAttributeSchema>;

/** Browser cookie */
export const CookieSchema = z.object({
  name: z.string(),
  value: z.string(),
  domain: z.string(),
  path: z.string(),
  expires: z.number().optional(),
  httpOnly: z.boolean().optional(),
  secure: z.boolean().optional(),
  sameSite: SameSiteAttributeSchema.optional(),
});
export type Cookie = z.infer<typeof CookieSchema>;

/** Storage item (key-value pair) */
export const StorageItemSchema = z.object({
  name: z.string(),
  value: z.string(),
});

/** Origin-specific storage data */
export const OriginStorageSchema = z.object({
  origin: z.string(),
  localStorage: z.array(StorageItemSchema),
  sessionStorage: z.array(StorageItemSchema).optional(),
});
export type OriginStorage = z.infer<typeof OriginStorageSchema>;

/** Complete browser storage state (for auth persistence) */
export const StorageStateSchema = z.object({
  cookies: z.array(CookieSchema),
  origins: z.array(OriginStorageSchema),
});
export type StorageState = z.infer<typeof StorageStateSchema>;

// =============================================================================
// Accessibility Types
// =============================================================================

/** Checked state */
export const CheckedStateSchema = z.union([
  z.boolean(),
  z.literal("mixed"),
]);
export type CheckedState = z.infer<typeof CheckedStateSchema>;

/** Node in the accessibility tree */
export interface AccessibilityNode {
  role: string;
  name?: string;
  value?: string;
  description?: string;
  checked?: CheckedState;
  disabled?: boolean;
  expanded?: boolean;
  focused?: boolean;
  selected?: boolean;
  required?: boolean;
  level?: number;
  boundingBox?: BoundingBox;
  children?: AccessibilityNode[];
}

// Using z.lazy for recursive type
export const AccessibilityNodeSchema: z.ZodType<AccessibilityNode> = z.lazy(() =>
  z.object({
    role: z.string(),
    name: z.string().optional(),
    value: z.string().optional(),
    description: z.string().optional(),
    checked: CheckedStateSchema.optional(),
    disabled: z.boolean().optional(),
    expanded: z.boolean().optional(),
    focused: z.boolean().optional(),
    selected: z.boolean().optional(),
    required: z.boolean().optional(),
    level: z.number().optional(),
    boundingBox: BoundingBoxSchema.optional(),
    children: z.array(AccessibilityNodeSchema).optional(),
  })
);

// =============================================================================
// Content Types
// =============================================================================

/** Content format */
export const ContentFormatSchema = z.enum(["html", "text", "markdown"]);
export type ContentFormat = z.infer<typeof ContentFormatSchema>;

// =============================================================================
// Network Types
// =============================================================================

/** HTTP method */
export const HttpMethodSchema = z.enum([
  "GET",
  "POST",
  "PUT",
  "DELETE",
  "PATCH",
  "HEAD",
  "OPTIONS",
]);
export type HttpMethod = z.infer<typeof HttpMethodSchema>;

/** Resource type */
export const ResourceTypeSchema = z.enum([
  "document",
  "stylesheet",
  "image",
  "media",
  "font",
  "script",
  "texttrack",
  "xhr",
  "fetch",
  "eventsource",
  "websocket",
  "manifest",
  "other",
]);
export type ResourceType = z.infer<typeof ResourceTypeSchema>;
