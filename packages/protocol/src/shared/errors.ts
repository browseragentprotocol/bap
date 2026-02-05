/**
 * @fileoverview BAP error class hierarchy
 * @module @browseragentprotocol/core/shared/errors
 */

import { ErrorCodes, type ErrorCode, type JSONRPCError } from "../types/protocol.js";

/**
 * Base error class for all BAP errors
 * SECURITY FIX (CRIT-3): This is the single source of truth for BAPError.
 * Do not redefine this class in other packages.
 */
export class BAPError extends Error {
  /** Error code from the ErrorCodes enum */
  readonly code: ErrorCode | number;
  /** Whether the operation can be retried */
  readonly retryable: boolean;
  /** Suggested retry delay in milliseconds */
  readonly retryAfterMs?: number;
  /** Additional error details */
  readonly details?: Record<string, unknown>;

  /**
   * Create a new BAPError
   * Supports both new and legacy constructor signatures for backwards compatibility.
   *
   * @param codeOrMessage - Error code or message (legacy)
   * @param messageOrCode - Message or code (legacy)
   * @param options - Options or retryable flag (legacy)
   */
  constructor(
    codeOrMessage: ErrorCode | number | string,
    messageOrCode: string | number,
    options?: {
      retryable?: boolean;
      retryAfterMs?: number;
      details?: Record<string, unknown>;
      cause?: Error;
    } | boolean
  ) {
    // Support legacy signature: (message, code, retryable, retryAfterMs?, details?)
    let code: ErrorCode | number;
    let message: string;
    let retryable: boolean = false;
    let retryAfterMs: number | undefined;
    let details: Record<string, unknown> | undefined;
    let cause: Error | undefined;

    if (typeof codeOrMessage === 'string') {
      // Legacy signature: (message, code, retryable?, retryAfterMs?, details?)
      message = codeOrMessage;
      code = messageOrCode as number;
      if (typeof options === 'boolean') {
        retryable = options;
      }
    } else {
      // New signature: (code, message, options?)
      code = codeOrMessage;
      message = messageOrCode as string;
      if (options && typeof options === 'object') {
        retryable = options.retryable ?? false;
        retryAfterMs = options.retryAfterMs;
        details = options.details;
        cause = options.cause;
      }
    }

    super(message, { cause });
    this.name = "BAPError";
    this.code = code;
    this.retryable = retryable;
    this.retryAfterMs = retryAfterMs;
    this.details = details;

    // Maintain proper stack trace for where error was thrown
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }

  /**
   * Create a BAPError from a JSON-RPC error response
   */
  static fromResponse(error: JSONRPCError): BAPError {
    return createErrorFromCode(error.code as ErrorCode, error.message, {
      retryable: error.data?.retryable ?? false,
      retryAfterMs: error.data?.retryAfterMs,
      details: error.data?.details,
    });
  }

  /**
   * Alias for fromResponse for backwards compatibility
   */
  static fromRPCError(error: JSONRPCError): BAPError {
    return BAPError.fromResponse(error);
  }

  /**
   * Convert to JSON-RPC error format
   */
  toJSON(): JSONRPCError {
    return {
      code: this.code,
      message: this.message,
      data: {
        retryable: this.retryable,
        retryAfterMs: this.retryAfterMs,
        details: this.details,
      },
    };
  }
}

// =============================================================================
// Connection Errors
// =============================================================================

/**
 * Connection-related errors
 */
export class BAPConnectionError extends BAPError {
  constructor(message: string, options?: { cause?: Error; details?: Record<string, unknown> }) {
    super(ErrorCodes.ServerError, message, {
      retryable: true,
      retryAfterMs: 1000,
      ...options,
    });
    this.name = "BAPConnectionError";
  }
}

// =============================================================================
// Protocol Errors
// =============================================================================

/**
 * JSON parse error
 */
export class BAPParseError extends BAPError {
  constructor(message: string, options?: { cause?: Error }) {
    super(ErrorCodes.ParseError, message, options);
    this.name = "BAPParseError";
  }
}

/**
 * Invalid request error
 */
export class BAPInvalidRequestError extends BAPError {
  constructor(message: string, options?: { details?: Record<string, unknown> }) {
    super(ErrorCodes.InvalidRequest, message, options);
    this.name = "BAPInvalidRequestError";
  }
}

/**
 * Method not found error
 */
export class BAPMethodNotFoundError extends BAPError {
  constructor(method: string) {
    super(ErrorCodes.MethodNotFound, `Method not found: ${method}`);
    this.name = "BAPMethodNotFoundError";
  }
}

/**
 * Invalid parameters error
 */
