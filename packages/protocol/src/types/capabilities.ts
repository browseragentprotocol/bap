/**
 * @fileoverview BAP capability types with Zod schemas
 * @module bap-core/types/capabilities
 */

import { z } from "zod";

// =============================================================================
// Client Capabilities
// =============================================================================

/**
 * Client capabilities declared during initialization
 */
export const ClientCapabilitiesSchema = z.object({
  /** Event types the client can handle */
  events: z.array(z.string()).optional(),
  /** Observation types the client needs */
  observations: z.array(z.string()).optional(),
  /** Action types the client needs */
  actions: z.array(z.string()).optional(),
  /** Whether client can handle streamed responses */
  streaming: z.boolean().optional(),
  /** Whether client can handle compressed data */
  compression: z.boolean().optional(),
});
export type ClientCapabilities = z.infer<typeof ClientCapabilitiesSchema>;

// =============================================================================
// Server Capabilities
// =============================================================================

/**
 * Server feature flags
 */
export const ServerFeaturesSchema = z.object({
  /** Auto-waiting support */
  autoWait: z.boolean().optional(),
  /** Trace recording support */
  tracing: z.boolean().optional(),
  /** Storage state persistence */
  storageState: z.boolean().optional(),
  /** Network request interception */
  networkInterception: z.boolean().optional(),
  /** AI-resolved semantic selectors */
  semanticSelectors: z.boolean().optional(),
  /** Multiple pages per context */
  multiPage: z.boolean().optional(),
});
export type ServerFeatures = z.infer<typeof ServerFeaturesSchema>;

/**
 * Server limits
 */
export const ServerLimitsSchema = z.object({
  /** Maximum concurrent pages */
  maxPages: z.number().optional(),
  /** Maximum timeout value (ms) */
  maxTimeout: z.number().optional(),
  /** Maximum screenshot size (bytes) */
  maxScreenshotSize: z.number().optional(),
});
export type ServerLimits = z.infer<typeof ServerLimitsSchema>;

/**
 * Server capabilities returned during initialization
 */
export const ServerCapabilitiesSchema = z.object({
  /** Available browser types */
  browsers: z.array(z.string()).optional(),
  /** Supported event types */
  events: z.array(z.string()).optional(),
  /** Supported observation types */
  observations: z.array(z.string()).optional(),
  /** Supported action types */
  actions: z.array(z.string()).optional(),
  /** Feature flags */
  features: ServerFeaturesSchema.optional(),
  /** Server limits */
  limits: ServerLimitsSchema.optional(),
});
export type ServerCapabilities = z.infer<typeof ServerCapabilitiesSchema>;

// =============================================================================
// Client Info
// =============================================================================

/**
 * Client information sent during initialization
 */
export const ClientInfoSchema = z.object({
  name: z.string(),
  version: z.string(),
});
export type ClientInfo = z.infer<typeof ClientInfoSchema>;

// =============================================================================
// Server Info
// =============================================================================

/**
 * Server information returned during initialization
 */
export const ServerInfoSchema = z.object({
  name: z.string(),
  version: z.string(),
});
export type ServerInfo = z.infer<typeof ServerInfoSchema>;

// =============================================================================
// Initialize Request/Response
// =============================================================================

/**
 * Initialize request parameters
 */
export const InitializeParamsSchema = z.object({
  protocolVersion: z.string(),
  clientInfo: ClientInfoSchema,
  capabilities: ClientCapabilitiesSchema,
});
export type InitializeParams = z.infer<typeof InitializeParamsSchema>;

/**
 * Initialize response result
 */
export const InitializeResultSchema = z.object({
  protocolVersion: z.string(),
  serverInfo: ServerInfoSchema,
  capabilities: ServerCapabilitiesSchema,
});
export type InitializeResult = z.infer<typeof InitializeResultSchema>;

// =============================================================================
// Shutdown
// =============================================================================

/**
 * Shutdown request parameters
 */
export const ShutdownParamsSchema = z.object({
  saveState: z.boolean().optional(),
  closePages: z.boolean().optional(),
});
export type ShutdownParams = z.infer<typeof ShutdownParamsSchema>;
