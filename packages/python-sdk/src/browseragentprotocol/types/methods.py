"""
BAP method parameter and result types.

Matches the TypeScript definitions in @browseragentprotocol/protocol.
"""

from typing import Any, Literal

from pydantic import BaseModel, Field

from browseragentprotocol.types.common import (
    AccessibilityNode,
    BoundingBox,
    Page,
    ScreenshotFormat,
    Viewport,
)
from browseragentprotocol.types.selectors import BAPSelector

# =============================================================================
# Initialize
# =============================================================================


class ClientInfo(BaseModel):
    """Client identification."""

    name: str
    version: str


class ClientCapabilities(BaseModel):
    """Client capabilities."""

    events: list[str] | None = None
    streaming: bool | None = None
    compression: bool | None = None


class InitializeParams(BaseModel):
    """Parameters for initialize."""

    protocol_version: str = Field(alias="protocolVersion")
    client_info: ClientInfo = Field(alias="clientInfo")
    capabilities: ClientCapabilities | None = None

    model_config = {"populate_by_name": True}


class ServerInfo(BaseModel):
    """Server identification."""

    name: str
    version: str


class ServerCapabilities(BaseModel):
    """Server capabilities."""

    browsers: list[str] | None = None
    actions: list[str] | None = None
    observations: list[str] | None = None
    events: list[str] | None = None
    streaming: bool | None = None
    compression: bool | None = None


class InitializeResult(BaseModel):
    """Result of initialize."""

    protocol_version: str = Field(alias="protocolVersion")
    server_info: ServerInfo = Field(alias="serverInfo")
    capabilities: ServerCapabilities

    model_config = {"populate_by_name": True}


# =============================================================================
# Browser
# =============================================================================


class BrowserLaunchParams(BaseModel):
    """Parameters for browser/launch."""

    browser: Literal["chromium", "firefox", "webkit"] | None = None
    headless: bool | None = None
    args: list[str] | None = None
    env: dict[str, str] | None = None
    viewport: Viewport | None = None
    user_agent: str | None = Field(default=None, alias="userAgent")
    locale: str | None = None
    timezone_id: str | None = Field(default=None, alias="timezoneId")

    model_config = {"populate_by_name": True}


class BrowserLaunchResult(BaseModel):
    """Result of browser/launch."""

    browser_id: str = Field(alias="browserId")
    browser: str
    version: str

    model_config = {"populate_by_name": True}


# =============================================================================
# Page
# =============================================================================


class PageCreateParams(BaseModel):
    """Parameters for page/create."""

    url: str | None = None
    context_id: str | None = Field(default=None, alias="contextId")

    model_config = {"populate_by_name": True}


class PageNavigateResult(BaseModel):
    """Result of page/navigate."""

    url: str
    status: int | None = None


# =============================================================================
# Context (Multi-Context Support)
# =============================================================================


class ContextOptions(BaseModel):
    """Options for creating a browser context."""

    viewport: Viewport | None = None
    user_agent: str | None = Field(default=None, alias="userAgent")
    locale: str | None = None
    timezone_id: str | None = Field(default=None, alias="timezoneId")
    geolocation: dict[str, float] | None = None
    permissions: list[str] | None = None
    color_scheme: Literal["light", "dark", "no-preference"] | None = Field(
        default=None, alias="colorScheme"
    )
    offline: bool | None = None

    model_config = {"populate_by_name": True}


class ContextCreateParams(BaseModel):
    """Parameters for context/create."""

    context_id: str | None = Field(default=None, alias="contextId")
    options: ContextOptions | None = None

    model_config = {"populate_by_name": True}


class ContextCreateResult(BaseModel):
    """Result of context/create."""

    context_id: str = Field(alias="contextId")

    model_config = {"populate_by_name": True}


class ContextInfo(BaseModel):
    """Information about a browser context."""

    id: str
    page_count: int = Field(alias="pageCount")
    created: int
    options: ContextOptions | None = None

    model_config = {"populate_by_name": True}


class ContextListResult(BaseModel):
    """Result of context/list."""

    contexts: list[ContextInfo]
    limits: dict[str, int]