export class BAPInvalidParamsError extends BAPError {
  constructor(message: string, options?: { details?: Record<string, unknown> }) {
    super(ErrorCodes.InvalidParams, message, options);
    this.name = "BAPInvalidParamsError";
  }
}

// =============================================================================
// Internal Errors
// =============================================================================

/**
 * Internal server error
 */
export class BAPInternalError extends BAPError {
  constructor(message: string, options?: { cause?: Error; details?: Record<string, unknown> }) {
    super(ErrorCodes.InternalError, message, {
      retryable: false,
      ...options,
    });
    this.name = "BAPInternalError";
  }
}

// =============================================================================
// Server State Errors
// =============================================================================

/**
 * Not initialized error
 */
export class BAPNotInitializedError extends BAPError {
  constructor() {
    super(ErrorCodes.NotInitialized, "Client not initialized. Call initialize() first.");
    this.name = "BAPNotInitializedError";
  }
}

/**
 * Already initialized error
 */
export class BAPAlreadyInitializedError extends BAPError {
  constructor() {
    super(ErrorCodes.AlreadyInitialized, "Client already initialized");
    this.name = "BAPAlreadyInitializedError";
  }
}

// =============================================================================
// Browser Errors
// =============================================================================

/**
 * Browser not launched error
 */
export class BAPBrowserNotLaunchedError extends BAPError {
  constructor() {
    super(ErrorCodes.BrowserNotLaunched, "Browser not launched. Call launch() first.");
    this.name = "BAPBrowserNotLaunchedError";
  }
}

/**
 * Page not found error
 */
export class BAPPageNotFoundError extends BAPError {
  constructor(pageId: string) {
    super(ErrorCodes.PageNotFound, `Page not found: ${pageId}`, {
      details: { pageId },
    });
    this.name = "BAPPageNotFoundError";
  }
}

// =============================================================================
// Element Errors
// =============================================================================

/**
 * Element not found error
 */
export class BAPElementNotFoundError extends BAPError {
  constructor(selector: unknown, options?: { retryable?: boolean; retryAfterMs?: number }) {
    super(ErrorCodes.ElementNotFound, `Element not found`, {
      retryable: options?.retryable ?? true,
      retryAfterMs: options?.retryAfterMs ?? 500,
      details: { selector },
    });
    this.name = "BAPElementNotFoundError";
  }
}

/**
 * Element not visible error
 */
export class BAPElementNotVisibleError extends BAPError {
  constructor(selector: unknown) {
    super(ErrorCodes.ElementNotVisible, `Element not visible`, {
      retryable: true,
      retryAfterMs: 500,
      details: { selector },
    });
    this.name = "BAPElementNotVisibleError";
  }
}

/**
 * Element not enabled error
 */
export class BAPElementNotEnabledError extends BAPError {
  constructor(selector: unknown) {
    super(ErrorCodes.ElementNotEnabled, `Element not enabled`, {
      retryable: true,
      retryAfterMs: 500,
      details: { selector },
    });
    this.name = "BAPElementNotEnabledError";
  }
}

/**
 * Selector ambiguous error (matches multiple elements)
 */
export class BAPSelectorAmbiguousError extends BAPError {
  constructor(selector: unknown, count: number) {
    super(ErrorCodes.SelectorAmbiguous, `Selector matched ${count} elements, expected 1`, {
      details: { selector, count },
    });
    this.name = "BAPSelectorAmbiguousError";
  }
}

/**
 * Intercepted request error (request was intercepted and needs handling)
 */
export class BAPInterceptedRequestError extends BAPError {
  constructor(requestId: string, url: string) {
    super(ErrorCodes.InterceptedRequest, `Request intercepted: ${url}`, {
      details: { requestId, url },
    });
    this.name = "BAPInterceptedRequestError";
  }
}

// =============================================================================
// Navigation Errors
// =============================================================================

/**
 * Navigation failed error
 */
export class BAPNavigationError extends BAPError {
  constructor(
    message: string,
    options?: { url?: string; status?: number; retryable?: boolean; cause?: Error }
  ) {
    super(ErrorCodes.NavigationFailed, message, {
      retryable: options?.retryable ?? true,
      retryAfterMs: 1000,
      details: { url: options?.url, status: options?.status },
      cause: options?.cause,
    });
    this.name = "BAPNavigationError";
  }
}

// =============================================================================
// Timeout Errors
// =============================================================================

/**
 * Timeout error
 */
export class BAPTimeoutError extends BAPError {
  constructor(message: string, options?: { timeout?: number }) {
    super(ErrorCodes.Timeout, message, {
      retryable: true,
      retryAfterMs: 0,
      details: { timeout: options?.timeout },
    });
    this.name = "BAPTimeoutError";
  }
}

