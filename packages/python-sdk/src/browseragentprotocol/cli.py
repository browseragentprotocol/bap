"""
Command-line interface for BAP Python SDK.

Provides utilities for connecting to BAP servers and testing connectivity.
"""

import argparse
import asyncio
import json
import sys
from typing import Any

from browseragentprotocol import __version__, BAPClient


def main() -> None:
    """Main entry point for the BAP CLI."""
    parser = argparse.ArgumentParser(
        prog="bap",
        description="Browser Agent Protocol (BAP) Python SDK CLI",
    )
    parser.add_argument(
        "--version",
        action="version",
        version=f"browseragentprotocol {__version__}",
    )

    subparsers = parser.add_subparsers(dest="command", help="Available commands")

    # Connect command
    connect_parser = subparsers.add_parser(
        "connect",
        help="Test connection to a BAP server",
    )
    connect_parser.add_argument(
        "url",
        help="WebSocket URL of the BAP server (e.g., ws://localhost:9222)",
    )
    connect_parser.add_argument(
        "--token",
        help="Authentication token",
    )
    connect_parser.add_argument(
        "--timeout",
        type=float,
        default=10.0,
        help="Connection timeout in seconds (default: 10)",
    )

    # Info command
    info_parser = subparsers.add_parser(
        "info",
        help="Get server info and capabilities",
    )
    info_parser.add_argument(
        "url",
        help="WebSocket URL of the BAP server",
    )
    info_parser.add_argument(
        "--token",
        help="Authentication token",
    )
    info_parser.add_argument(
        "--json",
        action="store_true",
        dest="json_output",
        help="Output as JSON",
    )

    # Version command (just prints version)
    subparsers.add_parser(
        "version",
        help="Show version information",
    )

    args = parser.parse_args()

    if args.command is None:
        parser.print_help()
        sys.exit(0)

    if args.command == "version":
        print(f"browseragentprotocol {__version__}")
        sys.exit(0)

    if args.command == "connect":
        asyncio.run(connect_command(args.url, args.token, args.timeout))
    elif args.command == "info":
        asyncio.run(info_command(args.url, args.token, args.json_output))


async def connect_command(url: str, token: str | None, timeout: float) -> None:
    """Test connection to a BAP server."""
    print(f"Connecting to {url}...")

    try:
        client = BAPClient(url, token=token, timeout=timeout)
        result = await client.connect()
        print(f"Connected successfully!")
        print(f"  Protocol version: {result.protocol_version}")
        print(f"  Server: {result.server_info.name} v{result.server_info.version}")
        await client.close()
    except Exception as e:
        print(f"Connection failed: {e}", file=sys.stderr)
        sys.exit(1)


async def info_command(url: str, token: str | None, json_output: bool) -> None:
    """Get server info and capabilities."""
    try:
        client = BAPClient(url, token=token, timeout=10.0)
        result = await client.connect()

        if json_output:
            info: dict[str, Any] = {
                "protocolVersion": result.protocol_version,
                "serverInfo": {
                    "name": result.server_info.name,
                    "version": result.server_info.version,
                },
            }
            if result.capabilities:
                info["capabilities"] = result.capabilities.model_dump(
                    by_alias=True, exclude_none=True
                )
            print(json.dumps(info, indent=2))
        else:
            print(f"BAP Server Information")
            print(f"=" * 40)
            print(f"Protocol Version: {result.protocol_version}")
            print(f"Server Name:      {result.server_info.name}")
            print(f"Server Version:   {result.server_info.version}")
            if result.capabilities:
                print(f"\nCapabilities:")
                caps = result.capabilities.model_dump(by_alias=True, exclude_none=True)
                for key, value in caps.items():
                    print(f"  {key}: {value}")

        await client.close()
    except Exception as e:
        if json_output:
            print(json.dumps({"error": str(e)}), file=sys.stderr)
        else:
            print(f"Error: {e}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
