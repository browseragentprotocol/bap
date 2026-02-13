"""
BAP Client SDK - Main interface for browser automation.

Provides a fluent async API for connecting to BAP servers and controlling browsers.
"""

import asyncio
import json
import logging
from typing import Any, Callable, TypeVar, Union, Literal
from urllib.parse import urlencode, urlparse, urlunparse

from browseragentprotocol.errors import BAPError, BAPPageNotFoundError
from browseragentprotocol.transport import WebSocketTransport
from browseragentprotocol.types.protocol import (
    BAP_VERSION,
    ErrorCodes,
    is_error_response,
    create_request,
)
from browseragentprotocol.types.selectors import BAPSelector
from browseragentprotocol.types.common import (
    ActionOptions,
    ClickOptions,
    Cookie,
    ContentFormat,
    Page,
    ScreenshotOptions,
    ScrollOptions,
    StorageState,
    TypeOptions,
    WaitUntilState,
)
from browseragentprotocol.types.methods import (
    ApprovalRequiredParams,
    ApprovalRespondParams,
    ApprovalRespondResult,
    BrowserLaunchParams,
    BrowserLaunchResult,
    ContextCreateParams,
    ContextCreateResult,
    ContextDestroyResult,
    ContextListResult,
    FrameListResult,
    FrameMainResult,
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
    StreamCancelResult,
    StreamChunkParams,
    StreamEndParams,
)
from browseragentprotocol.types.agent import (
    AgentActParams,
    AgentActResult,
    AgentExtractParams,
    AgentExtractResult,
    AgentObserveParams,
    AgentObserveResult,
    ExecutionStep,
    StepCondition,
    StepErrorHandling,
)
from browseragentprotocol.types.events import (
    ConsoleEvent,
    DialogEvent,
    DownloadEvent,
    NetworkEvent,
    PageEvent,
)

logger = logging.getLogger(__name__)

T = TypeVar("T")


