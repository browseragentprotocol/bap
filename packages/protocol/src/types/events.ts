/**
 * @fileoverview BAP event types with Zod schemas
 * @module bap-core/types/events
 */

import { z } from "zod";
import { HttpMethodSchema, ResourceTypeSchema } from "./common.js";

// =============================================================================
// Page Events
// =============================================================================

/** Page event types */
export const PageEventTypeSchema = z.enum([
  "load",
  "domcontentloaded",
  "navigated",
  "error",
  "close",
]);
export type PageEventType = z.infer<typeof PageEventTypeSchema>;

/** Page event payload */
export const PageEventSchema = z.object({
  type: PageEventTypeSchema,
  pageId: z.string(),
  url: z.string().optional(),
  error: z.string().optional(),
  timestamp: z.number(),
});
export type PageEvent = z.infer<typeof PageEventSchema>;

// =============================================================================
// Console Events
// =============================================================================

/** Console log level */
export const ConsoleLevelSchema = z.enum(["log", "debug", "info", "warn", "error"]);
export type ConsoleLevel = z.infer<typeof ConsoleLevelSchema>;

/** Console event payload */
export const ConsoleEventSchema = z.object({
  pageId: z.string(),
  level: ConsoleLevelSchema,
  text: z.string(),
  url: z.string().optional(),
  line: z.number().optional(),
  column: z.number().optional(),
  timestamp: z.number(),
});
export type ConsoleEvent = z.infer<typeof ConsoleEventSchema>;

// =============================================================================
// Network Events
// =============================================================================

/** Network request timing information */
export const RequestTimingSchema = z.object({
  dnsLookup: z.number(),
  connect: z.number(),
  ssl: z.number(),
  ttfb: z.number(),
  download: z.number(),
});
export type RequestTiming = z.infer<typeof RequestTimingSchema>;

/** Network request event payload */
export const NetworkRequestEventSchema = z.object({
  type: z.literal("request"),
  requestId: z.string(),
  pageId: z.string(),
  url: z.string(),
  method: HttpMethodSchema,
  resourceType: ResourceTypeSchema,
  headers: z.record(z.string()),
  postData: z.string().optional(),
  timestamp: z.number(),
});
export type NetworkRequestEvent = z.infer<typeof NetworkRequestEventSchema>;

/** Network response event payload */
export const NetworkResponseEventSchema = z.object({
  type: z.literal("response"),
  requestId: z.string(),
  pageId: z.string(),
  url: z.string(),
  status: z.number(),
  headers: z.record(z.string()),
  timing: RequestTimingSchema.optional(),
  timestamp: z.number(),
});
export type NetworkResponseEvent = z.infer<typeof NetworkResponseEventSchema>;

/** Network failure event payload */
export const NetworkFailedEventSchema = z.object({
  type: z.literal("failed"),
  requestId: z.string(),
  pageId: z.string(),
  url: z.string(),
  error: z.string(),
  timestamp: z.number(),
});
export type NetworkFailedEvent = z.infer<typeof NetworkFailedEventSchema>;

/** Union of network events */
export const NetworkEventSchema = z.discriminatedUnion("type", [
  NetworkRequestEventSchema,
  NetworkResponseEventSchema,
  NetworkFailedEventSchema,
]);
export type NetworkEvent = z.infer<typeof NetworkEventSchema>;

// =============================================================================
// Dialog Events
// =============================================================================

/** Dialog type */
export const DialogTypeSchema = z.enum(["alert", "confirm", "prompt", "beforeunload"]);
export type DialogType = z.infer<typeof DialogTypeSchema>;

/** Dialog event payload */
export const DialogEventSchema = z.object({
  pageId: z.string(),
  type: DialogTypeSchema,
  message: z.string(),
  defaultValue: z.string().optional(),
  timestamp: z.number(),
});
export type DialogEvent = z.infer<typeof DialogEventSchema>;

// =============================================================================
// Download Events
// =============================================================================

/** Download state */
export const DownloadStateSchema = z.enum(["started", "completed", "canceled", "failed"]);
export type DownloadState = z.infer<typeof DownloadStateSchema>;

/** Download event payload */
export const DownloadEventSchema = z.object({
  pageId: z.string(),
  url: z.string(),
  suggestedFilename: z.string(),
  state: DownloadStateSchema,
  path: z.string().optional(),
  error: z.string().optional(),
  timestamp: z.number(),
});
export type DownloadEvent = z.infer<typeof DownloadEventSchema>;

// =============================================================================
// Event Union
// =============================================================================

/** Event type names for subscription */
export const EventTypeSchema = z.enum(["page", "console", "network", "dialog", "download"]);
export type EventType = z.infer<typeof EventTypeSchema>;

/** Union of all BAP events */
export type BAPEvent = PageEvent | ConsoleEvent | NetworkEvent | DialogEvent | DownloadEvent;
