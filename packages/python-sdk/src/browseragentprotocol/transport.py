"""
WebSocket transport layer for BAP communication.

Provides async WebSocket connection with auto-reconnection support.
"""

import asyncio
import json
import logging
from typing import Any, Callable

import aiohttp

logger = logging.getLogger(__name__)


class WebSocketTransport:
    """WebSocket-based transport implementation with optional auto-reconnection."""

    def __init__(
        self,
        url: str,
        *,
        max_reconnect_attempts: int = 5,
        reconnect_delay: float = 1.0,
        auto_reconnect: bool = False,
    ):
        """
        Initialize the WebSocket transport.

        Args:
            url: WebSocket server URL (e.g., "ws://localhost:9222")
            max_reconnect_attempts: Maximum number of reconnection attempts
            reconnect_delay: Initial delay between reconnection attempts (seconds)
            auto_reconnect: Enable automatic reconnection on disconnect
        """
        self.url = url
        self.max_reconnect_attempts = max_reconnect_attempts
        self.reconnect_delay = reconnect_delay
        self.auto_reconnect = auto_reconnect

        self._session: aiohttp.ClientSession | None = None
        self._ws: aiohttp.ClientWebSocketResponse | None = None
        self._reconnect_attempts = 0
        self._is_closing = False
        self._is_reconnecting = False
        self._receive_task: asyncio.Task[None] | None = None

        # Callbacks
        self.on_message: Callable[[str], None] | None = None
        self.on_close: Callable[[], None] | None = None
        self.on_error: Callable[[Exception], None] | None = None
        self.on_reconnecting: Callable[[int, int], None] | None = None
        self.on_reconnected: Callable[[], None] | None = None

    @property
    def is_connected(self) -> bool:
        """Check if the transport is connected."""
        return self._ws is not None and not self._ws.closed

    async def connect(self) -> None:
        """Connect to the WebSocket server."""
        self._is_closing = False

        if self._session is None:
            self._session = aiohttp.ClientSession()

        try:
            self._ws = await self._session.ws_connect(self.url)
            self._reconnect_attempts = 0

            # Start the receive loop
            self._receive_task = asyncio.create_task(self._receive_loop())

        except Exception as e:
            if self.on_error:
                self.on_error(e)
            raise

    async def _receive_loop(self) -> None:
        """Receive messages from the WebSocket."""
        if self._ws is None:
            return

        try:
            async for msg in self._ws:
                if msg.type == aiohttp.WSMsgType.TEXT:
                    if self.on_message:
                        self.on_message(msg.data)
                elif msg.type == aiohttp.WSMsgType.ERROR:
                    if self.on_error:
                        self.on_error(
                            Exception(f"WebSocket error: {self._ws.exception()}")
                        )
                    break
                elif msg.type == aiohttp.WSMsgType.CLOSED:
                    break
        except asyncio.CancelledError:
            pass
        except Exception as e:
            if self.on_error:
                self.on_error(e)
        finally:
            if self.auto_reconnect and not self._is_closing:
                try:
                    await self._attempt_reconnect()
                except Exception:
                    if self.on_close:
                        self.on_close()
            elif self.on_close:
                self.on_close()

    async def _attempt_reconnect(self) -> None:
        """Attempt to reconnect with exponential backoff."""
        if self._is_reconnecting:
            return
        self._is_reconnecting = True

        try:
            while self._reconnect_attempts < self.max_reconnect_attempts:
                if self._is_closing:
                    break

                self._reconnect_attempts += 1
                delay = self.reconnect_delay * (2 ** (self._reconnect_attempts - 1))

                if self.on_reconnecting:
                    self.on_reconnecting(
                        self._reconnect_attempts, self.max_reconnect_attempts
                    )

                await asyncio.sleep(delay)

                try:
                    await self.connect()
                    if self.on_reconnected:
                        self.on_reconnected()
                    return
                except Exception:
                    continue

            raise Exception(
                f"Failed to reconnect after {self.max_reconnect_attempts} attempts"
            )
        finally:
            self._is_reconnecting = False

    async def send(self, message: str) -> None:
        """
        Send a message to the server.

        Args:
            message: JSON string to send

        Raises:
            Exception: If not connected
        """
        if self._ws is None or self._ws.closed:
            raise Exception("WebSocket not connected")
        await self._ws.send_str(message)

    async def send_json(self, data: dict[str, Any]) -> None:
        """
        Send a JSON message to the server.

        Args:
            data: Dictionary to send as JSON
        """
        await self.send(json.dumps(data))

    async def close(self) -> None:
        """Close the WebSocket connection."""
        self._is_closing = True

        if self._receive_task:
            self._receive_task.cancel()
            try:
                await self._receive_task
            except asyncio.CancelledError:
                pass
            self._receive_task = None

        if self._ws:
            await self._ws.close()
            self._ws = None

        if self._session:
            await self._session.close()
            self._session = None

        self._reconnect_attempts = 0
