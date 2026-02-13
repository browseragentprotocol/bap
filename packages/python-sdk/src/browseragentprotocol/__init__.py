"""
Browser Agent Protocol (BAP) Python SDK

A Python client for controlling browsers via the Browser Agent Protocol.
Designed for AI agents and automation tasks, with both async and sync APIs.

Example (async context manager):
    ```python
    from browseragentprotocol import BAPClient, role

    async def main():
        async with BAPClient("ws://localhost:9222") as client:
            await client.launch(browser="chromium", headless=True)
            await client.create_page(url="https://example.com")

            await client.click(role("button", "Submit"))
            screenshot = await client.screenshot()

    import asyncio
    asyncio.run(main())
    ```

Example (high-level session helper):
    ```python
    from browseragentprotocol.context import bap_session

    async with bap_session(
        "ws://localhost:9222",
        start_url="https://example.com"
    ) as client:
        await client.click(role("button", "Accept"))
        content = await client.content()
    ```

For synchronous usage:
    ```python
    from browseragentprotocol import BAPClientSync, role

    with BAPClientSync("ws://localhost:9222") as client:
        client.launch(browser="chromium", headless=True)
        client.create_page(url="https://example.com")

        client.click(role("button", "Submit"))
        screenshot = client.screenshot()
    ```

CLI usage:
    ```bash
    # Test connection
    bap connect ws://localhost:9222

    # Get server info
    bap info ws://localhost:9222 --json
    ```
"""

__version__ = "0.2.0"

# Main client classes
from browseragentprotocol.client import BAPClient
from browseragentprotocol.sync_client import BAPClientSync

# Transport layers
from browseragentprotocol.transport import WebSocketTransport
from browseragentprotocol.sse import SSETransport

# Context managers
from browseragentprotocol.context import bap_client, bap_session

# Errors
from browseragentprotocol.errors import (
    BAPError,
    BAPConnectionError,
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
    BAPNavigationError,
    BAPTimeoutError,
    BAPActionError,
    BAPTargetClosedError,
    BAPExecutionContextDestroyedError,
    BAPContextNotFoundError,
    BAPResourceLimitExceededError,
    BAPApprovalDeniedError,
    BAPApprovalTimeoutError,
    BAPApprovalRequiredError,
    BAPFrameNotFoundError,
    BAPDomainNotAllowedError,
    BAPStreamNotFoundError,
    BAPStreamCancelledError,
)

# Selector factory functions
from browseragentprotocol.types.selectors import (
    css,
    xpath,
    role,
    text,
    label,
    placeholder,
    test_id,
    semantic,
    coords,
    ref,
    # Selector types
    AriaRole,
    BAPSelector,
    CSSSelector,
    XPathSelector,
    RoleSelector,
    TextSelector,
    LabelSelector,
    PlaceholderSelector,
    TestIdSelector,
    SemanticSelector,
    CoordinatesSelector,
    RefSelector,
)

# Protocol types
from browseragentprotocol.types.protocol import (
    BAP_VERSION,
    ErrorCodes,
)

# Common types
from browseragentprotocol.types.common import (
    AccessibilityNode,
    ActionOptions,
    BoundingBox,
    ClickOptions,
    ContentFormat,
    Cookie,
    Page,
    PageStatus,
    ScreenshotFormat,
    ScreenshotOptions,
    ScrollDirection,
    ScrollOptions,
    StorageState,
    TypeOptions,
    Viewport,
    WaitUntilState,
)

# Agent types
from browseragentprotocol.types.agent import (
    ActionHint,
    AgentActParams,
    AgentActResult,
    AgentExtractParams,
    AgentExtractResult,
    AgentObserveParams,
    AgentObserveResult,
    AnnotationOptions,
    ExecutionStep,
    InteractiveElement,
    StepCondition,
    StepErrorHandling,
    StepResult,
)

