"""
JSON-RPC 2.0 protocol types with Pydantic models.

Matches the TypeScript definitions in @browseragentprotocol/protocol.
"""

from typing import Any, Literal, Union

from pydantic import BaseModel, Field

# =============================================================================
# Protocol Version
# =============================================================================

BAP_VERSION = "0.2.0"

# =============================================================================
# Request ID
# =============================================================================

RequestId = Union[str, int]

# =============================================================================
# Error Codes
# =============================================================================


class ErrorCodes:
    """Standard JSON-RPC and BAP-specific error codes."""

    # Standard JSON-RPC errors
    ParseError: int = -32700
    InvalidRequest: int = -32600
    MethodNotFound: int = -32601
    InvalidParams: int = -32602
    InternalError: int = -32603

    # Server errors
    ServerError: int = -32000
    NotInitialized: int = -32001
    AlreadyInitialized: int = -32002

    # BAP-specific errors
    BrowserNotLaunched: int = -32010
    PageNotFound: int = -32011
    ElementNotFound: int = -32012
    ElementNotVisible: int = -32013
    ElementNotEnabled: int = -32014
    NavigationFailed: int = -32015
    Timeout: int = -32016
    TargetClosed: int = -32017
    ExecutionContextDestroyed: int = -32018
    SelectorAmbiguous: int = -32020
    ActionFailed: int = -32021
    InterceptedRequest: int = -32022

    # Context errors (Multi-Context Support)
    ContextNotFound: int = -32023
    ResourceLimitExceeded: int = -32024

    # Approval errors (Human-in-the-Loop)
    ApprovalDenied: int = -32030
    ApprovalTimeout: int = -32031
    ApprovalRequired: int = -32032

    # Frame errors (Frame & Shadow DOM Support)
    FrameNotFound: int = -32040
    DomainNotAllowed: int = -32041

    # Stream errors (Streaming Responses)
    StreamNotFound: int = -32050
    StreamCancelled: int = -32051


# =============================================================================
# JSON-RPC 2.0 Types
# =============================================================================


class JSONRPCErrorData(BaseModel):
    """Optional data attached to JSON-RPC errors."""

    retryable: bool = False
    retry_after_ms: int | None = Field(default=None, alias="retryAfterMs")
    details: dict[str, Any] | None = None

    model_config = {"populate_by_name": True}


class JSONRPCError(BaseModel):
    """JSON-RPC error object."""

    code: int
    message: str
    data: JSONRPCErrorData | None = None


class JSONRPCRequest(BaseModel):
    """JSON-RPC request message."""

    jsonrpc: Literal["2.0"] = "2.0"
    id: RequestId
    method: str
    params: dict[str, Any] | None = None


class JSONRPCSuccessResponse(BaseModel):
    """JSON-RPC success response."""

    jsonrpc: Literal["2.0"] = "2.0"
    id: RequestId
    result: Any


class JSONRPCErrorResponse(BaseModel):
    """JSON-RPC error response."""

    jsonrpc: Literal["2.0"] = "2.0"
    id: RequestId
    error: JSONRPCError


class JSONRPCNotification(BaseModel):
    """JSON-RPC notification (no id, no response expected)."""

    jsonrpc: Literal["2.0"] = "2.0"
    method: str
    params: dict[str, Any] | None = None


# Union types
JSONRPCResponse = Union[JSONRPCSuccessResponse, JSONRPCErrorResponse]
JSONRPCMessage = Union[
    JSONRPCRequest, JSONRPCSuccessResponse, JSONRPCErrorResponse, JSONRPCNotification
]


# =============================================================================
# Type Guards
# =============================================================================


def is_request(message: dict[str, Any]) -> bool:
    """Check if a message is a request."""
    return "id" in message and "method" in message


def is_response(message: dict[str, Any]) -> bool:
    """Check if a message is a response."""
    return "id" in message and "method" not in message


def is_notification(message: dict[str, Any]) -> bool:
    """Check if a message is a notification."""
    return "id" not in message and "method" in message


def is_error_response(response: dict[str, Any]) -> bool:
    """Check if a response is an error."""
    if "error" not in response:
        return False

    error = response.get("error")
    if not isinstance(error, dict):
        return False

    return isinstance(error.get("code"), int) and isinstance(error.get("message"), str)


# =============================================================================
# Helper Functions
# =============================================================================


def create_request(
    id: RequestId,
    method: str,
    params: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Create a JSON-RPC request."""
    request: dict[str, Any] = {
        "jsonrpc": "2.0",
        "id": id,
        "method": method,
    }
    if params is not None:
        request["params"] = params
    return request


def create_success_response(id: RequestId, result: Any) -> dict[str, Any]:
    """Create a JSON-RPC success response."""
    return {
        "jsonrpc": "2.0",
        "id": id,
        "result": result,
    }


def create_error_response(
    id: RequestId,
    code: int,
    message: str,
    data: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Create a JSON-RPC error response."""
    response: dict[str, Any] = {
        "jsonrpc": "2.0",
        "id": id,
        "error": {
            "code": code,
            "message": message,
        },
    }
    if data is not None:
        response["error"]["data"] = data
    return response


def create_notification(
    method: str,
    params: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Create a JSON-RPC notification."""
    notification: dict[str, Any] = {
        "jsonrpc": "2.0",
        "method": method,
    }
    if params is not None:
        notification["params"] = params
    return notification