class BAPClient:
    """
    BAP Client - Main interface for browser automation.

    Example:
        ```python
        from browseragentprotocol import BAPClient, role

        async def main():
            async with BAPClient("ws://localhost:9222") as client:
                await client.launch(browser="chromium", headless=True)
                await client.create_page(url="https://example.com")

                await client.click(role("button", "Submit"))
                screenshot = await client.screenshot()

        asyncio.run(main())
        ```
    """

    def __init__(
        self,
        url: str,
        *,
        token: str | None = None,
        name: str = "bap-client-python",
        version: str = "0.2.0",
        timeout: float = 30.0,
        events: list[str] | None = None,
    ):
        """
        Create a new BAP client.

        Args:
            url: WebSocket URL of the BAP server (e.g., "ws://localhost:9222")
            token: Authentication token for server connection
            name: Client name for identification
            version: Client version
            timeout: Default timeout for operations (seconds)
            events: Events to subscribe to (default: page, console, network, dialog)
        """
        # Add token to URL if provided
        if token:
            parsed = urlparse(url)
            query = f"token={token}"
            if parsed.query:
                query = f"{parsed.query}&{query}"
            url = urlunparse(parsed._replace(query=query))

        self._url = url
        self._token = token
        self._name = name
        self._version = version
        self._timeout = timeout
        self._events = events or ["page", "console", "network", "dialog"]

        self._transport = WebSocketTransport(url)
        self._request_id = 0
        self._pending_requests: dict[
            int, tuple[asyncio.Future[Any], asyncio.TimerHandle | None]
        ] = {}
        self._initialized = False
        self._server_capabilities: dict[str, Any] | None = None
        self._active_page: str | None = None

        # Event handlers
        self._event_handlers: dict[str, list[Callable[..., None]]] = {
            "page": [],
            "console": [],
            "network": [],
            "dialog": [],
            "download": [],
            "close": [],
            "error": [],
        }

        # Stream handlers
        self._stream_chunk_handlers: list[Callable[[StreamChunkParams], None]] = []
        self._stream_end_handlers: list[Callable[[StreamEndParams], None]] = []

        # Approval handlers
        self._approval_handlers: list[Callable[[ApprovalRequiredParams], None]] = []

        # Setup transport callbacks
        self._transport.on_message = self._handle_message
        self._transport.on_close = self._handle_close
        self._transport.on_error = self._handle_error

    # =========================================================================
    # Context Manager
    # =========================================================================

    async def __aenter__(self) -> "BAPClient":
        """Async context manager entry."""
        await self.connect()
        return self

    async def __aexit__(self, exc_type: Any, exc_val: Any, exc_tb: Any) -> None:
        """Async context manager exit."""
        await self.close()

    # =========================================================================
    # Connection Management
    # =========================================================================

    async def connect(self) -> InitializeResult:
        """
        Connect to the BAP server and initialize the session.

        Returns:
            Server initialization result with capabilities
        """
        await self._transport.connect()

        result = await self._request(
            "initialize",
            {
                "protocolVersion": BAP_VERSION,
                "clientInfo": {
                    "name": self._name,
                    "version": self._version,
                },
                "capabilities": {
                    "events": self._events,
                    "streaming": False,
                    "compression": False,
                },
            },
        )

        # Validate protocol version
        server_version = result.get("protocolVersion", "0.0.0")
        server_parts = [int(x) for x in server_version.split(".")]
        client_parts = [int(x) for x in BAP_VERSION.split(".")]

        if server_parts[0] != client_parts[0]:
            raise BAPError(
                ErrorCodes.InvalidRequest,
                f"Protocol version mismatch: client={BAP_VERSION}, server={server_version}. "
                "Major version must match.",
            )

        if server_parts[1] < client_parts[1]:
            logger.warning(
                f"Server protocol version ({server_version}) is older than client ({BAP_VERSION}). "
                "Some features may not be available."
            )

        self._initialized = True
        self._server_capabilities = result.get("capabilities")

        # Notify server we're initialized
        await self._notify("notifications/initialized")

        # Subscribe to events
        if self._events:
            await self._request("events/subscribe", {"events": self._events})

        return InitializeResult.model_validate(result)

    async def close(self) -> None:
        """Gracefully close the connection."""
        if self._initialized:
            try:
                await self._request("shutdown", {"saveState": False, "closePages": True})
            except Exception:
                pass  # Ignore errors during shutdown

        await self._transport.close()
        self._initialized = False
        self._server_capabilities = None

        # Cancel all pending requests
        for request_id, (future, timer) in list(self._pending_requests.items()):
            if timer:
                timer.cancel()
            if not future.done():
                future.set_exception(BAPError(ErrorCodes.ServerError, "Client closed"))
        self._pending_requests.clear()

    @property
    def capabilities(self) -> dict[str, Any] | None:
        """Get server capabilities."""
        return self._server_capabilities

    # =========================================================================
    # Browser Methods
    # =========================================================================

    async def launch(
        self,
        browser: Literal["chromium", "firefox", "webkit"] | None = None,
        channel: str | None = None,
        headless: bool | None = None,
        args: list[str] | None = None,
        **kwargs: Any,
    ) -> BrowserLaunchResult:
        """
        Launch a browser instance.

        Args:
            browser: Browser type (chromium, firefox, webkit)
            channel: Playwright channel (e.g. "chrome", "msedge")
            headless: Run in headless mode
            args: Additional browser arguments
            **kwargs: Additional launch options

        Returns:
            Browser launch result with browser ID
        """
        params: dict[str, Any] = {}
        if browser is not None:
            params["browser"] = browser
        if channel is not None:
            params["channel"] = channel
        if headless is not None:
            params["headless"] = headless
        if args is not None:
            params["args"] = args
        params.update(kwargs)

        result = await self._request("browser/launch", params)
        return BrowserLaunchResult.model_validate(result)

    async def close_browser(self, browser_id: str | None = None) -> None:
        """Close the browser instance."""
        await self._request("browser/close", {"browserId": browser_id})

    # =========================================================================
    # Page Methods
    # =========================================================================

    async def create_page(
        self,
        url: str | None = None,
        context_id: str | None = None,
    ) -> Page:
        """
        Create a new page (tab).

        Args:
            url: Initial URL to navigate to
            context_id: Browser context to create page in

        Returns:
            Page object with id, url, title, viewport, status
        """
        params: dict[str, Any] = {}
        if url is not None:
            params["url"] = url
        if context_id is not None:
            params["contextId"] = context_id

        result = await self._request("page/create", params)
        page = Page.model_validate(result)
        self._active_page = page.id
        return page

    async def navigate(
        self,
        url: str,
        *,
        page_id: str | None = None,
        wait_until: WaitUntilState | None = None,
        timeout: int | None = None,
        referer: str | None = None,
    ) -> PageNavigateResult:
        """
        Navigate to a URL.

        Args:
            url: URL to navigate to
            page_id: Page ID (defaults to active page)
            wait_until: Wait condition (load, domcontentloaded, networkidle, commit)
            timeout: Navigation timeout in milliseconds
            referer: Referer header value

        Returns:
            Navigation result with final URL and status
        """
        params: dict[str, Any] = {
            "pageId": page_id or self._active_page,
            "url": url,
        }
        if wait_until is not None:
            params["waitUntil"] = wait_until.value if hasattr(wait_until, 'value') else wait_until
        if timeout is not None:
            params["timeout"] = timeout
        if referer is not None:
            params["referer"] = referer

        result = await self._request("page/navigate", params)
        return PageNavigateResult.model_validate(result)

    async def reload(
        self,
        *,
        page_id: str | None = None,
        wait_until: WaitUntilState | None = None,
        timeout: int | None = None,
    ) -> None:
        """Reload the current page."""
        params: dict[str, Any] = {"pageId": page_id or self._active_page}
        if wait_until is not None:
            params["waitUntil"] = wait_until.value if hasattr(wait_until, 'value') else wait_until
        if timeout is not None:
            params["timeout"] = timeout
        await self._request("page/reload", params)

    async def go_back(
        self,
        *,
        page_id: str | None = None,
        wait_until: WaitUntilState | None = None,
        timeout: int | None = None,
    ) -> None:
        """Go back in history."""
        params: dict[str, Any] = {"pageId": page_id or self._active_page}
        if wait_until is not None:
            params["waitUntil"] = wait_until.value if hasattr(wait_until, 'value') else wait_until
        if timeout is not None:
            params["timeout"] = timeout
        await self._request("page/goBack", params)

    async def go_forward(
        self,
        *,
        page_id: str | None = None,
        wait_until: WaitUntilState | None = None,
        timeout: int | None = None,
    ) -> None:
        """Go forward in history."""
        params: dict[str, Any] = {"pageId": page_id or self._active_page}
        if wait_until is not None:
            params["waitUntil"] = wait_until.value if hasattr(wait_until, 'value') else wait_until
        if timeout is not None:
            params["timeout"] = timeout
        await self._request("page/goForward", params)

    async def close_page(self, page_id: str | None = None) -> None:
        """Close a page."""
        pid = page_id or self._active_page
        if not pid:
            raise BAPPageNotFoundError("unknown")
        await self._request("page/close", {"pageId": pid})
        if self._active_page == pid:
            self._active_page = None

    async def list_pages(self) -> dict[str, Any]:
        """
        List all pages.

        Returns:
            Dict with 'pages' list and 'activePage' id
        """
        return await self._request("page/list", {})

    async def activate_page(self, page_id: str) -> None:
        """Switch to a different page."""
        await self._request("page/activate", {"pageId": page_id})
        self._active_page = page_id

    # =========================================================================
    # Action Methods
    # =========================================================================

    async def click(
        self,
        selector: BAPSelector | dict[str, Any],
        options: ClickOptions | dict[str, Any] | None = None,
    ) -> None:
        """
        Click an element.

        Args:
            selector: Element selector
            options: Click options (button, clickCount, modifiers, position, etc.)
        """
        params: dict[str, Any] = {
            "pageId": self._active_page,
            "selector": self._serialize_selector(selector),
        }
        if options is not None:
            params["options"] = self._serialize_model(options)
        await self._request("action/click", params)

    async def dblclick(
        self,
        selector: BAPSelector | dict[str, Any],
        options: ClickOptions | dict[str, Any] | None = None,
    ) -> None:
        """Double-click an element."""
        params: dict[str, Any] = {
            "pageId": self._active_page,
            "selector": self._serialize_selector(selector),
        }
        if options is not None:
            params["options"] = self._serialize_model(options)
        await self._request("action/dblclick", params)

    async def type(
        self,
        selector: BAPSelector | dict[str, Any],
        text: str,
        options: TypeOptions | dict[str, Any] | None = None,
    ) -> None:
        """
        Type text into an element (appends to existing content).

        Args:
            selector: Element selector
            text: Text to type
            options: Type options (delay, clear)
        """
        params: dict[str, Any] = {
            "pageId": self._active_page,
            "selector": self._serialize_selector(selector),
            "text": text,
        }
        if options is not None:
            params["options"] = self._serialize_model(options)
        await self._request("action/type", params)

    async def fill(
        self,
        selector: BAPSelector | dict[str, Any],
        value: str,
        options: ActionOptions | dict[str, Any] | None = None,
    ) -> None:
        """
        Fill an input field (clears existing content first).

        Args:
            selector: Element selector
            value: Value to fill
            options: Action options
        """
        params: dict[str, Any] = {
            "pageId": self._active_page,
            "selector": self._serialize_selector(selector),
            "value": value,
        }
        if options is not None:
            params["options"] = self._serialize_model(options)
        await self._request("action/fill", params)

    async def clear(
        self,
        selector: BAPSelector | dict[str, Any],
        options: ActionOptions | dict[str, Any] | None = None,
    ) -> None:
        """Clear an input field."""
        params: dict[str, Any] = {
            "pageId": self._active_page,
            "selector": self._serialize_selector(selector),
        }
        if options is not None:
            params["options"] = self._serialize_model(options)
        await self._request("action/clear", params)

    async def press(
        self,
        key: str,
        selector: BAPSelector | dict[str, Any] | None = None,
        options: ActionOptions | dict[str, Any] | None = None,
    ) -> None:
        """
        Press a keyboard key.

        Args:
            key: Key to press (e.g., "Enter", "Tab", "a")
            selector: Optional element to focus first
            options: Action options
        """
        params: dict[str, Any] = {
            "pageId": self._active_page,
            "key": key,
        }
        if selector is not None:
            params["selector"] = self._serialize_selector(selector)
        if options is not None:
            params["options"] = self._serialize_model(options)
        await self._request("action/press", params)

    async def hover(
        self,
        selector: BAPSelector | dict[str, Any],
        options: ActionOptions | dict[str, Any] | None = None,
    ) -> None:
        """Hover over an element."""
        params: dict[str, Any] = {
            "pageId": self._active_page,
            "selector": self._serialize_selector(selector),
        }
        if options is not None:
            params["options"] = self._serialize_model(options)
        await self._request("action/hover", params)

    async def scroll(
        self,
        selector: BAPSelector | dict[str, Any] | None = None,
        options: ScrollOptions | dict[str, Any] | None = None,
    ) -> None:
        """
        Scroll the page or an element.

        Args:
            selector: Element to scroll (or None for page scroll)
            options: Scroll options (direction, amount)
        """
        params: dict[str, Any] = {"pageId": self._active_page}
        if selector is not None:
            params["selector"] = self._serialize_selector(selector)
        if options is not None:
            params["options"] = self._serialize_model(options)
        await self._request("action/scroll", params)

    async def select(
        self,
        selector: BAPSelector | dict[str, Any],
        values: str | list[str],
        options: ActionOptions | dict[str, Any] | None = None,
    ) -> None:
        """
        Select option(s) from a dropdown.

        Args:
            selector: Select element selector
            values: Value(s) to select
            options: Action options
        """
        params: dict[str, Any] = {
            "pageId": self._active_page,
            "selector": self._serialize_selector(selector),
            "values": values,
        }
        if options is not None:
            params["options"] = self._serialize_model(options)
        await self._request("action/select", params)

    async def check(
        self,
        selector: BAPSelector | dict[str, Any],
        options: ActionOptions | dict[str, Any] | None = None,
    ) -> None:
        """Check a checkbox or radio button."""
        params: dict[str, Any] = {
            "pageId": self._active_page,
            "selector": self._serialize_selector(selector),
        }
        if options is not None:
            params["options"] = self._serialize_model(options)
        await self._request("action/check", params)

    async def uncheck(
        self,
        selector: BAPSelector | dict[str, Any],
        options: ActionOptions | dict[str, Any] | None = None,
    ) -> None:
        """Uncheck a checkbox."""
        params: dict[str, Any] = {
            "pageId": self._active_page,
            "selector": self._serialize_selector(selector),
        }
        if options is not None:
            params["options"] = self._serialize_model(options)
        await self._request("action/uncheck", params)

    async def upload(
        self,
        selector: BAPSelector | dict[str, Any],
        files: list[dict[str, Any]],
        options: ActionOptions | dict[str, Any] | None = None,
    ) -> None:
        """
        Upload files to a file input.

        Args:
            selector: File input selector
            files: List of file objects with name, mimeType, buffer
            options: Action options
        """
        params: dict[str, Any] = {
            "pageId": self._active_page,
            "selector": self._serialize_selector(selector),
            "files": files,
        }
        if options is not None:
            params["options"] = self._serialize_model(options)
        await self._request("action/upload", params)

    async def drag(
        self,
        source: BAPSelector | dict[str, Any],
        target: BAPSelector | dict[str, Any] | dict[str, float],
        options: ActionOptions | dict[str, Any] | None = None,
    ) -> None:
        """
        Drag an element to a target.

        Args:
            source: Source element selector
            target: Target element selector or coordinates {x, y}
            options: Action options
        """
        params: dict[str, Any] = {
            "pageId": self._active_page,
            "source": self._serialize_selector(source),
            "target": self._serialize_selector(target) if "type" in target else target,
        }
        if options is not None:
            params["options"] = self._serialize_model(options)
        await self._request("action/drag", params)

    # =========================================================================
    # Observation Methods
    # =========================================================================

    async def screenshot(
        self,
        options: ScreenshotOptions | dict[str, Any] | None = None,
    ) -> ObserveScreenshotResult:
        """
        Capture a screenshot.

        Args:
            options: Screenshot options (fullPage, clip, format, quality)

        Returns:
            Screenshot result with base64 data
        """
        params: dict[str, Any] = {"pageId": self._active_page}
        if options is not None:
            params["options"] = self._serialize_model(options)
        result = await self._request("observe/screenshot", params)
        return ObserveScreenshotResult.model_validate(result)

    async def accessibility(
        self,
        options: dict[str, Any] | None = None,
    ) -> ObserveAccessibilityResult:
        """
        Get the accessibility tree (ideal for AI agents).

        Args:
            options: Accessibility options (root, interestingOnly)

        Returns:
            Accessibility tree result
        """
        params: dict[str, Any] = {"pageId": self._active_page}
        if options is not None:
            params["options"] = options
        result = await self._request("observe/accessibility", params)
        return ObserveAccessibilityResult.model_validate(result)

    async def dom(
        self,
        options: dict[str, Any] | None = None,
    ) -> ObserveDOMResult:
        """
        Get DOM snapshot.

        Returns:
            DOM result with html, text, title, url
        """
        params: dict[str, Any] = {"pageId": self._active_page}
        if options is not None:
            params["options"] = options
        result = await self._request("observe/dom", params)
        return ObserveDOMResult.model_validate(result)

    async def element(
        self,
        selector: BAPSelector | dict[str, Any],
        properties: list[str],
    ) -> ObserveElementResult:
        """
        Query element properties.

        Args:
            selector: Element selector
            properties: List of property names to query

        Returns:
            Element properties
        """
        result = await self._request(
            "observe/element",
            {
                "pageId": self._active_page,
                "selector": self._serialize_selector(selector),
                "properties": properties,
            },
        )
        return ObserveElementResult.model_validate(result)

    async def pdf(
        self,
        options: dict[str, Any] | None = None,
    ) -> ObservePDFResult:
        """
        Generate PDF of the page.

        Returns:
            PDF result with base64 data
        """
        params: dict[str, Any] = {"pageId": self._active_page}
        if options is not None:
            params["options"] = options
        result = await self._request("observe/pdf", params)
        return ObservePDFResult.model_validate(result)

    async def content(
        self,
        format: ContentFormat | str = "text",
    ) -> ObserveContentResult:
        """
        Get page content in specified format.

        Args:
            format: Content format (html, text, markdown)

        Returns:
            Content result
        """
        format_value = format.value if hasattr(format, 'value') else format
        result = await self._request(
            "observe/content",
            {"pageId": self._active_page, "format": format_value},
        )
        return ObserveContentResult.model_validate(result)

    async def aria_snapshot(
        self,
        selector: BAPSelector | dict[str, Any] | None = None,
        options: dict[str, Any] | None = None,
    ) -> ObserveAriaSnapshotResult:
        """
        Get ARIA snapshot of the page or an element (token-efficient for AI agents).

        Args:
            selector: Optional element selector
            options: Snapshot options

        Returns:
            ARIA snapshot in YAML format
        """
        params: dict[str, Any] = {"pageId": self._active_page}
        if selector is not None:
            params["selector"] = self._serialize_selector(selector)
        if options is not None:
            params["options"] = options
        result = await self._request("observe/ariaSnapshot", params)
        return ObserveAriaSnapshotResult.model_validate(result)

    # =========================================================================
    # Storage Methods
    # =========================================================================

    async def get_storage_state(self) -> StorageState:
        """Get current storage state (for authentication persistence)."""
        result = await self._request(
            "storage/getState", {"pageId": self._active_page}
        )
        return StorageState.model_validate(result)

    async def set_storage_state(self, state: StorageState | dict[str, Any]) -> None:
        """Set storage state."""
        state_dict = self._serialize_model(state)
        await self._request("storage/setState", {"state": state_dict})

    async def get_cookies(self, urls: list[str] | None = None) -> list[Cookie]:
        """Get cookies."""
        result = await self._request("storage/getCookies", {"urls": urls})
        return [Cookie.model_validate(c) for c in result.get("cookies", [])]

    async def set_cookies(self, cookies: list[Cookie | dict[str, Any]]) -> None:
        """Set cookies."""
        cookie_dicts = [self._serialize_model(c) for c in cookies]
        await self._request("storage/setCookies", {"cookies": cookie_dicts})

    async def clear_cookies(self, urls: list[str] | None = None) -> None:
        """Clear cookies."""
        await self._request("storage/clearCookies", {"urls": urls})

    # =========================================================================
    # Emulation Methods
    # =========================================================================

    async def set_viewport(
        self,
        width: int,
        height: int,
        *,
        device_scale_factor: float | None = None,
        is_mobile: bool | None = None,
        has_touch: bool | None = None,
    ) -> None:
        """Set viewport size."""
        params: dict[str, Any] = {
            "pageId": self._active_page,
            "width": width,
            "height": height,
        }
        if device_scale_factor is not None:
            params["deviceScaleFactor"] = device_scale_factor
        if is_mobile is not None:
            params["isMobile"] = is_mobile
        if has_touch is not None:
            params["hasTouch"] = has_touch
        await self._request("emulate/setViewport", params)

    async def set_user_agent(
        self,
        user_agent: str,
        platform: str | None = None,
    ) -> None:
        """Set user agent."""
        params: dict[str, Any] = {
            "pageId": self._active_page,
            "userAgent": user_agent,
        }
        if platform is not None:
            params["platform"] = platform
        await self._request("emulate/setUserAgent", params)

    async def set_geolocation(
        self,
        latitude: float,
        longitude: float,
        accuracy: float | None = None,
    ) -> None:
        """Set geolocation."""
        params: dict[str, Any] = {
            "pageId": self._active_page,
            "latitude": latitude,
            "longitude": longitude,
        }
        if accuracy is not None:
            params["accuracy"] = accuracy
        await self._request("emulate/setGeolocation", params)

    async def set_offline(self, offline: bool) -> None:
        """Set offline mode."""
        await self._request(
            "emulate/setOffline",
            {"pageId": self._active_page, "offline": offline},
        )

    # =========================================================================
    # Dialog Methods
    # =========================================================================

    async def handle_dialog(
        self,
        action: Literal["accept", "dismiss"],
        prompt_text: str | None = None,
    ) -> None:
        """
        Handle a dialog.

        Args:
            action: How to handle the dialog (accept or dismiss)
            prompt_text: Text to enter for prompt dialogs
        """
        params: dict[str, Any] = {"action": action}
        if prompt_text is not None:
            params["promptText"] = prompt_text
        await self._request("dialog/handle", params)

    # =========================================================================
    # Tracing Methods
    # =========================================================================

    async def start_tracing(self, options: dict[str, Any] | None = None) -> None:
        """Start tracing."""
        await self._request("trace/start", options or {})

    async def stop_tracing(self) -> dict[str, Any]:
        """Stop tracing and return trace data."""
        return await self._request("trace/stop", {})

    # =========================================================================
    # Context Methods (Multi-Context Support)
    # =========================================================================

    async def create_context(
        self,
        context_id: str | None = None,
        options: dict[str, Any] | None = None,
    ) -> ContextCreateResult:
        """
        Create a new browser context.

        Args:
            context_id: Optional custom context ID
            options: Context options (viewport, userAgent, locale, etc.)

        Returns:
            Context creation result with context ID
        """
        params: dict[str, Any] = {}
        if context_id is not None:
            params["contextId"] = context_id
        if options is not None:
            params["options"] = options
        result = await self._request("context/create", params)
        return ContextCreateResult.model_validate(result)

    async def list_contexts(self) -> ContextListResult:
        """List all browser contexts."""
        result = await self._request("context/list", {})
        return ContextListResult.model_validate(result)

    async def destroy_context(self, context_id: str) -> ContextDestroyResult:
        """Destroy a browser context."""
        result = await self._request("context/destroy", {"contextId": context_id})
        return ContextDestroyResult.model_validate(result)

    # =========================================================================
    # Frame Methods (Frame & Shadow DOM Support)
    # =========================================================================

    async def list_frames(self, page_id: str | None = None) -> FrameListResult:
        """List all frames in a page."""
        result = await self._request(
            "frame/list", {"pageId": page_id or self._active_page}
        )
        return FrameListResult.model_validate(result)

    async def switch_frame(
        self,
        frame_id: str | None = None,
        selector: BAPSelector | dict[str, Any] | None = None,
        url: str | None = None,
        page_id: str | None = None,
    ) -> FrameSwitchResult:
        """
        Switch frame context for subsequent actions.

        Args:
            frame_id: Frame ID from list_frames
            selector: Frame selector (for iframe elements)
            url: Frame URL pattern
            page_id: Page ID

        Returns:
            Frame switch result with frame ID and URL
        """
        params: dict[str, Any] = {"pageId": page_id or self._active_page}
        if frame_id is not None:
            params["frameId"] = frame_id
        if selector is not None:
            params["selector"] = self._serialize_selector(selector)
        if url is not None:
            params["url"] = url
        result = await self._request("frame/switch", params)
        return FrameSwitchResult.model_validate(result)

    async def main_frame(self, page_id: str | None = None) -> FrameMainResult:
        """Return to main frame."""
        result = await self._request(
            "frame/main", {"pageId": page_id or self._active_page}
        )
        return FrameMainResult.model_validate(result)

    # =========================================================================
    # Agent Methods (AI-Optimized Composite Operations)
    # =========================================================================

    async def act(
        self,
        steps: list[ExecutionStep | dict[str, Any]],
        *,
        page_id: str | None = None,
        stop_on_first_error: bool | None = None,
        continue_on_condition_fail: bool | None = None,
        timeout: int | None = None,
    ) -> AgentActResult:
        """
        Execute multi-step action sequences atomically.

        Args:
            steps: List of execution steps
            page_id: Page ID (defaults to active page)
            stop_on_first_error: Stop on first error (default: True)
            continue_on_condition_fail: Continue even if condition fails
            timeout: Global timeout in milliseconds

        Returns:
            Act result with completion status and step results
        """
        params: dict[str, Any] = {
            "pageId": page_id or self._active_page,
            "steps": [self._serialize_model(s) for s in steps],
        }
        if stop_on_first_error is not None:
            params["stopOnFirstError"] = stop_on_first_error
        if continue_on_condition_fail is not None:
            params["continueOnConditionFail"] = continue_on_condition_fail
        if timeout is not None:
            params["timeout"] = timeout

        result = await self._request("agent/act", params)
        return AgentActResult.model_validate(result)

    async def observe(
        self,
        *,
        page_id: str | None = None,
        include_accessibility: bool | None = None,
        include_screenshot: bool | None = None,
        include_interactive_elements: bool | None = None,
        include_metadata: bool | None = None,
        max_elements: int | None = None,
        filter_roles: list[str] | None = None,
        include_bounds: bool | None = None,
        stable_refs: bool | None = None,
        refresh_refs: bool | None = None,
        include_ref_history: bool | None = None,
        annotate_screenshot: bool | dict[str, Any] | None = None,
    ) -> AgentObserveResult:
        """
        Get AI-optimized page observations.

        Args:
            page_id: Page ID (defaults to active page)
            include_accessibility: Include accessibility tree
            include_screenshot: Include screenshot
            include_interactive_elements: Include interactive elements list
            include_metadata: Include page metadata
            max_elements: Maximum elements to return (1-200)
            filter_roles: Filter to specific ARIA roles
            include_bounds: Include element bounding boxes
            stable_refs: Use stable refs (default: True)
            refresh_refs: Force refresh all refs
            include_ref_history: Include previous ref if reassigned
            annotate_screenshot: Annotate screenshot with element markers

        Returns:
            Observation result with requested data
        """
        params: dict[str, Any] = {"pageId": page_id or self._active_page}
        if include_accessibility is not None:
            params["includeAccessibility"] = include_accessibility
        if include_screenshot is not None:
            params["includeScreenshot"] = include_screenshot
        if include_interactive_elements is not None:
            params["includeInteractiveElements"] = include_interactive_elements
        if include_metadata is not None:
            params["includeMetadata"] = include_metadata
        if max_elements is not None:
            params["maxElements"] = max_elements
        if filter_roles is not None:
            params["filterRoles"] = filter_roles
        if include_bounds is not None:
            params["includeBounds"] = include_bounds
        if stable_refs is not None:
            params["stableRefs"] = stable_refs
        if refresh_refs is not None:
            params["refreshRefs"] = refresh_refs
        if include_ref_history is not None:
            params["includeRefHistory"] = include_ref_history
        if annotate_screenshot is not None:
            params["annotateScreenshot"] = annotate_screenshot

        result = await self._request("agent/observe", params)
        return AgentObserveResult.model_validate(result)

    async def extract(
        self,
        instruction: str,
        schema: dict[str, Any],
        *,
        page_id: str | None = None,
        mode: Literal["single", "list", "table"] | None = None,
        selector: BAPSelector | dict[str, Any] | None = None,
        include_source_refs: bool | None = None,
        timeout: int | None = None,
    ) -> AgentExtractResult:
        """
        Extract structured data from the page.

        Args:
            instruction: Natural language description of what to extract
            schema: JSON Schema defining the structure of extracted data
            page_id: Page ID (defaults to active page)
            mode: Extraction mode (single, list, table)
            selector: Limit extraction scope to element
            include_source_refs: Include source element references
            timeout: Extraction timeout in milliseconds

        Returns:
            Extraction result with data matching schema
        """
        params: dict[str, Any] = {
            "pageId": page_id or self._active_page,
            "instruction": instruction,
            "schema": schema,
        }
        if mode is not None:
            params["mode"] = mode
        if selector is not None:
            params["selector"] = self._serialize_selector(selector)
        if include_source_refs is not None:
            params["includeSourceRefs"] = include_source_refs
        if timeout is not None:
            params["timeout"] = timeout

        result = await self._request("agent/extract", params)
        return AgentExtractResult.model_validate(result)

    # =========================================================================
    # Stream Methods
    # =========================================================================

    async def cancel_stream(self, stream_id: str) -> StreamCancelResult:
        """Cancel an in-progress stream."""
        result = await self._request("stream/cancel", {"streamId": stream_id})
        return StreamCancelResult.model_validate(result)

    def on_stream_chunk(
        self, handler: Callable[[StreamChunkParams], None]
    ) -> Callable[[], None]:
        """
        Register a handler for stream chunks.

        Returns:
            Unsubscribe function
        """
        self._stream_chunk_handlers.append(handler)
        return lambda: self._stream_chunk_handlers.remove(handler)

    def on_stream_end(
        self, handler: Callable[[StreamEndParams], None]
    ) -> Callable[[], None]:
        """
        Register a handler for stream end.

        Returns:
            Unsubscribe function
        """
        self._stream_end_handlers.append(handler)
        return lambda: self._stream_end_handlers.remove(handler)

    # =========================================================================
    # Approval Methods (Human-in-the-Loop)
    # =========================================================================

    def on_approval_required(
        self, handler: Callable[[ApprovalRequiredParams], None]
    ) -> Callable[[], None]:
        """
        Register a handler for approval requests.

        Returns:
            Unsubscribe function
        """
        self._approval_handlers.append(handler)
        return lambda: self._approval_handlers.remove(handler)

    async def respond_to_approval(
        self,
        request_id: str,
        decision: Literal["approve", "deny", "approve-once", "approve-session"],
        reason: str | None = None,
    ) -> ApprovalRespondResult:
        """
        Respond to an approval request.

        Args:
            request_id: Approval request ID
            decision: Approval decision
            reason: Optional reason for the decision

        Returns:
            Approval response result
        """
        params: dict[str, Any] = {
            "requestId": request_id,
            "decision": decision,
        }
        if reason is not None:
            params["reason"] = reason
        result = await self._request("approval/respond", params)
        return ApprovalRespondResult.model_validate(result)

    # =========================================================================
    # Event Handling
    # =========================================================================

    def on(
        self, event: str, handler: Callable[..., None]
    ) -> Callable[[], None]:
        """
        Register an event handler.

        Args:
            event: Event name (page, console, network, dialog, download, close, error)
            handler: Event handler function

        Returns:
            Unsubscribe function
        """
        if event not in self._event_handlers:
            self._event_handlers[event] = []
        self._event_handlers[event].append(handler)
        return lambda: self._event_handlers[event].remove(handler)

    # =========================================================================
    # Static Helpers
    # =========================================================================

    @staticmethod
    def step(
        action: str,
        params: dict[str, Any],
        *,
        label: str | None = None,
        condition: StepCondition | dict[str, Any] | None = None,
        on_error: StepErrorHandling | str | None = None,
        max_retries: int | None = None,
        retry_delay: int | None = None,
    ) -> ExecutionStep:
        """
        Helper to create an execution step for agent/act.

        Args:
            action: BAP method to execute
            params: Action parameters
            label: Human-readable label
            condition: Pre-condition
            on_error: Error handling strategy
            max_retries: Max retries if on_error is "retry"
            retry_delay: Delay between retries

        Returns:
            ExecutionStep object
        """
        step_dict: dict[str, Any] = {
            "action": action,
            "params": params,
        }
        if label is not None:
            step_dict["label"] = label
        if condition is not None:
            step_dict["condition"] = condition
        if on_error is not None:
            step_dict["onError"] = on_error.value if hasattr(on_error, 'value') else on_error
        if max_retries is not None:
            step_dict["maxRetries"] = max_retries
        if retry_delay is not None:
            step_dict["retryDelay"] = retry_delay
        return ExecutionStep.model_validate(step_dict)

    # =========================================================================
    # Internal Methods
    # =========================================================================

    def _handle_message(self, message: str) -> None:
        """Handle incoming WebSocket message."""
        try:
            data = json.loads(message)
        except json.JSONDecodeError:
            logger.error(f"Failed to parse message: {message[:100]}")
            return

        # Check if it's a response (has id) or notification (has method, no id)
        if "id" in data:
            self._handle_response(data)
        elif "method" in data:
            self._handle_notification(data)

    def _handle_response(self, data: dict[str, Any]) -> None:
        """Handle a JSON-RPC response."""
        request_id = data.get("id")
        if request_id not in self._pending_requests:
            logger.warning(f"Received response for unknown request: {request_id}")
            return

        future, timer = self._pending_requests.pop(request_id)
        if timer:
            timer.cancel()

        if future.done():
            return

        if is_error_response(data):
            error = BAPError.from_dict(data["error"])
            future.set_exception(error)
        else:
            future.set_result(data.get("result"))

    def _handle_notification(self, data: dict[str, Any]) -> None:
        """Handle a JSON-RPC notification."""
        method = data.get("method", "")
        params = data.get("params", {})

        # Handle stream notifications
        if method == "stream/chunk":
            chunk = StreamChunkParams.model_validate(params)
            for handler in self._stream_chunk_handlers:
                try:
                    handler(chunk)
                except Exception as e:
                    logger.error(f"Stream chunk handler error: {e}")
            return

        if method == "stream/end":
            end = StreamEndParams.model_validate(params)
            for handler in self._stream_end_handlers:
                try:
                    handler(end)
                except Exception as e:
                    logger.error(f"Stream end handler error: {e}")
            return

        # Handle approval notifications
        if method == "approval/required":
            approval = ApprovalRequiredParams.model_validate(params)
            for handler in self._approval_handlers:
                try:
                    handler(approval)
                except Exception as e:
                    logger.error(f"Approval handler error: {e}")
            return

        # Handle event notifications
        if method.startswith("event/"):
            event_type = method.split("/")[1]
        else:
            event_type = method

        if event_type in self._event_handlers:
            for handler in self._event_handlers[event_type]:
                try:
                    handler(params)
                except Exception as e:
                    logger.error(f"Event handler error: {e}")

    def _handle_close(self) -> None:
        """Handle WebSocket close."""
        for handler in self._event_handlers.get("close", []):
            try:
                handler()
            except Exception as e:
                logger.error(f"Close handler error: {e}")

    def _handle_error(self, error: Exception) -> None:
        """Handle WebSocket error."""
        for handler in self._event_handlers.get("error", []):
            try:
                handler(error)
            except Exception as e:
                logger.error(f"Error handler error: {e}")

    async def _request(self, method: str, params: dict[str, Any]) -> Any:
        """Send a request and wait for response."""
        self._request_id += 1
        request_id = self._request_id

        request = create_request(request_id, method, params)

        loop = asyncio.get_running_loop()
        future: asyncio.Future[Any] = loop.create_future()

        # Set up timeout
        def on_timeout() -> None:
            if request_id in self._pending_requests:
                f, _ = self._pending_requests.pop(request_id)
                if not f.done():
                    f.set_exception(
                        BAPError(
                            ErrorCodes.Timeout,
                            f"Request timeout: {method}",
                            retryable=True,
                        )
                    )

        timer = loop.call_later(self._timeout, on_timeout)
        self._pending_requests[request_id] = (future, timer)

        try:
            await self._transport.send(json.dumps(request))
            return await future
        except Exception:
            # Clean up on error
            if request_id in self._pending_requests:
                _, t = self._pending_requests.pop(request_id)
                if t:
                    t.cancel()
            raise

    async def _notify(self, method: str, params: dict[str, Any] | None = None) -> None:
        """Send a notification (no response expected)."""
        notification: dict[str, Any] = {
            "jsonrpc": "2.0",
            "method": method,
        }
        if params is not None:
            notification["params"] = params
        await self._transport.send(json.dumps(notification))

    def _serialize_selector(
        self, selector: BAPSelector | dict[str, Any]
    ) -> dict[str, Any]:
        """Serialize a selector to dict."""
        if hasattr(selector, "model_dump"):
            return selector.model_dump(by_alias=True, exclude_none=True)
        return dict(selector)

    def _serialize_model(self, model: Any) -> dict[str, Any]:
        """Serialize a Pydantic model or dict to dict."""
        if hasattr(model, "model_dump"):
            return model.model_dump(by_alias=True, exclude_none=True)
        return dict(model)
