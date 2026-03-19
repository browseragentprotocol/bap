/**
 * @fileoverview WebMCP discovery types for BAP
 * @module @browseragentprotocol/protocol/types/discovery
 *
 * Types for discovering WebMCP tools exposed by web pages.
 * WebMCP (W3C Community Group) lets websites expose structured tools
 * to AI agents via browser-native APIs. BAP bridges these tools
 * through the discovery/* protocol namespace.
 */

import { z } from "zod";

// =============================================================================
// WebMCP Tool Types
// =============================================================================

/**
 * Source API surface that exposed the WebMCP tool
 */
export const WebMCPToolSourceSchema = z.enum([
  "webmcp-declarative",  // HTML attributes (form[toolname], tooldescription, toolparamdescription)
  "webmcp-imperative",   // JavaScript API (navigator.modelContext)
]);
export type WebMCPToolSource = z.infer<typeof WebMCPToolSourceSchema>;

/**
 * A WebMCP tool discovered on a page
 */
export const WebMCPToolSchema = z.object({
  /** Tool name (from toolname attribute or imperative API) */
  name: z.string(),

  /** Human-readable description of what the tool does */
  description: z.string().optional(),

  /** JSON Schema for tool input parameters */
  inputSchema: z.record(z.unknown()).optional(),

  /** Which API surface exposed this tool */
  source: WebMCPToolSourceSchema,

  /** CSS selector for the associated form element (declarative tools only) */
  formSelector: z.string().optional(),
});
export type WebMCPTool = z.infer<typeof WebMCPToolSchema>;

// =============================================================================
// discovery/discover
// =============================================================================

/**
 * Options for tool discovery
 */
export const DiscoveryDiscoverOptionsSchema = z.object({
  /** Maximum number of tools to return (default: 50) */
  maxTools: z.number().optional(),

  /** Include JSON schemas for tool input parameters (default: true) */
  includeInputSchemas: z.boolean().optional(),
});
export type DiscoveryDiscoverOptions = z.infer<typeof DiscoveryDiscoverOptionsSchema>;

/**
 * Parameters for discovery/discover
 */
export const DiscoveryDiscoverParamsSchema = z.object({
  /** Page to discover tools on (defaults to active page) */
  pageId: z.string().optional(),

  /** Discovery options */
  options: DiscoveryDiscoverOptionsSchema.optional(),
});
export type DiscoveryDiscoverParams = z.infer<typeof DiscoveryDiscoverParamsSchema>;

/**
 * Result of discovery/discover
 */
export const DiscoveryDiscoverResultSchema = z.object({
  /** Discovered WebMCP tools */
  tools: z.array(WebMCPToolSchema),

  /** Total number of tools discovered (before maxTools limit) */
  totalDiscovered: z.number(),

  /** WebMCP API version detected on the page, if available */
  apiVersion: z.string().optional(),
});
export type DiscoveryDiscoverResult = z.infer<typeof DiscoveryDiscoverResultSchema>;
