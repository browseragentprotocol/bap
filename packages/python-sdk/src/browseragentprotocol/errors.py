"""
BAP error class hierarchy.

Matches the TypeScript definitions in @browseragentprotocol/protocol.
"""

from typing import Any

from browseragentprotocol.types.protocol import ErrorCodes, JSONRPCError


class BAPError(Exception):
    """Base error class for all BAP errors."""

    def __init__(
        self,
        code: int,
        message: str,
        *,
        retryable: bool = False,
        retry_after_ms: int | None = None,
        details: dict[str, Any] | None = None,
    ):
        super().__init__(message)
        self.code = code
        self.message = message
        self.retryable = retryable
        self.retry_after_ms = retry_after_ms
        self.details = details

    @classmethod
    def from_response(cls, error: JSONRPCError) -> "BAPError":
        """Create a BAPError from a JSON-RPC error response."""
        retryable = False
        retry_after_ms = None
        details = None

        if error.data:
            retryable = error.data.retryable
            retry_after_ms = error.data.retry_after_ms
            details = error.data.details

        return create_error_from_code(
            error.code,
            error.message,
            retryable=retryable,
            retry_after_ms=retry_after_ms,
            details=details,
        )

    @classmethod
    def from_dict(cls, error_dict: dict[str, Any]) -> "BAPError":
        """Create a BAPError from a dictionary."""
        code = error_dict.get("code", ErrorCodes.InternalError)
        message = error_dict.get("message", "Unknown error")
        data = error_dict.get("data", {})

        return create_error_from_code(
            code,
            message,
            retryable=data.get("retryable", False),
            retry_after_ms=data.get("retryAfterMs"),
            details=data.get("details"),
        )

    def to_dict(self) -> dict[str, Any]:
        """Convert to JSON-RPC error format."""
        result: dict[str, Any] = {
            "code": self.code,
            "message": self.message,
            "data": {
                "retryable": self.retryable,
            },
        }
        if self.retry_after_ms is not None:
            result["data"]["retryAfterMs"] = self.retry_after_ms
        if self.details is not None:
            result["data"]["details"] = self.details
        return result

    def __repr__(self) -> str:
        return f"{self.__class__.__name__}(code={self.code}, message={self.message!r})"


# =============================================================================
# Connection Errors
# =============================================================================


class BAPConnectionError(BAPError):
    """Connection-related errors."""

    def __init__(
        self,
        message: str,
        *,
        details: dict[str, Any] | None = None,
    ):
        super().__init__(
            ErrorCodes.ServerError,
            message,
            retryable=True,
            retry_after_ms=1000,
            details=details,
        )


# =============================================================================
# Protocol Errors
# =============================================================================


class BAPParseError(BAPError):
    """JSON parse error."""

    def __init__(self, message: str):
        super().__init__(ErrorCodes.ParseError, message)


class BAPInvalidRequestError(BAPError):
    """Invalid request error."""

    def __init__(self, message: str, *, details: dict[str, Any] | None = None):
        super().__init__(ErrorCodes.InvalidRequest, message, details=details)


class BAPMethodNotFoundError(BAPError):
    """Method not found error."""

    def __init__(self, method: str):
        super().__init__(ErrorCodes.MethodNotFound, f"Method not found: {method}")


class BAPInvalidParamsError(BAPError):
    """Invalid parameters error."""

    def __init__(self, message: str, *, details: dict[str, Any] | None = None):
        super().__init__(ErrorCodes.InvalidParams, message, details=details)


# =============================================================================
# Server State Errors
# =============================================================================


class BAPNotInitializedError(BAPError):
    """Not initialized error."""

    def __init__(self) -> None:
        super().__init__(
            ErrorCodes.NotInitialized,
            "Client not initialized. Call connect() first.",
        )


class BAPAlreadyInitializedError(BAPError):
    """Already initialized error."""

    def __init__(self) -> None:
        super().__init__(ErrorCodes.AlreadyInitialized, "Client already initialized")


# =============================================================================
# Browser Errors
# =============================================================================