class ContextDestroyResult(BaseModel):
    """Result of context/destroy."""

    pages_destroyed: int = Field(alias="pagesDestroyed")

    model_config = {"populate_by_name": True}


# =============================================================================
# Frame (Frame & Shadow DOM Support)
# =============================================================================


class FrameInfo(BaseModel):
    """Information about a frame."""

    frame_id: str = Field(alias="frameId")
    name: str
    url: str
    parent_frame_id: str | None = Field(default=None, alias="parentFrameId")
    is_main: bool = Field(alias="isMain")

    model_config = {"populate_by_name": True}


class FrameListResult(BaseModel):
    """Result of frame/list."""

    frames: list[FrameInfo]


class FrameSwitchParams(BaseModel):
    """Parameters for frame/switch."""

    page_id: str | None = Field(default=None, alias="pageId")
    frame_id: str | None = Field(default=None, alias="frameId")
    selector: Any | None = None  # BAPSelector
    url: str | None = None

    model_config = {"populate_by_name": True}


class FrameSwitchResult(BaseModel):
    """Result of frame/switch."""

    frame_id: str = Field(alias="frameId")
    url: str

    model_config = {"populate_by_name": True}


class FrameMainResult(BaseModel):
    """Result of frame/main."""

    frame_id: str = Field(alias="frameId")

    model_config = {"populate_by_name": True}


# =============================================================================
# Observation Results
# =============================================================================


class ObserveScreenshotResult(BaseModel):
    """Result of observe/screenshot."""

    data: str
    format: ScreenshotFormat
    width: int
    height: int


class ObserveAccessibilityResult(BaseModel):
    """Result of observe/accessibility."""

    tree: list[AccessibilityNode]


class ObserveDOMResult(BaseModel):
    """Result of observe/dom."""

    html: str
    text: str
    title: str
    url: str


class ObserveElementResult(BaseModel):
    """Result of observe/element."""

    properties: dict[str, Any]


class ObservePDFResult(BaseModel):
    """Result of observe/pdf."""

    data: str
    pages: int


class ObserveContentResult(BaseModel):
    """Result of observe/content."""

    content: str
    format: str


class ObserveAriaSnapshotResult(BaseModel):
    """Result of observe/ariaSnapshot."""

    snapshot: str
    url: str
    title: str


# =============================================================================
# Stream (Streaming Responses)
# =============================================================================


class StreamChunkParams(BaseModel):
    """Parameters for stream/chunk notification."""

    stream_id: str = Field(alias="streamId")
    index: int
    data: str
    offset: int
    size: int

    model_config = {"populate_by_name": True}


class StreamEndParams(BaseModel):
    """Parameters for stream/end notification."""

    stream_id: str = Field(alias="streamId")
    total_chunks: int = Field(alias="totalChunks")
    total_size: int = Field(alias="totalSize")
    checksum: str | None = None

    model_config = {"populate_by_name": True}


class StreamCancelResult(BaseModel):
    """Result of stream/cancel."""

    cancelled: bool


# =============================================================================
# Approval (Human-in-the-Loop)
# =============================================================================


class ApprovalElementInfo(BaseModel):
    """Information about an element for approval."""

    role: str
    name: str
    bounds: BoundingBox


class ApprovalContext(BaseModel):
    """Context for an approval request."""

    page_url: str = Field(alias="pageUrl")
    page_title: str = Field(alias="pageTitle")
    screenshot: str | None = None
    element_info: ApprovalElementInfo | None = Field(default=None, alias="elementInfo")

    model_config = {"populate_by_name": True}


class ApprovalRequiredParams(BaseModel):
    """Parameters for approval/required notification."""

    request_id: str = Field(alias="requestId")
    original_request: dict[str, Any] = Field(alias="originalRequest")
    rule: str
    context: ApprovalContext
    expires_at: int = Field(alias="expiresAt")

    model_config = {"populate_by_name": True}


class ApprovalRespondParams(BaseModel):
    """Parameters for approval/respond."""

    request_id: str = Field(alias="requestId")
    decision: Literal["approve", "deny", "approve-once", "approve-session"]
    reason: str | None = None

    model_config = {"populate_by_name": True}


class ApprovalRespondResult(BaseModel):
    """Result of approval/respond."""

    acknowledged: bool
