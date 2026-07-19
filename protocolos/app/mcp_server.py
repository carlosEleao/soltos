"""Servidor MCP para o agente operar protocolos de Estância Velha."""

from __future__ import annotations

import json
from typing import Any

from mcp.server.fastmcp import FastMCP

from . import db
from .scraper import consultar_protocolo, portal_links, sync_meus_protocolos

mcp = FastMCP(
    "protocolos-estancia-velha",
    instructions=(
        "Ferramentas para cadastrar, listar, consultar e sincronizar protocolos "
        "da Prefeitura de Estância Velha (RS) via base local + Portal Betha. "
        "Use listar_protocolos antes de atualizar/excluir. "
        "Para sync autenticada sem sessão salva, headed=true exige interface gráfica."
    ),
)


def _json(data: Any) -> str:
    return json.dumps(data, ensure_ascii=False, indent=2, default=str)


@mcp.tool()
async def listar_protocolos(busca: str | None = None) -> str:
    """Lista protocolos salvos localmente. Opcionalmente filtra por texto (número, assunto, status, notas)."""
    await db.init_db()
    items = await db.list_protocolos(busca)
    return _json({"count": len(items), "protocolos": items})


@mcp.tool()
async def obter_protocolo(protocolo_id: int) -> str:
    """Obtém um protocolo pelo id local."""
    await db.init_db()
    item = await db.get_protocolo(protocolo_id)
    if not item:
        return _json({"ok": False, "error": "Protocolo não encontrado", "id": protocolo_id})
    return _json({"ok": True, "protocolo": item})


@mcp.tool()
async def cadastrar_protocolo(
    numero: str,
    ano: int,
    digito: str | None = None,
    assunto: str | None = None,
    secretaria: str | None = None,
    status: str | None = None,
    situacao: str | None = None,
    requerente_cpf: str | None = None,
    numero_unico: str | None = None,
    url_consulta: str | None = None,
    notas: str | None = None,
) -> str:
    """Cadastra um protocolo na base local."""
    await db.init_db()
    try:
        item = await db.create_protocolo(
            {
                "numero": numero,
                "ano": ano,
                "digito": digito,
                "assunto": assunto,
                "secretaria": secretaria,
                "status": status,
                "situacao": situacao,
                "requerente_cpf": requerente_cpf,
                "numero_unico": numero_unico,
                "url_consulta": url_consulta,
                "origem": "mcp",
                "notas": notas,
            }
        )
        return _json({"ok": True, "protocolo": item})
    except Exception as exc:
        return _json({"ok": False, "error": str(exc)})


@mcp.tool()
async def atualizar_protocolo(
    protocolo_id: int,
    numero: str | None = None,
    ano: int | None = None,
    digito: str | None = None,
    assunto: str | None = None,
    secretaria: str | None = None,
    status: str | None = None,
    situacao: str | None = None,
    requerente_cpf: str | None = None,
    numero_unico: str | None = None,
    url_consulta: str | None = None,
    notas: str | None = None,
) -> str:
    """Atualiza campos de um protocolo existente (somente os informados)."""
    await db.init_db()
    payload = {
        k: v
        for k, v in {
            "numero": numero,
            "ano": ano,
            "digito": digito,
            "assunto": assunto,
            "secretaria": secretaria,
            "status": status,
            "situacao": situacao,
            "requerente_cpf": requerente_cpf,
            "numero_unico": numero_unico,
            "url_consulta": url_consulta,
            "notas": notas,
        }.items()
        if v is not None
    }
    item = await db.update_protocolo(protocolo_id, payload)
    if not item:
        return _json({"ok": False, "error": "Protocolo não encontrado", "id": protocolo_id})
    return _json({"ok": True, "protocolo": item})


@mcp.tool()
async def excluir_protocolo(protocolo_id: int) -> str:
    """Remove um protocolo da base local."""
    await db.init_db()
    ok = await db.delete_protocolo(protocolo_id)
    return _json({"ok": ok, "id": protocolo_id})


@mcp.tool()
async def sincronizar_protocolos(
    headed: bool = False,
    wait_login_seconds: int = 120,
) -> str:
    """
    Sincroniza protocolos do Portal Betha (Protocolo Cloud) para a base local.
    Na primeira autenticação use headed=true com interface gráfica para login.
    """
    await db.init_db()
    result = await sync_meus_protocolos(
        headed=headed,
        wait_login_seconds=wait_login_seconds,
    )
    saved = []
    if result.ok:
        for item in result.items:
            saved.append(await db.upsert_from_sync(item))
    return _json(
        {
            "ok": result.ok,
            "message": result.message,
            "needs_login": result.needs_login,
            "captured_from": result.captured_from,
            "count": len(saved),
            "protocolos": saved,
        }
    )


@mcp.tool()
async def consultar_protocolo_portal(
    numero: str,
    ano: int,
    cpf_cnpj: str,
    digito: str | None = None,
    headed: bool = False,
    salvar: bool = True,
) -> str:
    """
    Consulta um protocolo no portal Betha via automação.
    Se houver captcha/bloqueio, retorna needs_manual e a URL oficial.
    """
    await db.init_db()
    result = await consultar_protocolo(
        numero=numero,
        ano=ano,
        cpf_cnpj=cpf_cnpj,
        digito=digito,
        headed=headed,
    )
    saved = None
    if result.ok and salvar and result.data.get("numero"):
        saved = await db.upsert_from_sync({**result.data, "origem": "consulta"})
    return _json(
        {
            "ok": result.ok,
            "message": result.message,
            "needs_manual": result.needs_manual,
            "url": result.url,
            "data": result.data,
            "saved": saved,
        }
    )


@mcp.tool()
async def links_portal() -> str:
    """Retorna links oficiais (abertura, consulta, dashboard cidadão, prefeitura)."""
    return _json(portal_links())


@mcp.resource("protocolos://lista")
async def resource_lista() -> str:
    """Resource com a lista atual de protocolos locais."""
    await db.init_db()
    items = await db.list_protocolos()
    return _json({"count": len(items), "protocolos": items})


@mcp.resource("protocolos://links")
async def resource_links() -> str:
    """Resource com links oficiais do portal."""
    return _json(portal_links())


def main() -> None:
    # stdio — transporte padrão para Cursor Desktop / agentes locais
    mcp.run(transport="stdio")


if __name__ == "__main__":
    main()
