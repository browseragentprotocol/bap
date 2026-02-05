"""
BAP event types.

Matches the TypeScript definitions in @browseragentprotocol/protocol.
"""

from enum import Enum
from typing import Literal

from pydantic import BaseModel, Field

from browseragentprotocol.types.common import HttpMethod, ResourceType


# =============================================================================
# Page Events
# =============================================================================


class PageEventType(str, Enum):
    """Page event types."""

    LOAD = "load"
    DOMCONTENTLOADED = "domcontentloaded"
    NAVIGATED = "navigated"
    ERROR = "error"
    CLOSE = "close"


class PageEvent(BaseModel):
    """Page lifecycle event."""

    type: Literal["page"]
    event: PageEventType
    page_id: str = Field(alias="pageId")
    url: str
    title: str | None = None
    timestamp: int

    model_config = {"populate_by_name": True}


# =============================================================================
# Console Events
# =============================================================================


class ConsoleLevel(str, Enum):
    """Console message level."""

    LOG = "log"
    DEBUG = "debug"
    INFO = "info"
    WARN = "warn"
    ERROR = "error"


class ConsoleEvent(BaseModel):
    """Console message event."""

    type: Literal["console"]
    level: ConsoleLevel
    text: str
    page_id: str = Field(alias="pageId")
    url: str | None = None
    line: int | None = None
    column: int | None = None
    timestamp: int

    model_config = {"populate_by_name": True}


# =============================================================================
# Network Events
# =============================================================================


class NetworkEventType(str, Enum):
    """Network event types."""

    REQUEST = "request"
    RESPONSE = "response"
    FAILED = "failed"


class NetworkRequestInfo(BaseModel):
    """Network request information."""

    request_id: str = Field(alias="requestId")
    url: str
    method: HttpMethod
    resource_type: ResourceType = Field(alias="resourceType")
    headers: dict[str, str] | None = None
    post_data: str | None = Field(default=None, alias="postData")

    model_config = {"populate_by_name": True}


class NetworkResponseInfo(BaseModel):
    """Network response information."""

    request_id: str = Field(alias="requestId")
    url: str
    status: int
    status_text: str = Field(alias="statusText")
    headers: dict[str, str] | None = None

    model_config = {"populate_by_name": True}


class NetworkFailedInfo(BaseModel):
    """Network failure information."""

    request_id: str = Field(alias="requestId")
    url: str
    error: str

    model_config = {"populate_by_name": True}


class NetworkEvent(BaseModel):
    """Network activity event."""

    type: Literal["network"]
    event: NetworkEventType
    page_id: str = Field(alias="pageId")
    request: NetworkRequestInfo | None = None
    response: NetworkResponseInfo | None = None
    failed: NetworkFailedInfo | None = None
    timestamp: int

    model_config = {"populate_by_name": True}


# =============================================================================
# Dialog Events
# =============================================================================


class DialogType(str, Enum):
    """Dialog types."""

    ALERT = "alert"
    CONFIRM = "confirm"
    PROMPT = "prompt"
    BEFOREUNLOAD = "beforeunload"


class DialogEvent(BaseModel):
    """Dialog opened event."""

    type: Literal["dialog"]
    dialog_type: DialogType = Field(alias="dialogType")
    message: str
    default_value: str | None = Field(default=None, alias="defaultValue")
    page_id: str = Field(alias="pageId")
    timestamp: int

    model_config = {"populate_by_name": True}


# =============================================================================
# Download Events
# =============================================================================


class DownloadState(str, Enum):
    """Download state."""

    STARTED = "started"
    PROGRESS = "progress"
    COMPLETED = "completed"
    CANCELED = "canceled"
    FAILED = "failed"


class DownloadEvent(BaseModel):
    """Download progress event."""

    type: Literal["download"]
    download_id: str = Field(alias="downloadId")
    url: str
    suggested_filename: str = Field(alias="suggestedFilename")
    state: DownloadState
    received_bytes: int | None = Field(default=None, alias="receivedBytes")
    total_bytes: int | None = Field(default=None, alias="totalBytes")
    page_id: str = Field(alias="pageId")
    timestamp: int

    model_config = {"populate_by_name": True}