// =============================================================================
// Action Errors
// =============================================================================

/**
 * Action failed error
 */
export class BAPActionError extends BAPError {
  constructor(
    action: string,
    message: string,
    options?: { selector?: unknown; retryable?: boolean; cause?: Error }
  ) {
    super(ErrorCodes.ActionFailed, `${action} failed: ${message}`, {
      retryable: options?.retryable ?? false,
      details: { action, selector: options?.selector },
      cause: options?.cause,
    });
    this.name = "BAPActionError";
  }
}

// =============================================================================
// Target Errors
// =============================================================================

/**
 * Target closed error (page/context closed)
 */
export class BAPTargetClosedError extends BAPError {
  constructor(target: string = "target") {
    super(ErrorCodes.TargetClosed, `${target} was closed`, {
      retryable: false,
    });
    this.name = "BAPTargetClosedError";
  }
}

/**
 * Execution context destroyed error
 */
export class BAPExecutionContextDestroyedError extends BAPError {
  constructor() {
    super(ErrorCodes.ExecutionContextDestroyed, "Execution context was destroyed", {
      retryable: true,
      retryAfterMs: 100,
    });
    this.name = "BAPExecutionContextDestroyedError";
  }
}

// =============================================================================
// Context Errors (Multi-Context Support)
// =============================================================================

/**
 * Context not found error
 */
export class BAPContextNotFoundError extends BAPError {
  constructor(contextId: string) {
    super(ErrorCodes.ContextNotFound, `Context not found: ${contextId}`, {
      details: { contextId },
    });
    this.name = "BAPContextNotFoundError";
  }
}

/**
 * Resource limit exceeded error
 */
export class BAPResourceLimitExceededError extends BAPError {
  constructor(resource: string, limit: number, current: number) {
    super(ErrorCodes.ResourceLimitExceeded, `Resource limit exceeded: ${resource} (max: ${limit}, current: ${current})`, {
      details: { resource, limit, current },
    });
    this.name = "BAPResourceLimitExceededError";
  }
}

// =============================================================================
// Approval Errors (Human-in-the-Loop)
// =============================================================================

/**
 * Approval denied error
 */
export class BAPApprovalDeniedError extends BAPError {
  constructor(reason?: string, rule?: string) {
    super(ErrorCodes.ApprovalDenied, reason ? `Approval denied: ${reason}` : "Approval denied", {
      details: { rule, reason },
    });
    this.name = "BAPApprovalDeniedError";
  }
}

/**
 * Approval timeout error
 */
export class BAPApprovalTimeoutError extends BAPError {
  constructor(timeout: number) {
    super(ErrorCodes.ApprovalTimeout, `Approval timed out after ${timeout}ms`, {
      retryable: true,
      details: { timeout },
    });
    this.name = "BAPApprovalTimeoutError";
  }
}

/**
 * Approval required error (informational)
 */
export class BAPApprovalRequiredError extends BAPError {
  constructor(requestId: string, rule: string) {
    super(ErrorCodes.ApprovalRequired, `Approval required for action (rule: ${rule})`, {
      details: { requestId, rule },
    });
    this.name = "BAPApprovalRequiredError";
  }
}

// =============================================================================
// Frame Errors (Frame & Shadow DOM Support)
// =============================================================================

/**
 * Frame not found error
 */
export class BAPFrameNotFoundError extends BAPError {
  constructor(identifier?: string) {
    super(ErrorCodes.FrameNotFound, identifier ? `Frame not found: ${identifier}` : "Frame not found", {
      details: { identifier },
    });
    this.name = "BAPFrameNotFoundError";
  }
}

/**
 * Domain not allowed error
 */
export class BAPDomainNotAllowedError extends BAPError {
  constructor(domain: string) {
    super(ErrorCodes.DomainNotAllowed, `Domain not allowed: ${domain}`, {
      details: { domain },
    });
    this.name = "BAPDomainNotAllowedError";
  }
}

// =============================================================================
// Stream Errors (Streaming Responses)
// =============================================================================

/**
 * Stream not found error
 */
export class BAPStreamNotFoundError extends BAPError {
  constructor(streamId: string) {
    super(ErrorCodes.StreamNotFound, `Stream not found: ${streamId}`, {
      details: { streamId },
    });
    this.name = "BAPStreamNotFoundError";
  }
}

/**
 * Stream cancelled error
 */
export class BAPStreamCancelledError extends BAPError {
  constructor(streamId: string) {
    super(ErrorCodes.StreamCancelled, `Stream was cancelled: ${streamId}`, {
      details: { streamId },
    });
    this.name = "BAPStreamCancelledError";
  }
}

