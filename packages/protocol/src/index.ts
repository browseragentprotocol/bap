/**
 * @fileoverview BAP Protocol - Types, schemas, and utilities
 * @module @browseragentprotocol/protocol
 *
 * This package provides the core type definitions and Zod schemas
 * for the Browser Agent Protocol (BAP). It is used by both client
 * and server implementations.
 *
 * @example
 * ```typescript
 * import {
 *   // Selectors
 *   role, text, css,
 *   // Types
 *   type BAPSelector, type Page, type AccessibilityNode,
 *   // Errors
 *   BAPError, BAPTimeoutError,
 *   // Protocol
 *   BAP_VERSION, ErrorCodes,
 * } from "@browseragentprotocol/protocol";
 *
 * // Create a selector
 * const button = role("button", "Submit");
 *
 * // Validate with Zod schemas
 * import { BAPSelectorSchema } from "@browseragentprotocol/protocol";
 * const validated = BAPSelectorSchema.parse(button);
 * ```
 */

// =============================================================================
// Types
// =============================================================================

// Re-export all types from the types module
export * from "./types/index.js";

// =============================================================================
// Shared
// =============================================================================

// Re-export all shared utilities from the shared module
export * from "./shared/index.js";

// =============================================================================
// Authorization
// =============================================================================

// Re-export authorization module
export * from "./authorization.js";

// =============================================================================
// Convenience Exports
// =============================================================================

// Export commonly used items at the top level for convenience
export {
  // Protocol version
  BAP_VERSION,
  // Error codes
  ErrorCodes,
  // Selector factory functions
  css,
  xpath,
  role,
  text,
  label,
  placeholder,
  testId,
  semantic,
  coords,
  ref,
  // Type guards
  isRequest,
  isResponse,
  isNotification,
  isErrorResponse,
} from "./types/index.js";

export {
  // Common error classes
  BAPError,
  BAPConnectionError,
  BAPTimeoutError,
  BAPElementNotFoundError,
  BAPNavigationError,
} from "./shared/index.js";
