#!/usr/bin/env python3
"""Entry point do servidor MCP de protocolos."""

from __future__ import annotations

import argparse
import os


def main() -> None:
    parser = argparse.ArgumentParser(description="MCP Protocolos Estância Velha")
    parser.add_argument(
        "--transport",
        choices=("stdio", "streamable-http", "sse"),
        default=os.getenv("MCP_TRANSPORT", "stdio"),
        help="Transporte MCP (default: stdio)",
    )
    parser.add_argument(
        "--host",
        default=os.getenv("MCP_HOST", "127.0.0.1"),
        help="Host para HTTP/SSE",
    )
    parser.add_argument(
        "--port",
        type=int,
        default=int(os.getenv("MCP_PORT", "8790")),
        help="Porta para HTTP/SSE",
    )
    args = parser.parse_args()

    from app.mcp_server import mcp

    if args.transport == "stdio":
        mcp.run(transport="stdio")
        return

    # HTTP transports para agentes remotos
    mcp.settings.host = args.host
    mcp.settings.port = args.port
    mcp.run(transport=args.transport)


if __name__ == "__main__":
    main()
