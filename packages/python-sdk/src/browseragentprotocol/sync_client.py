"""
Synchronous wrapper for BAPClient.

Provides a blocking API for use in non-async contexts.
"""

import asyncio
from typing import Any, Callable, Literal

from browseragentprotocol.client import BAPClient
from browseragentprotocol.types.selectors import BAPSelector
from browseragentprotocol.types.common import (
    ActionOptions,
    ClickOptions,
    ContentFormat,
    Cookie,
    Page,
    ScreenshotOptions,
    ScrollOptions,
    StorageState,
    TypeOptions,
    WaitUntilState,
)
from browseragentprotocol.types.methods import (
    ApprovalRespondResult,
    BrowserLaunchResult,
    ContextCreateResult,
    ContextDestroyResult,
    ContextListResult,
    FrameListResult,
    FrameMainResult,
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
)
from browseragentprotocol.types.agent import (
    AgentActResult,
    AgentExtractResult,
    AgentObserveResult,
    ExecutionStep,
)


class BAPClientSync:
    """
    Synchronous wrapper for BAPClient.

    Provides a blocking API for use in scripts, notebooks, or non-async contexts.

    Example:
        ```python
        from browseragentprotocol import BAPClientSync, role

        with BAPClientSync("ws://localhost:9222") as client:
            client.launch(browser="chromium", headless=True)
            client.create_page(url="https://example.com")

            client.click(role("button", "Submit"))
            screenshot = client.screenshot()
        ```
    """

    def __init__(
        self,
        url: str,
        *,
        token: str | None = None,
        name: str = "bap-client-python-sync",
        version: str = "0.1.0",
        timeout: float = 30.0,
        events: list[str] | None = None,
    ):
        """
        Create a new synchronous BAP client.

        Args:
            url: WebSocket URL of the BAP server
            token: Authentication token
            name: Client name for identification
            version: Client version
            timeout: Default timeout for operations (seconds)
            events: Events to subscribe to
        """
        self._async_client = BAPClient(
            url,
            token=token,
            name=name,
            version=version,
            timeout=timeout,
            events=events,
        )
        self._loop: asyncio.AbstractEventLoop | None = None

    def _get_loop(self) -> asyncio.AbstractEventLoop:
        """Get or create an event loop."""
        if self._loop is None or self._loop.is_closed():
            try:
                self._loop = asyncio.get_running_loop()
            except RuntimeError:
                self._loop = asyncio.new_event_loop()
                asyncio.set_event_loop(self._loop)
        return self._loop

    def _run(self, coro: Any) -> Any:
        """Run a coroutine in the event loop."""
        loop = self._get_loop()
        return loop.run_until_complete(coro)

    # =========================================================================
    # Context Manager
    # =========================================================================

    def __enter__(self) -> "BAPClientSync":
        """Sync context manager entry."""
        self.connect()
        return self

    def __exit__(self, exc_type: Any, exc_val: Any, exc_tb: Any) -> None:
        """Sync context manager exit."""
        self.close()

    # =========================================================================
    # Connection Management
    # =========================================================================

    def connect(self) -> InitializeResult:
        """Connect to the BAP server and initialize the session."""
        return self._run(self._async_client.connect())

    def close(self) -> None:
        """Gracefully close the connection."""
        self._run(self._async_client.close())

    @property
    def capabilities(self) -> dict[str, Any] | None:
        """Get server capabilities."""
        return self._async_client.capabilities

    # =========================================================================
    # Browser Methods
    # =========================================================================

    def launch(
        self,
        browser: Literal["chromium", "firefox", "webkit"] | None = None,
        headless: bool | None = None,
        args: list[str] | None = None,
        **kwargs: Any,
    ) -> BrowserLaunchResult:
        """Launch a browser instance."""
        return self._run(
            self._async_client.launch(browser=browser, headless=headless, args=args, **kwargs)
        )

    def close_browser(self, browser_id: str | None = None) -> None:
        """Close the browser instance."""
        self._run(self._async_client.close_browser(browser_id))

    # =========================================================================
    # Page Methods
    # =========================================================================

    def create_page(
        self,
        url: str | None = None,
        context_id: str | None = None,
    ) -> Page:
        """Create a new page (tab)."""
        return self._run(self._async_client.create_page(url=url, context_id=context_id))

    def navigate(
        self,
        url: str,
        *,
        page_id: str | None = None,
        wait_until: WaitUntilState | None = None,
        timeout: int | None = None,
        referer: str | None = None,
    ) -> PageNavigateResult:
        """Navigate to a URL."""
        return self._run(
            self._async_client.navigate(
                url, page_id=page_id, wait_until=wait_until, timeout=timeout, referer=referer
            )
        )

    def reload(
        self,
        *,
        page_id: str | None = None,
        wait_until: WaitUntilState | None = None,
        timeout: int | None = None,
    ) -> None:
        """Reload the current page."""
        self._run(self._async_client.reload(page_id=page_id, wait_until=wait_until, timeout=timeout))

    def go_back(
        self,
        *,
        page_id: str | None = None,
        wait_until: WaitUntilState | None = None,
        timeout: int | None = None,
    ) -> None:
        """Go back in history."""
        self._run(self._async_client.go_back(page_id=page_id, wait_until=wait_until, timeout=timeout))

    def go_forward(
        self,
        *,
        page_id: str | None = None,
        wait_until: WaitUntilState | None = None,
        timeout: int | None = None,
    ) -> None:
        """Go forward in history."""
        self._run(
            self._async_client.go_forward(page_id=page_id, wait_until=wait_until, timeout=timeout)
        )

    def close_page(self, page_id: str | None = None) -> None:
        """Close a page."""
        self._run(self._async_client.close_page(page_id))

    def list_pages(self) -> dict[str, Any]:
        """List all pages."""
        return self._run(self._async_client.list_pages())

    def activate_page(self, page_id: str) -> None:
        """Switch to a different page."""
        self._run(self._async_client.activate_page(page_id))

    # =========================================================================
    # Action Methods
    # =========================================================================

    def click(
        self,
        selector: BAPSelector | dict[str, Any],
        options: ClickOptions | dict[str, Any] | None = None,
    ) -> None:
        """Click an element."""
        self._run(self._async_client.click(selector, options))

    def dblclick(
        self,
        selector: BAPSelector | dict[str, Any],
        options: ClickOptions | dict[str, Any] | None = None,
    ) -> None:
        """Double-click an element."""
        self._run(self._async_client.dblclick(selector, options))

    def type(
        self,
        selector: BAPSelector | dict[str, Any],
        text: str,
        options: TypeOptions | dict[str, Any] | None = None,
    ) -> None:
        """Type text into an element."""
        self._run(self._async_client.type(selector, text, options))

    def fill(
        self,
        selector: BAPSelector | dict[str, Any],
        value: str,
        options: ActionOptions | dict[str, Any] | None = None,
    ) -> None:
        """Fill an input field."""
        self._run(self._async_client.fill(selector, value, options))

    def clear(
        self,
        selector: BAPSelector | dict[str, Any],
        options: ActionOptions | dict[str, Any] | None = None,
    ) -> None:
        """Clear an input field."""
        self._run(self._async_client.clear(selector, options))

    def press(
        self,
        key: str,
        selector: BAPSelector | dict[str, Any] | None = None,
        options: ActionOptions | dict[str, Any] | None = None,
    ) -> None:
        """Press a keyboard key."""
        self._run(self._async_client.press(key, selector, options))

    def hover(
        self,
        selector: BAPSelector | dict[str, Any],
        options: ActionOptions | dict[str, Any] | None = None,
    ) -> None:
        """Hover over an element."""
        self._run(self._async_client.hover(selector, options))

    def scroll(
        self,
        selector: BAPSelector | dict[str, Any] | None = None,
        options: ScrollOptions | dict[str, Any] | None = None,
    ) -> None:
        """Scroll the page or an element."""
        self._run(self._async_client.scroll(selector, options))

    def select(
        self,
        selector: BAPSelector | dict[str, Any],
        values: str | list[str],
        options: ActionOptions | dict[str, Any] | None = None,
    ) -> None:
        """Select option(s) from a dropdown."""
        self._run(self._async_client.select(selector, values, options))

    def check(
        self,
        selector: BAPSelector | dict[str, Any],
        options: ActionOptions | dict[str, Any] | None = None,
    ) -> None:
        """Check a checkbox or radio button."""
        self._run(self._async_client.check(selector, options))

    def uncheck(
        self,
        selector: BAPSelector | dict[str, Any],
        options: ActionOptions | dict[str, Any] | None = None,
    ) -> None:
        """Uncheck a checkbox."""
        self._run(self._async_client.uncheck(selector, options))

    # =========================================================================
    # Observation Methods
    # =========================================================================

    def screenshot(
        self,
        options: ScreenshotOptions | dict[str, Any] | None = None,
    ) -> ObserveScreenshotResult:
        """Capture a screenshot."""
        return self._run(self._async_client.screenshot(options))

    def accessibility(
        self,
        options: dict[str, Any] | None = None,
    ) -> ObserveAccessibilityResult:
        """Get the accessibility tree."""
        return self._run(self._async_client.accessibility(options))

    def dom(
        self,
        options: dict[str, Any] | None = None,
    ) -> ObserveDOMResult:
        """Get DOM snapshot."""
        return self._run(self._async_client.dom(options))

    def element(
        self,
        selector: BAPSelector | dict[str, Any],
        properties: list[str],
    ) -> ObserveElementResult:
        """Query element properties."""
        return self._run(self._async_client.element(selector, properties))

    def pdf(
        self,
        options: dict[str, Any] | None = None,
    ) -> ObservePDFResult:
        """Generate PDF of the page."""
        return self._run(self._async_client.pdf(options))

    def content(
        self,
        format: ContentFormat | str = "text",
    ) -> ObserveContentResult:
        """Get page content in specified format."""
        return self._run(self._async_client.content(format))

    def aria_snapshot(
        self,
        selector: BAPSelector | dict[str, Any] | None = None,
        options: dict[str, Any] | None = None,
    ) -> ObserveAriaSnapshotResult:
        """Get ARIA snapshot."""
        return self._run(self._async_client.aria_snapshot(selector, options))

    # =========================================================================
    # Storage Methods
    # =========================================================================

    def get_storage_state(self) -> StorageState:
        """Get current storage state."""
        return self._run(self._async_client.get_storage_state())

    def set_storage_state(self, state: StorageState | dict[str, Any]) -> None:
        """Set storage state."""
        self._run(self._async_client.set_storage_state(state))

    def get_cookies(self, urls: list[str] | None = None) -> list[Cookie]:
        """Get cookies."""
        return self._run(self._async_client.get_cookies(urls))

    def set_cookies(self, cookies: list[Cookie | dict[str, Any]]) -> None:
        """Set cookies."""
        self._run(self._async_client.set_cookies(cookies))

    def clear_cookies(self, urls: list[str] | None = None) -> None:
        """Clear cookies."""
        self._run(self._async_client.clear_cookies(urls))

    # =========================================================================
    # Emulation Methods
    # =========================================================================

    def set_viewport(
        self,
        width: int,
        height: int,
        *,
        device_scale_factor: float | None = None,
        is_mobile: bool | None = None,
        has_touch: bool | None = None,
    ) -> None:
        """Set viewport size."""
        self._run(
            self._async_client.set_viewport(
                width,
                height,
                device_scale_factor=device_scale_factor,
                is_mobile=is_mobile,
                has_touch=has_touch,
            )
        )

    def set_user_agent(self, user_agent: str, platform: str | None = None) -> None:
        """Set user agent."""
        self._run(self._async_client.set_user_agent(user_agent, platform))

    def set_geolocation(
        self,
        latitude: float,
        longitude: float,
        accuracy: float | None = None,
    ) -> None:
        """Set geolocation."""
        self._run(self._async_client.set_geolocation(latitude, longitude, accuracy))

    def set_offline(self, offline: bool) -> None:
        """Set offline mode."""
        self._run(self._async_client.set_offline(offline))

    # =========================================================================
    # Context Methods
    # =========================================================================

    def create_context(
        self,
        context_id: str | None = None,
        options: dict[str, Any] | None = None,
    ) -> ContextCreateResult:
        """Create a new browser context."""
        return self._run(self._async_client.create_context(context_id, options))

    def list_contexts(self) -> ContextListResult:
        """List all browser contexts."""
        return self._run(self._async_client.list_contexts())

    def destroy_context(self, context_id: str) -> ContextDestroyResult:
        """Destroy a browser context."""
        return self._run(self._async_client.destroy_context(context_id))

    # =========================================================================
    # Frame Methods
    # =========================================================================

    def list_frames(self, page_id: str | None = None) -> FrameListResult:
        """List all frames in a page."""
        return self._run(self._async_client.list_frames(page_id))

    def switch_frame(
        self,
        frame_id: str | None = None,
        selector: BAPSelector | dict[str, Any] | None = None,
        url: str | None = None,
        page_id: str | None = None,
    ) -> FrameSwitchResult:
        """Switch frame context."""
        return self._run(
            self._async_client.switch_frame(frame_id=frame_id, selector=selector, url=url, page_id=page_id)
        )

    def main_frame(self, page_id: str | None = None) -> FrameMainResult:
        """Return to main frame."""
        return self._run(self._async_client.main_frame(page_id))

    # =========================================================================
    # Agent Methods
    # =========================================================================

    def act(
        self,
        steps: list[ExecutionStep | dict[str, Any]],
        *,
        page_id: str | None = None,
        stop_on_first_error: bool | None = None,
        continue_on_condition_fail: bool | None = None,
        timeout: int | None = None,
    ) -> AgentActResult:
        """Execute multi-step action sequences atomically."""
        return self._run(
            self._async_client.act(
                steps,
                page_id=page_id,
                stop_on_first_error=stop_on_first_error,
                continue_on_condition_fail=continue_on_condition_fail,
                timeout=timeout,
            )
        )

    def observe(
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
        """Get AI-optimized page observations."""
        return self._run(
            self._async_client.observe(
                page_id=page_id,
                include_accessibility=include_accessibility,
                include_screenshot=include_screenshot,
                include_interactive_elements=include_interactive_elements,
                include_metadata=include_metadata,
                max_elements=max_elements,
                filter_roles=filter_roles,
                include_bounds=include_bounds,
                stable_refs=stable_refs,
                refresh_refs=refresh_refs,
                include_ref_history=include_ref_history,
                annotate_screenshot=annotate_screenshot,
            )
        )

    def extract(
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
        """Extract structured data from the page."""
        return self._run(
            self._async_client.extract(
                instruction,
                schema,
                page_id=page_id,
                mode=mode,
                selector=selector,
                include_source_refs=include_source_refs,
                timeout=timeout,
            )
        )

    # =========================================================================
    # Stream Methods
    # =========================================================================

    def cancel_stream(self, stream_id: str) -> StreamCancelResult:
        """Cancel an in-progress stream."""
        return self._run(self._async_client.cancel_stream(stream_id))

    # =========================================================================
    # Approval Methods
    # =========================================================================

    def respond_to_approval(
        self,
        request_id: str,
        decision: Literal["approve", "deny", "approve-once", "approve-session"],
        reason: str | None = None,
    ) -> ApprovalRespondResult:
        """Respond to an approval request."""
        return self._run(self._async_client.respond_to_approval(request_id, decision, reason))

    # =========================================================================
    # Static Helpers
    # =========================================================================

    @staticmethod
    def step(
        action: str,
        params: dict[str, Any],
        **kwargs: Any,
    ) -> ExecutionStep:
        """Helper to create an execution step for agent/act."""
        return BAPClient.step(action, params, **kwargs)