class BAPBrowserNotLaunchedError(BAPError):
    """Browser not launched error."""

    def __init__(self) -> None:
        super().__init__(
            ErrorCodes.BrowserNotLaunched,
            "Browser not launched. Call launch() first.",
        )


class BAPPageNotFoundError(BAPError):
    """Page not found error."""

    def __init__(self, page_id: str):
        super().__init__(
            ErrorCodes.PageNotFound,
            f"Page not found: {page_id}",
            details={"pageId": page_id},
        )


# =============================================================================
# Element Errors
# =============================================================================


class BAPElementNotFoundError(BAPError):
    """Element not found error."""

    def __init__(
        self,
        selector: Any,
        *,
        retryable: bool = True,
        retry_after_ms: int = 500,
    ):
        super().__init__(
            ErrorCodes.ElementNotFound,
            "Element not found",
            retryable=retryable,
            retry_after_ms=retry_after_ms,
            details={"selector": selector},
        )


class BAPElementNotVisibleError(BAPError):
    """Element not visible error."""

    def __init__(self, selector: Any):
        super().__init__(
            ErrorCodes.ElementNotVisible,
            "Element not visible",
            retryable=True,
            retry_after_ms=500,
            details={"selector": selector},
        )


class BAPElementNotEnabledError(BAPError):
    """Element not enabled error."""

    def __init__(self, selector: Any):
        super().__init__(
            ErrorCodes.ElementNotEnabled,
            "Element not enabled",
            retryable=True,
            retry_after_ms=500,
            details={"selector": selector},
        )


class BAPSelectorAmbiguousError(BAPError):
    """Selector ambiguous error (matches multiple elements)."""

    def __init__(self, selector: Any, count: int):
        super().__init__(
            ErrorCodes.SelectorAmbiguous,
            f"Selector matched {count} elements, expected 1",
            details={"selector": selector, "count": count},
        )


# =============================================================================
# Navigation Errors
# =============================================================================


class BAPNavigationError(BAPError):
    """Navigation failed error."""

    def __init__(
        self,
        message: str,
        *,
        url: str | None = None,
        status: int | None = None,
        retryable: bool = True,
    ):
        details: dict[str, Any] = {}
        if url:
            details["url"] = url
        if status:
            details["status"] = status
        super().__init__(
            ErrorCodes.NavigationFailed,
            message,
            retryable=retryable,
            retry_after_ms=1000,
            details=details or None,
        )


# =============================================================================
# Timeout Errors
# =============================================================================


class BAPTimeoutError(BAPError):
    """Timeout error."""

    def __init__(self, message: str, *, timeout: int | None = None):
        super().__init__(
            ErrorCodes.Timeout,
            message,
            retryable=True,
            retry_after_ms=0,
            details={"timeout": timeout} if timeout else None,
        )


# =============================================================================
# Action Errors
# =============================================================================


class BAPActionError(BAPError):
    """Action failed error."""

    def __init__(
        self,
        action: str,
        message: str,
        *,
        selector: Any | None = None,
        retryable: bool = False,
    ):
        details: dict[str, Any] = {"action": action}
        if selector:
            details["selector"] = selector
        super().__init__(
            ErrorCodes.ActionFailed,
            f"{action} failed: {message}",
            retryable=retryable,
            details=details,
        )


# =============================================================================
# Target Errors
# =============================================================================


class BAPTargetClosedError(BAPError):
    """Target closed error (page/context closed)."""

    def __init__(self, target: str = "target"):
        super().__init__(
            ErrorCodes.TargetClosed,
            f"{target} was closed",
            retryable=False,
        )


class BAPExecutionContextDestroyedError(BAPError):
    """Execution context destroyed error."""

    def __init__(self) -> None:
        super().__init__(
            ErrorCodes.ExecutionContextDestroyed,
            "Execution context was destroyed",
            retryable=True,
            retry_after_ms=100,
        )


# =============================================================================
# Context Errors (Multi-Context Support)
# =============================================================================


class BAPContextNotFoundError(BAPError):
    """Context not found error."""

    def __init__(self, context_id: str):
        super().__init__(
            ErrorCodes.ContextNotFound,
            f"Context not found: {context_id}",
            details={"contextId": context_id},
        )


