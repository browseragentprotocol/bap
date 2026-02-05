"""
Common BAP types with Pydantic models.

Matches the TypeScript definitions in @browseragentprotocol/protocol.
"""

from enum import Enum
from typing import Any, Literal, Union

from pydantic import BaseModel, Field

from browseragentprotocol.types.selectors import BAPSelector

# =============================================================================
# Bounding Box
# =============================================================================


class BoundingBox(BaseModel):
    """Rectangle representing element position and size."""

    x: float
    y: float
    width: float
    height: float


# =============================================================================
# Action Options
# =============================================================================


class KeyModifier(str, Enum):
    """Keyboard modifiers."""

    ALT = "Alt"
    CONTROL = "Control"
    META = "Meta"
    SHIFT = "Shift"


class MouseButton(str, Enum):
    """Mouse buttons."""

    LEFT = "left"
    RIGHT = "right"
    MIDDLE = "middle"


class ActionOptions(BaseModel):
    """Base options for all actions."""

    timeout: int | None = None
    force: bool | None = None
    no_wait_after: bool | None = Field(default=None, alias="noWaitAfter")
    trial: bool | None = None

    model_config = {"populate_by_name": True}


class ClickOptions(ActionOptions):
    """Options for click actions."""

    button: MouseButton | None = None
    click_count: int | None = Field(default=None, alias="clickCount")
    modifiers: list[KeyModifier] | None = None
    position: dict[str, float] | None = None

    model_config = {"populate_by_name": True}


class TypeOptions(ActionOptions):
    """Options for type actions."""

    delay: int | None = None
    clear: bool | None = None


class ScrollDirection(str, Enum):
    """Scroll direction."""

    UP = "up"
    DOWN = "down"
    LEFT = "left"
    RIGHT = "right"


ScrollAmount = Union[int, float, Literal["page", "toElement"]]


class ScrollOptions(ActionOptions):
    """Options for scroll actions."""

    direction: ScrollDirection | None = None
    amount: ScrollAmount | None = None


# =============================================================================
# Screenshot Options
# =============================================================================


class ScreenshotFormat(str, Enum):
    """Screenshot format."""

    PNG = "png"
    JPEG = "jpeg"
    WEBP = "webp"


class ScreenshotScale(str, Enum):
    """Screenshot scale mode."""

    CSS = "css"
    DEVICE = "device"


class ScreenshotOptions(BaseModel):
    """Options for screenshot capture."""

    full_page: bool | None = Field(default=None, alias="fullPage")
    clip: BoundingBox | None = None
    format: ScreenshotFormat | None = None
    quality: int | None = Field(default=None, ge=0, le=100)
    scale: ScreenshotScale | None = None
    mask: list[Any] | None = None  # list[BAPSelector] causes circular import

    model_config = {"populate_by_name": True}


# =============================================================================
# Page Types
# =============================================================================


class PageStatus(str, Enum):
    """Page loading status."""

    LOADING = "loading"
    READY = "ready"
    ERROR = "error"


class WaitUntilState(str, Enum):
    """Navigation wait condition."""

    LOAD = "load"
    DOMCONTENTLOADED = "domcontentloaded"
    NETWORKIDLE = "networkidle"
    COMMIT = "commit"


class Viewport(BaseModel):
    """Viewport dimensions."""

    width: int
    height: int


class Page(BaseModel):
    """Represents a browser page (tab)."""

    id: str
    url: str
    title: str
    viewport: Viewport
    status: PageStatus


# =============================================================================
# Storage Types
# =============================================================================


class SameSiteAttribute(str, Enum):
    """SameSite cookie attribute."""

    STRICT = "Strict"
    LAX = "Lax"
    NONE = "None"


class Cookie(BaseModel):
    """Browser cookie."""

    name: str
    value: str
    domain: str
    path: str
    expires: float | None = None
    http_only: bool | None = Field(default=None, alias="httpOnly")
    secure: bool | None = None
    same_site: SameSiteAttribute | None = Field(default=None, alias="sameSite")

    model_config = {"populate_by_name": True}


class StorageItem(BaseModel):
    """Storage item (key-value pair)."""

    name: str
    value: str


class OriginStorage(BaseModel):
    """Origin-specific storage data."""

    origin: str
    local_storage: list[StorageItem] = Field(alias="localStorage")
    session_storage: list[StorageItem] | None = Field(default=None, alias="sessionStorage")

    model_config = {"populate_by_name": True}


class StorageState(BaseModel):
    """Complete browser storage state (for auth persistence)."""

    cookies: list[Cookie]
    origins: list[OriginStorage]


# =============================================================================
# Accessibility Types
# =============================================================================

CheckedState = Union[bool, Literal["mixed"]]


class AccessibilityNode(BaseModel):
    """Node in the accessibility tree."""

    role: str
    name: str | None = None
    value: str | None = None
    description: str | None = None
    checked: CheckedState | None = None
    disabled: bool | None = None
    expanded: bool | None = None
    focused: bool | None = None
    selected: bool | None = None
    required: bool | None = None
    level: int | None = None
    bounding_box: BoundingBox | None = Field(default=None, alias="boundingBox")
    children: list["AccessibilityNode"] | None = None

    model_config = {"populate_by_name": True}


# =============================================================================
# Content Types
# =============================================================================


class ContentFormat(str, Enum):
    """Content format."""

    HTML = "html"
    TEXT = "text"
    MARKDOWN = "markdown"


# =============================================================================
# Network Types
# =============================================================================


class HttpMethod(str, Enum):
    """HTTP method."""

    GET = "GET"
    POST = "POST"
    PUT = "PUT"
    DELETE = "DELETE"
    PATCH = "PATCH"
    HEAD = "HEAD"
    OPTIONS = "OPTIONS"


class ResourceType(str, Enum):
    """Resource type."""

    DOCUMENT = "document"
    STYLESHEET = "stylesheet"
    IMAGE = "image"
    MEDIA = "media"
    FONT = "font"
    SCRIPT = "script"
    TEXTTRACK = "texttrack"
    XHR = "xhr"
    FETCH = "fetch"
    EVENTSOURCE = "eventsource"
    WEBSOCKET = "websocket"
    MANIFEST = "manifest"
    OTHER = "other"
