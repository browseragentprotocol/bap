"""
BAP Agent types for composite actions, observations, and data extraction.

Matches the TypeScript definitions in @browseragentprotocol/protocol.
"""

from enum import Enum
from typing import Annotated, Any, Literal, Union

from pydantic import BaseModel, Field

from browseragentprotocol.types.selectors import BAPSelector
from browseragentprotocol.types.common import AccessibilityNode, ScreenshotFormat

# =============================================================================
# agent/act - Multi-step action execution
# =============================================================================


class StepConditionState(str, Enum):
    """Pre-condition state for a step."""

    VISIBLE = "visible"
    ENABLED = "enabled"
    EXISTS = "exists"
    HIDDEN = "hidden"
    DISABLED = "disabled"


class StepCondition(BaseModel):
    """Pre-condition for a step (must be true before step executes)."""

    selector: Any  # BAPSelector causes issues with forward refs
    state: StepConditionState
    timeout: int | None = None


class StepErrorHandling(str, Enum):
    """Error handling strategy for a step."""

    STOP = "stop"
    SKIP = "skip"
    RETRY = "retry"


class ExecutionStep(BaseModel):
    """A single step in an action sequence."""

    label: str | None = None
    action: str
    params: dict[str, Any]
    condition: StepCondition | None = None
    on_error: StepErrorHandling | None = Field(default=None, alias="onError")
    max_retries: int | None = Field(default=None, ge=1, le=5, alias="maxRetries")
    retry_delay: int | None = Field(default=None, ge=100, le=5000, alias="retryDelay")

    model_config = {"populate_by_name": True}


class AgentActParams(BaseModel):
    """Parameters for agent/act."""

    page_id: str | None = Field(default=None, alias="pageId")
    steps: list[ExecutionStep] = Field(min_length=1, max_length=50)
    stop_on_first_error: bool | None = Field(default=None, alias="stopOnFirstError")
    continue_on_condition_fail: bool | None = Field(default=None, alias="continueOnConditionFail")
    timeout: int | None = None

    model_config = {"populate_by_name": True}


class StepError(BaseModel):
    """Error information for a failed step."""

    code: int
    message: str
    data: dict[str, Any] | None = None


class StepResult(BaseModel):
    """Result of a single step execution."""

    step: int
    label: str | None = None
    success: bool
    result: Any | None = None
    error: StepError | None = None
    duration: int
    retries: int | None = None


class AgentActResult(BaseModel):
    """Result of agent/act."""

    completed: int
    total: int
    success: bool
    results: list[StepResult]
    duration: int
    failed_at: int | None = Field(default=None, alias="failedAt")

    model_config = {"populate_by_name": True}


# =============================================================================
# agent/observe - AI-optimized page observation
# =============================================================================


class ActionHint(str, Enum):
    """Action hint for an interactive element."""

    CLICKABLE = "clickable"
    EDITABLE = "editable"
    SELECTABLE = "selectable"
    CHECKABLE = "checkable"
    EXPANDABLE = "expandable"
    DRAGGABLE = "draggable"
    SCROLLABLE = "scrollable"
    SUBMITTABLE = "submittable"


class ElementBounds(BaseModel):
    """Bounding box for an element."""

    x: float
    y: float
    width: float
    height: float


class ElementIdentity(BaseModel):
    """Element identity information for stable reference generation."""

    test_id: str | None = Field(default=None, alias="testId")
    aria_label: str | None = Field(default=None, alias="ariaLabel")
    id: str | None = None
    role: str
    name: str | None = None
    tag_name: str = Field(alias="tagName")
    parent_role: str | None = Field(default=None, alias="parentRole")
    sibling_index: int | None = Field(default=None, alias="siblingIndex")

    model_config = {"populate_by_name": True}


class RefStability(str, Enum):
    """Stability indicator for element references."""

    STABLE = "stable"
    NEW = "new"
    MOVED = "moved"


class InteractiveElement(BaseModel):
    """Interactive element with pre-computed selector."""

    ref: str
    selector: Any  # BAPSelector
    role: str
    name: str | None = None
    value: str | None = None
    action_hints: list[ActionHint] = Field(alias="actionHints")
    bounds: ElementBounds | None = None
    tag_name: str = Field(alias="tagName")
    focused: bool | None = None
    disabled: bool | None = None
    previous_ref: str | None = Field(default=None, alias="previousRef")
    stability: RefStability | None = None

    model_config = {"populate_by_name": True}


# =============================================================================
# Screenshot Annotation (Set-of-Marks)
# =============================================================================


class AnnotationBadgeStyle(BaseModel):
    """Badge style for annotation markers."""

    color: str | None = None
    text_color: str | None = Field(default=None, alias="textColor")
    size: int | None = None
    font: str | None = None

    model_config = {"populate_by_name": True}


class AnnotationBoxStyle(BaseModel):
    """Bounding box style for annotation."""

    color: str | None = None
    width: int | None = None
    style: Literal["solid", "dashed"] | None = None