class BAPResourceLimitExceededError(BAPError):
    """Resource limit exceeded error."""

    def __init__(self, resource: str, limit: int, current: int):
        super().__init__(
            ErrorCodes.ResourceLimitExceeded,
            f"Resource limit exceeded: {resource} (max: {limit}, current: {current})",
            details={"resource": resource, "limit": limit, "current": current},
        )


# =============================================================================
# Approval Errors (Human-in-the-Loop)
# =============================================================================


class BAPApprovalDeniedError(BAPError):
    """Approval denied error."""

    def __init__(self, reason: str | None = None, rule: str | None = None):
        message = f"Approval denied: {reason}" if reason else "Approval denied"
        super().__init__(
            ErrorCodes.ApprovalDenied,
            message,
            details={"rule": rule, "reason": reason} if rule or reason else None,
        )


class BAPApprovalTimeoutError(BAPError):
    """Approval timeout error."""

    def __init__(self, timeout: int):
        super().__init__(
            ErrorCodes.ApprovalTimeout,
            f"Approval timed out after {timeout}ms",
            retryable=True,
            details={"timeout": timeout},
        )


class BAPApprovalRequiredError(BAPError):
    """Approval required error (informational)."""

    def __init__(self, request_id: str, rule: str):
        super().__init__(
            ErrorCodes.ApprovalRequired,
            f"Approval required for action (rule: {rule})",
            details={"requestId": request_id, "rule": rule},
        )


# =============================================================================
# Frame Errors (Frame & Shadow DOM Support)
# =============================================================================


class BAPFrameNotFoundError(BAPError):
    """Frame not found error."""

    def __init__(self, identifier: str | None = None):
        message = f"Frame not found: {identifier}" if identifier else "Frame not found"
        super().__init__(
            ErrorCodes.FrameNotFound,
            message,
            details={"identifier": identifier} if identifier else None,
        )


class BAPDomainNotAllowedError(BAPError):
    """Domain not allowed error."""

    def __init__(self, domain: str):
        super().__init__(
            ErrorCodes.DomainNotAllowed,
            f"Domain not allowed: {domain}",
            details={"domain": domain},
        )


# =============================================================================
# Stream Errors (Streaming Responses)
# =============================================================================


class BAPStreamNotFoundError(BAPError):
    """Stream not found error."""

    def __init__(self, stream_id: str):
        super().__init__(
            ErrorCodes.StreamNotFound,
            f"Stream not found: {stream_id}",
            details={"streamId": stream_id},
        )


class BAPStreamCancelledError(BAPError):
    """Stream cancelled error."""

    def __init__(self, stream_id: str):
        super().__init__(
            ErrorCodes.StreamCancelled,
            f"Stream was cancelled: {stream_id}",
            details={"streamId": stream_id},
        )


# =============================================================================
# Helper Functions
# =============================================================================