// =============================================================================
// Helpers
// =============================================================================

/**
 * Create an appropriate error instance for a given error code
 */
function createErrorFromCode(
  code: ErrorCode,
  message: string,
  options?: {
    retryable?: boolean;
    retryAfterMs?: number;
    details?: Record<string, unknown>;
  }
): BAPError {
  const baseOptions = {
    retryable: options?.retryable ?? false,
    retryAfterMs: options?.retryAfterMs,
    details: options?.details,
  };

  // Create the appropriate error subclass based on the error code
  switch (code) {
    case ErrorCodes.ParseError:
      return new BAPParseError(message);
    case ErrorCodes.InvalidRequest:
      return new BAPInvalidRequestError(message, { details: options?.details });
    case ErrorCodes.MethodNotFound:
      return new BAPMethodNotFoundError(message);
    case ErrorCodes.InvalidParams:
      return new BAPInvalidParamsError(message, { details: options?.details });
    case ErrorCodes.InternalError:
      return new BAPInternalError(message, { details: options?.details });
    case ErrorCodes.NotInitialized:
      return new BAPNotInitializedError();
    case ErrorCodes.AlreadyInitialized:
      return new BAPAlreadyInitializedError();
    case ErrorCodes.BrowserNotLaunched:
      return new BAPBrowserNotLaunchedError();
    case ErrorCodes.PageNotFound:
      return new BAPPageNotFoundError(options?.details?.pageId as string ?? "unknown");
    case ErrorCodes.ElementNotFound:
      return new BAPElementNotFoundError(options?.details?.selector, {
        retryable: options?.retryable,
        retryAfterMs: options?.retryAfterMs,
      });
    case ErrorCodes.ElementNotVisible:
      return new BAPElementNotVisibleError(options?.details?.selector);
    case ErrorCodes.ElementNotEnabled:
      return new BAPElementNotEnabledError(options?.details?.selector);
    case ErrorCodes.NavigationFailed:
      return new BAPNavigationError(message, {
        url: options?.details?.url as string,
        status: options?.details?.status as number,
        retryable: options?.retryable,
      });
    case ErrorCodes.Timeout:
      return new BAPTimeoutError(message, { timeout: options?.details?.timeout as number });
    case ErrorCodes.TargetClosed:
      return new BAPTargetClosedError(options?.details?.target as string);
    case ErrorCodes.ExecutionContextDestroyed:
      return new BAPExecutionContextDestroyedError();
    case ErrorCodes.SelectorAmbiguous:
      return new BAPSelectorAmbiguousError(
        options?.details?.selector,
        options?.details?.count as number ?? 0
      );
    case ErrorCodes.InterceptedRequest:
      return new BAPInterceptedRequestError(
        options?.details?.requestId as string ?? "unknown",
        options?.details?.url as string ?? "unknown"
      );
    case ErrorCodes.ActionFailed:
      return new BAPActionError(
        options?.details?.action as string ?? "action",
        message,
        { selector: options?.details?.selector, retryable: options?.retryable }
      );
    // Context errors
    case ErrorCodes.ContextNotFound:
      return new BAPContextNotFoundError(options?.details?.contextId as string ?? "unknown");
    case ErrorCodes.ResourceLimitExceeded:
      return new BAPResourceLimitExceededError(
        options?.details?.resource as string ?? "resource",
        options?.details?.limit as number ?? 0,
        options?.details?.current as number ?? 0
      );
    // Approval errors
    case ErrorCodes.ApprovalDenied:
      return new BAPApprovalDeniedError(
        options?.details?.reason as string,
        options?.details?.rule as string
      );
    case ErrorCodes.ApprovalTimeout:
      return new BAPApprovalTimeoutError(options?.details?.timeout as number ?? 60000);
    case ErrorCodes.ApprovalRequired:
      return new BAPApprovalRequiredError(
        options?.details?.requestId as string ?? "unknown",
        options?.details?.rule as string ?? "unknown"
      );
    // Frame errors
    case ErrorCodes.FrameNotFound:
      return new BAPFrameNotFoundError(options?.details?.identifier as string);
    case ErrorCodes.DomainNotAllowed:
      return new BAPDomainNotAllowedError(options?.details?.domain as string ?? "unknown");
    // Stream errors
    case ErrorCodes.StreamNotFound:
      return new BAPStreamNotFoundError(options?.details?.streamId as string ?? "unknown");
    case ErrorCodes.StreamCancelled:
      return new BAPStreamCancelledError(options?.details?.streamId as string ?? "unknown");
    default:
      return new BAPError(code, message, baseOptions);
  }
}