class AnnotationStyle(BaseModel):
    """Annotation style options."""

    badge: AnnotationBadgeStyle | None = None
    box: AnnotationBoxStyle | None = None
    show_bounding_box: bool | None = Field(default=None, alias="showBoundingBox")
    opacity: float | None = Field(default=None, ge=0, le=1)

    model_config = {"populate_by_name": True}


class AnnotationLabelFormat(str, Enum):
    """Label format for annotations."""

    NUMBER = "number"
    REF = "ref"
    BOTH = "both"


class AnnotationOptions(BaseModel):
    """Full annotation options."""

    enabled: bool
    style: AnnotationStyle | None = None
    use_stable_refs: bool | None = Field(default=None, alias="useStableRefs")
    max_labels: int | None = Field(default=None, alias="maxLabels")
    label_format: AnnotationLabelFormat | None = Field(default=None, alias="labelFormat")

    model_config = {"populate_by_name": True}


class AnnotationMapping(BaseModel):
    """Mapping from annotation label to element."""

    label: str
    ref: str
    position: dict[str, float]


class AgentObserveParams(BaseModel):
    """Parameters for agent/observe."""

    page_id: str | None = Field(default=None, alias="pageId")
    include_accessibility: bool | None = Field(default=None, alias="includeAccessibility")
    include_screenshot: bool | None = Field(default=None, alias="includeScreenshot")
    include_interactive_elements: bool | None = Field(
        default=None, alias="includeInteractiveElements"
    )
    include_metadata: bool | None = Field(default=None, alias="includeMetadata")
    max_elements: int | None = Field(default=None, ge=1, le=200, alias="maxElements")
    filter_roles: list[str] | None = Field(default=None, alias="filterRoles")
    include_bounds: bool | None = Field(default=None, alias="includeBounds")
    stable_refs: bool | None = Field(default=None, alias="stableRefs")
    refresh_refs: bool | None = Field(default=None, alias="refreshRefs")
    include_ref_history: bool | None = Field(default=None, alias="includeRefHistory")
    annotate_screenshot: bool | AnnotationOptions | None = Field(
        default=None, alias="annotateScreenshot"
    )

    model_config = {"populate_by_name": True}


class ObserveMetadata(BaseModel):
    """Page metadata in observation."""

    url: str
    title: str
    viewport: dict[str, int]


class ObserveScreenshot(BaseModel):
    """Screenshot data in observation."""

    data: str
    format: ScreenshotFormat
    width: int
    height: int
    annotated: bool | None = None


class AgentObserveResult(BaseModel):
    """Result of agent/observe."""

    metadata: ObserveMetadata | None = None
    accessibility: dict[str, Any] | None = None
    screenshot: ObserveScreenshot | None = None
    interactive_elements: list[InteractiveElement] | None = Field(
        default=None, alias="interactiveElements"
    )
    total_interactive_elements: int | None = Field(
        default=None, alias="totalInteractiveElements"
    )
    annotation_map: list[AnnotationMapping] | None = Field(default=None, alias="annotationMap")

    model_config = {"populate_by_name": True}


# =============================================================================
# Allowed Actions for agent/act
# =============================================================================

ALLOWED_ACT_ACTIONS = [
    "action/click",
    "action/dblclick",
    "action/fill",
    "action/type",
    "action/press",
    "action/hover",
    "action/scroll",
    "action/select",
    "action/check",
    "action/uncheck",
    "action/clear",
    "action/upload",
    "action/drag",
    "page/navigate",
    "page/reload",
    "page/goBack",
    "page/goForward",
]


# =============================================================================
# agent/extract - Structured data extraction
# =============================================================================


class ExtractionSchema(BaseModel):
    """JSON Schema for extraction (simplified subset)."""

    type: Literal["object", "array", "string", "number", "boolean"]
    properties: dict[str, Any] | None = None
    required: list[str] | None = None
    items: dict[str, Any] | None = None
    description: str | None = None


class ExtractionMode(str, Enum):
    """Extraction mode."""

    SINGLE = "single"
    LIST = "list"
    TABLE = "table"


class AgentExtractParams(BaseModel):
    """Parameters for agent/extract."""

    page_id: str | None = Field(default=None, alias="pageId")
    instruction: str
    schema_: ExtractionSchema = Field(alias="schema")
    mode: ExtractionMode | None = None
    selector: Any | None = None  # BAPSelector
    include_source_refs: bool | None = Field(default=None, alias="includeSourceRefs")
    timeout: int | None = None

    model_config = {"populate_by_name": True}


class ExtractionSourceRef(BaseModel):
    """Source reference for extracted data."""

    ref: str
    selector: Any  # BAPSelector
    text: str | None = None


class AgentExtractResult(BaseModel):
    """Result of agent/extract."""

    success: bool
    data: Any | None = None
    sources: list[ExtractionSourceRef] | None = None
    confidence: float | None = Field(default=None, ge=0, le=1)
    error: str | None = None