def create_error_from_code(
    code: int,
    message: str,
    *,
    retryable: bool = False,
    retry_after_ms: int | None = None,
    details: dict[str, Any] | None = None,
) -> BAPError:
    """Create an appropriate error instance for a given error code."""
    error_classes: dict[int, type[BAPError]] = {
        ErrorCodes.ParseError: BAPParseError,
        ErrorCodes.InvalidRequest: BAPInvalidRequestError,
        ErrorCodes.MethodNotFound: BAPMethodNotFoundError,
        ErrorCodes.InvalidParams: BAPInvalidParamsError,
        ErrorCodes.NotInitialized: BAPNotInitializedError,
        ErrorCodes.AlreadyInitialized: BAPAlreadyInitializedError,
        ErrorCodes.BrowserNotLaunched: BAPBrowserNotLaunchedError,
        ErrorCodes.Timeout: BAPTimeoutError,
        ErrorCodes.TargetClosed: BAPTargetClosedError,
        ErrorCodes.ExecutionContextDestroyed: BAPExecutionContextDestroyedError,
        ErrorCodes.ApprovalDenied: BAPApprovalDeniedError,
        ErrorCodes.FrameNotFound: BAPFrameNotFoundError,
        ErrorCodes.StreamNotFound: BAPStreamNotFoundError,
        ErrorCodes.StreamCancelled: BAPStreamCancelledError,
    }

    # For specific error codes, create the specialized error
    if code in error_classes:
        error_cls = error_classes[code]
        # These errors have special constructors
        if code == ErrorCodes.ParseError:
            return BAPParseError(message)
        elif code == ErrorCodes.MethodNotFound:
            return BAPMethodNotFoundError(message)
        elif code == ErrorCodes.NotInitialized:
            return BAPNotInitializedError()
        elif code == ErrorCodes.AlreadyInitialized:
            return BAPAlreadyInitializedError()
        elif code == ErrorCodes.BrowserNotLaunched:
            return BAPBrowserNotLaunchedError()
        elif code == ErrorCodes.Timeout:
            return BAPTimeoutError(message, timeout=details.get("timeout") if details else None)
        elif code == ErrorCodes.TargetClosed:
            return BAPTargetClosedError(details.get("target", "target") if details else "target")
        elif code == ErrorCodes.ExecutionContextDestroyed:
            return BAPExecutionContextDestroyedError()
        elif code == ErrorCodes.ApprovalDenied:
            return BAPApprovalDeniedError(
                details.get("reason") if details else None,
                details.get("rule") if details else None,
            )
        elif code == ErrorCodes.FrameNotFound:
            return BAPFrameNotFoundError(details.get("identifier") if details else None)
        elif code == ErrorCodes.StreamNotFound:
            return BAPStreamNotFoundError(details.get("streamId", "unknown") if details else "unknown")
        elif code == ErrorCodes.StreamCancelled:
            return BAPStreamCancelledError(details.get("streamId", "unknown") if details else "unknown")

    # Handle other specific cases
    if code == ErrorCodes.PageNotFound:
        return BAPPageNotFoundError(details.get("pageId", "unknown") if details else "unknown")
    elif code == ErrorCodes.ElementNotFound:
        return BAPElementNotFoundError(
            details.get("selector") if details else None,
            retryable=retryable,
            retry_after_ms=retry_after_ms or 500,
        )
    elif code == ErrorCodes.ElementNotVisible:
        return BAPElementNotVisibleError(details.get("selector") if details else None)
    elif code == ErrorCodes.ElementNotEnabled:
        return BAPElementNotEnabledError(details.get("selector") if details else None)
    elif code == ErrorCodes.SelectorAmbiguous:
        return BAPSelectorAmbiguousError(
            details.get("selector") if details else None,
            details.get("count", 0) if details else 0,
        )
    elif code == ErrorCodes.NavigationFailed:
        return BAPNavigationError(
            message,
            url=details.get("url") if details else None,
            status=details.get("status") if details else None,
            retryable=retryable,
        )
    elif code == ErrorCodes.ActionFailed:
        return BAPActionError(
            details.get("action", "action") if details else "action",
            message,
            selector=details.get("selector") if details else None,
            retryable=retryable,
        )
    elif code == ErrorCodes.ContextNotFound:
        return BAPContextNotFoundError(details.get("contextId", "unknown") if details else "unknown")
    elif code == ErrorCodes.ResourceLimitExceeded:
        return BAPResourceLimitExceededError(
            details.get("resource", "resource") if details else "resource",
            details.get("limit", 0) if details else 0,
            details.get("current", 0) if details else 0,
        )
    elif code == ErrorCodes.ApprovalTimeout:
        return BAPApprovalTimeoutError(details.get("timeout", 60000) if details else 60000)
    elif code == ErrorCodes.ApprovalRequired:
        return BAPApprovalRequiredError(
            details.get("requestId", "unknown") if details else "unknown",
            details.get("rule", "unknown") if details else "unknown",
        )
    elif code == ErrorCodes.DomainNotAllowed:
        return BAPDomainNotAllowedError(details.get("domain", "unknown") if details else "unknown")

    # Default: create a base BAPError
    return BAPError(
        code,
        message,
        retryable=retryable,
        retry_after_ms=retry_after_ms,
        details=details,
    )
