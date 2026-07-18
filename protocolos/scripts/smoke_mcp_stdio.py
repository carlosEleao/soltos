#!/usr/bin/env python3
"""Smoke test do servidor MCP via transporte in-memory."""

from __future__ import annotations

import asyncio
import json

from mcp.shared.memory import create_connected_server_and_client_session

from app.mcp_server import mcp


async def main() -> None:
    async with create_connected_server_and_client_session(mcp) as session:
        tools = await session.list_tools()
        names = [t.name for t in tools.tools]
        print("TOOLS", names)
        assert "listar_protocolos" in names
        assert "cadastrar_protocolo" in names
        assert "sincronizar_protocolos" in names

        result = await session.call_tool(
            "cadastrar_protocolo",
            {
                "numero": "888",
                "ano": 2026,
                "assunto": "smoke mcp session",
                "status": "teste",
            },
        )
        text = result.content[0].text  # type: ignore[union-attr]
        payload = json.loads(text)
        assert payload["ok"], payload
        pid = payload["protocolo"]["id"]
        print("CREATED", pid)

        listed = await session.call_tool("listar_protocolos", {"busca": "888"})
        listed_payload = json.loads(listed.content[0].text)  # type: ignore[union-attr]
        assert listed_payload["count"] >= 1

        await session.call_tool("excluir_protocolo", {"protocolo_id": pid})
        print("OK")


if __name__ == "__main__":
    asyncio.run(main())
