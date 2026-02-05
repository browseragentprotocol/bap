/**
 * @fileoverview JSON-RPC 2.0 protocol types with Zod schemas
 * @module bap-core/types/protocol
 */

import { z } from "zod";

// =============================================================================
// Protocol Version
// =============================================================================

/** Current BAP protocol version */
export const BAP_VERSION = "0.1.0";

// =============================================================================
// JSON-RPC 2.0 Schemas
// =============================================================================

/** JSON-RPC request ID */
export const RequestIdSchema = z.union([z.string(), z.number()]);
export type RequestId = z.infer<typeof RequestIdSchema>;

/** JSON-RPC error data */
export const JSONRPCErrorDataSchema = z
  .object({
    retryable: z.boolean(),
    retryAfterMs: z.number().optional(),
    details: z.record(z.unknown()).optional(),
  })
  .optional();

/** JSON-RPC error object */
export const JSONRPCErrorSchema = z.object({
  code: z.number(),
  message: z.string(),
  data: JSONRPCErrorDataSchema,
});
export type JSONRPCError = z.infer<typeof JSONRPCErrorSchema>;

/** JSON-RPC request message */
export const JSONRPCRequestSchema = z.object({
  jsonrpc: z.literal("2.0"),
  id: RequestIdSchema,
  method: z.string(),
  params: z.record(z.unknown()).optional(),
});
export type JSONRPCRequest = z.infer<typeof JSONRPCRequestSchema>;

/** JSON-RPC success response */
export const JSONRPCSuccessResponseSchema = z.object({
  jsonrpc: z.literal("2.0"),
  id: RequestIdSchema,
  result: z.unknown(),
});
export type JSONRPCSuccessResponse = z.infer<typeof JSONRPCSuccessResponseSchema>;

/** JSON-RPC error response */
export const JSONRPCErrorResponseSchema = z.object({
  jsonrpc: z.literal("2.0"),
  id: RequestIdSchema,
  error: JSONRPCErrorSchema,
});
export type JSONRPCErrorResponse = z.infer<typeof JSONRPCErrorResponseSchema>;

/** JSON-RPC notification (no id, no response expected) */
export const JSONRPCNotificationSchema = z.object({
  jsonrpc: z.literal("2.0"),
  method: z.string(),
  params: z.record(z.unknown()).optional(),
});
export type JSONRPCNotification = z.infer<typeof JSONRPCNotificationSchema>;

/** Union of all JSON-RPC response types */
export const JSONRPCResponseSchema = z.union([
  JSONRPCSuccessResponseSchema,
  JSONRPCErrorResponseSchema,
]);
export type JSONRPCResponse = z.infer<typeof JSONRPCResponseSchema>;

/** Union of all JSON-RPC message types */
export const JSONRPCMessageSchema = z.union([
  JSONRPCRequestSchema,
  JSONRPCSuccessResponseSchema,
  JSONRPCErrorResponseSchema,
  JSONRPCNotificationSchema,
]);
export type JSONRPCMessage = z.infer<typeof JSONRPCMessageSchema>;

// =============================================================================
// Error Codes
// =============================================================================

/**
 * Standard JSON-RPC and BAP-specific error codes
 */
export const ErrorCodes = {
  // Standard JSON-RPC errors
  ParseError: -32700,
  InvalidRequest: -32600,
  MethodNotFound: -32601,
  InvalidParams: -32602,
  InternalError: -32603,

  // Server errors
  ServerError: -32000,
  NotInitialized: -32001,
  AlreadyInitialized: -32002,

  // BAP-specific errors
  BrowserNotLaunched: -32010,
  PageNotFound: -32011,
  ElementNotFound: -32012,
  ElementNotVisible: -32013,
  ElementNotEnabled: -32014,
  NavigationFailed: -32015,
  Timeout: -32016,
  TargetClosed: -32017,
  ExecutionContextDestroyed: -32018,
  SelectorAmbiguous: -32020,
  ActionFailed: -32021,
  InterceptedRequest: -32022,

  // Context errors (Multi-Context Support)
  ContextNotFound: -32023,
  ResourceLimitExceeded: -32024,

  // Approval errors (Human-in-the-Loop)
  ApprovalDenied: -32030,
  ApprovalTimeout: -32031,
  ApprovalRequired: -32032,

  // Frame errors (Frame & Shadow DOM Support)
  FrameNotFound: -32040,
  DomainNotAllowed: -32041,

  // Stream errors (Streaming Responses)
  StreamNotFound: -32050,
  StreamCancelled: -32051,
} as const;

export type ErrorCode = (typeof ErrorCodes)[keyof typeof ErrorCodes];

// =============================================================================
// Type Guards
// =============================================================================

/** Type guard to check if a message is a request */
export function isRequest(message: JSONRPCMessage): message is JSONRPCRequest {
  return "id" in message && "method" in message;
}

/** Type guard to check if a message is a response */
export function isResponse(message: JSONRPCMessage): message is JSONRPCResponse {
  return "id" in message && !("method" in message);
}

/** Type guard to check if a message is a notification */
export function isNotification(message: JSONRPCMessage): message is JSONRPCNotification {
  return !("id" in message) && "method" in message;
}

/**
 * Type guard to check if a response is an error
 * SECURITY FIX (HIGH-10): Validates full error object structure, not just property existence
 */
export function isErrorResponse(response: JSONRPCResponse): response is JSONRPCErrorResponse {
  if (!("error" in response)) {
    return false;
  }

  const { error } = response as { error: unknown };

  // Validate error object structure
  if (typeof error !== 'object' || error === null) {
    return false;
  }

  const errorObj = error as Record<string, unknown>;

  // Required fields: code (number) and message (string)
  if (typeof errorObj.code !== 'number' || typeof errorObj.message !== 'string') {
    return false;
  }

  return true;
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Helper to create a typed BAP request
 */
export function createRequest<T extends Record<string, unknown>>(
  id: string | number,
  method: string,
  params?: T
): JSONRPCRequest {
  return {
    jsonrpc: "2.0",
    id,
    method,
    params,
  };
}

/**
 * Helper to create a success response
 */
export function createSuccessResponse<T>(
  id: string | number,
  result: T
): JSONRPCSuccessResponse {
  return {
    jsonrpc: "2.0",
    id,
    result,
  };
}

/**
 * Helper to create an error response
 */
export function createErrorResponse(
  id: string | number,
  code: ErrorCode | number,
  message: string,
  data?: JSONRPCError["data"]
): JSONRPCErrorResponse {
  return {
    jsonrpc: "2.0",
    id,
    error: {
      code,
      message,
      data,
    },
  };
}

/**
 * Helper to create a notification
 */
export function createNotification<T extends Record<string, unknown>>(
  method: string,
  params?: T
): JSONRPCNotification {
  return {
    jsonrpc: "2.0",
    method,
    params,
  };
}
