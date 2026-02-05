"""
SSE (Server-Sent Events) transport for BAP communication.

Provides an alternative transport using HTTP SSE for environments
where WebSockets are not available, following MCP SDK patterns.
"""

import asyncio
import json
import logging
from typing import Any, Callable

import httpx
from httpx_sse import aconnect_sse

logger = logging.getLogger(__name__)


class SSETransport:
    """
    SSE-based transport implementation.

    Uses HTTP POST for sending messages and SSE for receiving server events.
    This is useful in environments where WebSocket connections are not supported.
    """

    def __init__(
        self,
        base_url: str,
        *,
        headers: dict[str, str] | None = None,
        timeout: float = 30.0,
    ):
        """
        Initialize the SSE transport.

        Args:
            base_url: Base URL of the BAP server HTTP endpoint
                      (e.g., "http://localhost:9222")
            headers: Additional HTTP headers (e.g., for authentication)
            timeout: Request timeout in seconds
        """
        self.base_url = base_url.rstrip("/")
        self.headers = headers or {}
        self.timeout = timeout

        self._client: httpx.AsyncClient | None = None
        self._sse_task: asyncio.Task[None] | None = None
        self._is_closing = False

        # Callbacks
        self.on_message: Callable[[str], None] | None = None
        self.on_close: Callable[[], None] | None = None
        self.on_error: Callable[[Exception], None] | None = None

    @property
    def is_connected(self) -> bool:
        """Check if the transport is connected."""
        return self._client is not None and not self._is_closing

    async def connect(self) -> None:
        """Connect to the SSE endpoint."""
        self._is_closing = False

        self._client = httpx.AsyncClient(
            base_url=self.base_url,
            headers=self.headers,
            timeout=self.timeout,
        )

        # Start listening for SSE events
        self._sse_task = asyncio.create_task(self._sse_loop())

    async def _sse_loop(self) -> None:
        """Listen for SSE events from the server."""
        if self._client is None:
            return

        try:
            async with aconnect_sse(
                self._client,
                "GET",
                "/events",
            ) as event_source:
                async for sse in event_source.aiter_sse():
                    if self._is_closing:
                        break

                    if sse.event == "message" and sse.data:
                        if self.on_message:
                            self.on_message(sse.data)
                    elif sse.event == "error":
                        if self.on_error:
                            self.on_error(Exception(f"SSE error: {sse.data}"))
        except asyncio.CancelledError:
            pass
        except Exception as e:
            if self.on_error and not self._is_closing:
                self.on_error(e)
        finally:
            if self.on_close and not self._is_closing:
                self.on_close()

    async def send(self, message: str) -> None:
        """
        Send a message to the server via HTTP POST.

        Args:
            message: JSON string to send

        Raises:
            Exception: If not connected or request fails
        """
        if self._client is None:
            raise Exception("SSE transport not connected")

        try:
            response = await self._client.post(
                "/message",
                content=message,
                headers={"Content-Type": "application/json"},
            )
            response.raise_for_status()
        except httpx.HTTPStatusError as e:
            raise Exception(f"HTTP error: {e.response.status_code}") from e
        except Exception as e:
            raise Exception(f"Failed to send message: {e}") from e

    async def send_json(self, data: dict[str, Any]) -> None:
        """
        Send a JSON message to the server.

        Args:
            data: Dictionary to send as JSON
        """
        await self.send(json.dumps(data))

    async def close(self) -> None:
        """Close the SSE connection."""
        self._is_closing = True

        if self._sse_task:
            self._sse_task.cancel()
            try:
                await self._sse_task
            except asyncio.CancelledError:
                pass
            self._sse_task = None

        if self._client:
            await self._client.aclose()
            self._client = None
