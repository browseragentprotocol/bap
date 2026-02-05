/**
 * @fileoverview BAP shared exports
 * @module @browseragentprotocol/core/shared
 */

// Error classes
export {
  BAPError,
  BAPConnectionError,
  BAPInternalError,
  BAPParseError,
  BAPInvalidRequestError,
  BAPMethodNotFoundError,
  BAPInvalidParamsError,
  BAPNotInitializedError,
  BAPAlreadyInitializedError,
  BAPBrowserNotLaunchedError,
  BAPPageNotFoundError,
  BAPElementNotFoundError,
  BAPElementNotVisibleError,
  BAPElementNotEnabledError,
  BAPSelectorAmbiguousError,
  BAPInterceptedRequestError,
  BAPNavigationError,
  BAPTimeoutError,
  BAPActionError,
  BAPTargetClosedError,
  BAPExecutionContextDestroyedError,
  // Context errors (Multi-Context Support)
  BAPContextNotFoundError,
  BAPResourceLimitExceededError,
  // Approval errors (Human-in-the-Loop)
  BAPApprovalDeniedError,
  BAPApprovalTimeoutError,
  BAPApprovalRequiredError,
  // Frame errors (Frame & Shadow DOM Support)
  BAPFrameNotFoundError,
  BAPDomainNotAllowedError,
  // Stream errors (Streaming Responses)
  BAPStreamNotFoundError,
  BAPStreamCancelledError,
} from "./errors.js";

// Transport interface
export {
  type Transport,
  type TransportOptions,
  DEFAULT_TRANSPORT_OPTIONS,
} from "./transport.js";

// Element identity utilities
export {
  generateStableRef,
  hashIdentity,
  compareIdentities,
  domInfoToIdentity,
  refToSelector,
  createElementRegistry,
  cleanupStaleEntries,
  ELEMENT_STALE_THRESHOLD,
  type DOMElementInfo,
  type ElementRegistryEntry,
  type PageElementRegistry,
} from "./element-identity.js";