# Method types
from browseragentprotocol.types.methods import (
    ApprovalRequiredParams,
    ApprovalRespondParams,
    BrowserLaunchParams,
    BrowserLaunchResult,
    ContextCreateParams,
    ContextCreateResult,
    ContextListResult,
    FrameInfo,
    FrameListResult,
    FrameSwitchParams,
    FrameSwitchResult,
    InitializeResult,
    ObserveAccessibilityResult,
    ObserveAriaSnapshotResult,
    ObserveContentResult,
    ObserveDOMResult,
    ObserveElementResult,
    ObservePDFResult,
    ObserveScreenshotResult,
    PageNavigateResult,
    StreamChunkParams,
    StreamEndParams,
)

# Event types
from browseragentprotocol.types.events import (
    ConsoleEvent,
    DialogEvent,
    DownloadEvent,
    NetworkEvent,
    PageEvent,
)

__all__ = [
    # Version
    "__version__",
    # Main classes
    "BAPClient",
    "BAPClientSync",
    # Transport layers
    "WebSocketTransport",
    "SSETransport",
    # Context managers
    "bap_client",
    "bap_session",
    # Errors
    "BAPError",
    "BAPConnectionError",
    "BAPParseError",
    "BAPInvalidRequestError",
    "BAPMethodNotFoundError",
    "BAPInvalidParamsError",
    "BAPNotInitializedError",
    "BAPAlreadyInitializedError",
    "BAPBrowserNotLaunchedError",
    "BAPPageNotFoundError",
    "BAPElementNotFoundError",
    "BAPElementNotVisibleError",
    "BAPElementNotEnabledError",
    "BAPSelectorAmbiguousError",
    "BAPNavigationError",
    "BAPTimeoutError",
    "BAPActionError",
    "BAPTargetClosedError",
    "BAPExecutionContextDestroyedError",
    "BAPContextNotFoundError",
    "BAPResourceLimitExceededError",
    "BAPApprovalDeniedError",
    "BAPApprovalTimeoutError",
    "BAPApprovalRequiredError",
    "BAPFrameNotFoundError",
    "BAPDomainNotAllowedError",
    "BAPStreamNotFoundError",
    "BAPStreamCancelledError",
    # Selector factories
    "css",
    "xpath",
    "role",
    "text",
    "label",
    "placeholder",
    "test_id",
    "semantic",
    "coords",
    "ref",
    # Selector types
    "AriaRole",
    "BAPSelector",
    "CSSSelector",
    "XPathSelector",
    "RoleSelector",
    "TextSelector",
    "LabelSelector",
    "PlaceholderSelector",
    "TestIdSelector",
    "SemanticSelector",
    "CoordinatesSelector",
    "RefSelector",
    # Protocol
    "BAP_VERSION",
    "ErrorCodes",
    # Common types
    "AccessibilityNode",
    "ActionOptions",
    "BoundingBox",
    "ClickOptions",
    "ContentFormat",
    "Cookie",
    "Page",
    "PageStatus",
    "ScreenshotFormat",
    "ScreenshotOptions",
    "ScrollDirection",
    "ScrollOptions",
    "StorageState",
    "TypeOptions",
    "Viewport",
    "WaitUntilState",
    # Agent types
    "ActionHint",
    "AgentActParams",
    "AgentActResult",
    "AgentExtractParams",
    "AgentExtractResult",
    "AgentObserveParams",
    "AgentObserveResult",
    "AnnotationOptions",
    "ExecutionStep",
    "InteractiveElement",
    "StepCondition",
    "StepErrorHandling",
    "StepResult",
    # Method types
    "ApprovalRequiredParams",
    "ApprovalRespondParams",
    "BrowserLaunchParams",
    "BrowserLaunchResult",
    "ContextCreateParams",
    "ContextCreateResult",
    "ContextListResult",
    "FrameInfo",
    "FrameListResult",
    "FrameSwitchParams",
    "FrameSwitchResult",
    "InitializeResult",
    "ObserveAccessibilityResult",
    "ObserveAriaSnapshotResult",
    "ObserveContentResult",
    "ObserveDOMResult",
    "ObserveElementResult",
    "ObservePDFResult",
    "ObserveScreenshotResult",
    "PageNavigateResult",
    "StreamChunkParams",
    "StreamEndParams",
    # Event types
    "ConsoleEvent",
    "DialogEvent",
    "DownloadEvent",
    "NetworkEvent",
    "PageEvent",
]
