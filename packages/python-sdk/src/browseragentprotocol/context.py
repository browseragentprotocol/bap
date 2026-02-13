"""
Context managers for BAP client lifecycle management.

Provides async context managers for managing BAP client connections,
following patterns from MCP Python SDK.
"""

from contextlib import asynccontextmanager
from typing import AsyncIterator, Literal

from browseragentprotocol.client import BAPClient


@asynccontextmanager
async def bap_client(
    url: str,
    *,
    token: str | None = None,
    name: str = "bap-client-python",
    version: str = "0.2.0",
    timeout: float = 30.0,
    events: list[str] | None = None,
    browser: Literal["chromium", "firefox", "webkit"] | None = None,
    headless: bool | None = None,
) -> AsyncIterator[BAPClient]:
    """
    Async context manager for BAP client connections.

    Creates a connected BAP client and optionally launches a browser.
    The client and browser are automatically cleaned up when the context exits.

    Args:
        url: WebSocket URL of the BAP server (e.g., "ws://localhost:9222")
        token: Authentication token for server connection
        name: Client name for identification
        version: Client version
        timeout: Default timeout for operations (seconds)
        events: Events to subscribe to (default: page, console, network, dialog)
        browser: Browser type to launch (chromium, firefox, webkit). If provided,
                 launches the browser automatically.
        headless: Run browser in headless mode (only used if browser is specified)

    Yields:
        Connected BAPClient instance

    Example:
        ```python
        from browseragentprotocol.context import bap_client

        async with bap_client("ws://localhost:9222", browser="chromium") as client:
            await client.create_page(url="https://example.com")
            screenshot = await client.screenshot()
        ```
    """
    client = BAPClient(
        url,
        token=token,
        name=name,
        version=version,
        timeout=timeout,
        events=events,
    )

    try:
        await client.connect()

        if browser is not None:
            await client.launch(browser=browser, headless=headless)

        yield client
    finally:
        await client.close()


@asynccontextmanager
async def bap_session(
    url: str,
    *,
    token: str | None = None,
    browser: Literal["chromium", "firefox", "webkit"] = "chromium",
    headless: bool = True,
    start_url: str | None = None,
    timeout: float = 30.0,
) -> AsyncIterator[BAPClient]:
    """
    High-level context manager for a complete browser session.

    Creates a connected client, launches a browser, and optionally navigates
    to a starting URL. Everything is cleaned up automatically.

    Args:
        url: WebSocket URL of the BAP server
        token: Authentication token
        browser: Browser type (default: chromium)
        headless: Run in headless mode (default: True)
        start_url: URL to navigate to after launching
        timeout: Default timeout for operations

    Yields:
        Connected BAPClient with browser launched and page ready

    Example:
        ```python
        from browseragentprotocol.context import bap_session

        async with bap_session(
            "ws://localhost:9222",
            start_url="https://example.com"
        ) as client:
            await client.click(role("button", "Accept"))
            content = await client.content()
        ```
    """
    async with bap_client(
        url,
        token=token,
        browser=browser,
        headless=headless,
        timeout=timeout,
    ) as client:
        if start_url is not None:
            await client.create_page(url=start_url)
        yield client
