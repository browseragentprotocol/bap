"""
BAP selector types with Pydantic models.

Matches the TypeScript definitions in @browseragentprotocol/protocol.
"""

from enum import Enum
from typing import Annotated, Literal, Union

from pydantic import BaseModel, Field

# =============================================================================
# ARIA Roles
# =============================================================================


class AriaRole(str, Enum):
    """ARIA roles for role-based selectors."""

    ALERT = "alert"
    ALERTDIALOG = "alertdialog"
    APPLICATION = "application"
    ARTICLE = "article"
    BANNER = "banner"
    BUTTON = "button"
    CELL = "cell"
    CHECKBOX = "checkbox"
    COLUMNHEADER = "columnheader"
    COMBOBOX = "combobox"
    COMPLEMENTARY = "complementary"
    CONTENTINFO = "contentinfo"
    DEFINITION = "definition"
    DIALOG = "dialog"
    DIRECTORY = "directory"
    DOCUMENT = "document"
    FEED = "feed"
    FIGURE = "figure"
    FORM = "form"
    GRID = "grid"
    GRIDCELL = "gridcell"
    GROUP = "group"
    HEADING = "heading"
    IMG = "img"
    LINK = "link"
    LIST = "list"
    LISTBOX = "listbox"
    LISTITEM = "listitem"
    LOG = "log"
    MAIN = "main"
    MARQUEE = "marquee"
    MATH = "math"
    MENU = "menu"
    MENUBAR = "menubar"
    MENUITEM = "menuitem"
    MENUITEMCHECKBOX = "menuitemcheckbox"
    MENUITEMRADIO = "menuitemradio"
    NAVIGATION = "navigation"
    NONE = "none"
    NOTE = "note"
    OPTION = "option"
    PRESENTATION = "presentation"
    PROGRESSBAR = "progressbar"
    RADIO = "radio"
    RADIOGROUP = "radiogroup"
    REGION = "region"
    ROW = "row"
    ROWGROUP = "rowgroup"
    ROWHEADER = "rowheader"
    SCROLLBAR = "scrollbar"
    SEARCH = "search"
    SEARCHBOX = "searchbox"
    SEPARATOR = "separator"
    SLIDER = "slider"
    SPINBUTTON = "spinbutton"
    STATUS = "status"
    SWITCH = "switch"
    TAB = "tab"
    TABLE = "table"
    TABLIST = "tablist"
    TABPANEL = "tabpanel"
    TERM = "term"
    TEXTBOX = "textbox"
    TIMER = "timer"
    TOOLBAR = "toolbar"
    TOOLTIP = "tooltip"
    TREE = "tree"
    TREEGRID = "treegrid"
    TREEITEM = "treeitem"


# =============================================================================
# Selector Types
# =============================================================================


class CSSSelector(BaseModel):
    """CSS selector."""

    type: Literal["css"] = "css"
    value: str


class XPathSelector(BaseModel):
    """XPath selector."""

    type: Literal["xpath"] = "xpath"
    value: str


class RoleSelector(BaseModel):
    """Role-based selector (ARIA)."""

    type: Literal["role"] = "role"
    role: AriaRole | str  # Allow string for flexibility
    name: str | None = None
    exact: bool | None = None


class TextSelector(BaseModel):
    """Text content selector."""

    type: Literal["text"] = "text"
    value: str
    exact: bool | None = None


class LabelSelector(BaseModel):
    """Label selector (for form elements)."""

    type: Literal["label"] = "label"
    value: str
    exact: bool | None = None


class PlaceholderSelector(BaseModel):
    """Placeholder selector (for inputs)."""

    type: Literal["placeholder"] = "placeholder"
    value: str
    exact: bool | None = None


class TestIdSelector(BaseModel):
    """Test ID selector (data-testid attribute)."""

    type: Literal["testId"] = "testId"
    value: str


class SemanticSelector(BaseModel):
    """Semantic selector (AI-resolved)."""

    type: Literal["semantic"] = "semantic"
    description: str


class CoordinatesSelector(BaseModel):
    """Coordinate-based selector."""

    type: Literal["coordinates"] = "coordinates"
    x: float
    y: float


class RefSelector(BaseModel):
    """Ref selector - reference a stable element by its ref ID."""

    type: Literal["ref"] = "ref"
    ref: str


# Union of all selector types using discriminated union
BAPSelector = Annotated[
    Union[
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
    ],
    Field(discriminator="type"),
]


# =============================================================================
# Selector Factory Functions
# =============================================================================


def css(value: str) -> CSSSelector:
    """Create a CSS selector."""
    return CSSSelector(type="css", value=value)


def xpath(value: str) -> XPathSelector:
    """Create an XPath selector."""
    return XPathSelector(type="xpath", value=value)


def role(
    role: AriaRole | str,
    name: str | None = None,
    exact: bool | None = None,
) -> RoleSelector:
    """Create a role-based selector (recommended)."""
    return RoleSelector(type="role", role=role, name=name, exact=exact)


def text(value: str, exact: bool | None = None) -> TextSelector:
    """Create a text selector."""
    return TextSelector(type="text", value=value, exact=exact)


def label(value: str, exact: bool | None = None) -> LabelSelector:
    """Create a label selector."""
    return LabelSelector(type="label", value=value, exact=exact)


def placeholder(value: str, exact: bool | None = None) -> PlaceholderSelector:
    """Create a placeholder selector."""
    return PlaceholderSelector(type="placeholder", value=value, exact=exact)


def test_id(value: str) -> TestIdSelector:
    """Create a test ID selector."""
    return TestIdSelector(type="testId", value=value)


def semantic(description: str) -> SemanticSelector:
    """Create a semantic selector (AI-resolved)."""
    return SemanticSelector(type="semantic", description=description)


def coords(x: float, y: float) -> CoordinatesSelector:
    """Create a coordinates selector."""
    return CoordinatesSelector(type="coordinates", x=x, y=y)


def ref(ref_id: str) -> RefSelector:
    """Create a ref selector (for stable element refs)."""
    return RefSelector(type="ref", ref=ref_id)
