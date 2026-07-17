from __future__ import annotations

from pathlib import Path
from typing import Any

from fastapi import FastAPI, HTTPException, Query
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from . import db
from .scraper import consultar_protocolo, portal_links, sync_meus_protocolos

STATIC_DIR = Path(__file__).resolve().parent.parent / "static"

app = FastAPI(
    title="Protocolos Estância Velha",
    description="Cadastro/listagem local com automação do Portal Betha",
    version="0.1.0",
)


class ProtocoloIn(BaseModel):
    numero: str
    ano: int = Field(..., ge=2000, le=2100)
    digito: str | None = None
    assunto: str | None = None
    secretaria: str | None = None
    status: str | None = None
    situacao: str | None = None
    requerente_cpf: str | None = None
    numero_unico: str | None = None
    url_consulta: str | None = None
    tramites: list[Any] = Field(default_factory=list)
    origem: str | None = "manual"
    notas: str | None = None


class ProtocoloUpdate(BaseModel):
    numero: str | None = None
    ano: int | None = Field(default=None, ge=2000, le=2100)
    digito: str | None = None
    assunto: str | None = None
    secretaria: str | None = None
    status: str | None = None
    situacao: str | None = None
    requerente_cpf: str | None = None
    numero_unico: str | None = None
    url_consulta: str | None = None
    tramites: list[Any] | None = None
    origem: str | None = None
    notas: str | None = None


class SyncRequest(BaseModel):
    headed: bool = False
    wait_login_seconds: int = 120


class ConsultaRequest(BaseModel):
    numero: str
    ano: int
    cpf_cnpj: str
    digito: str | None = None
    headed: bool = False
    salvar: bool = True


@app.on_event("startup")
async def startup() -> None:
    await db.init_db()


@app.get("/api/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/api/links")
async def links() -> dict[str, str]:
    return portal_links()


@app.get("/api/protocolos")
async def api_list(q: str | None = Query(default=None)) -> list[dict[str, Any]]:
    return await db.list_protocolos(q)


@app.get("/api/protocolos/{protocolo_id}")
async def api_get(protocolo_id: int) -> dict[str, Any]:
    item = await db.get_protocolo(protocolo_id)
    if not item:
        raise HTTPException(404, "Protocolo não encontrado")
    return item


@app.post("/api/protocolos", status_code=201)
async def api_create(body: ProtocoloIn) -> dict[str, Any]:
    try:
        return await db.create_protocolo(body.model_dump())
    except Exception as exc:
        raise HTTPException(400, f"Não foi possível salvar: {exc}") from exc


@app.patch("/api/protocolos/{protocolo_id}")
async def api_update(protocolo_id: int, body: ProtocoloUpdate) -> dict[str, Any]:
    data = {k: v for k, v in body.model_dump().items() if v is not None}
    item = await db.update_protocolo(protocolo_id, data)
    if not item:
        raise HTTPException(404, "Protocolo não encontrado")
    return item


@app.delete("/api/protocolos/{protocolo_id}")
async def api_delete(protocolo_id: int) -> dict[str, bool]:
    ok = await db.delete_protocolo(protocolo_id)
    if not ok:
        raise HTTPException(404, "Protocolo não encontrado")
    return {"ok": True}


@app.post("/api/sync")
async def api_sync(body: SyncRequest) -> dict[str, Any]:
    result = await sync_meus_protocolos(
        headed=body.headed,
        wait_login_seconds=body.wait_login_seconds,
    )
    saved = []
    if result.ok:
        for item in result.items:
            saved.append(await db.upsert_from_sync(item))
    return {
        "ok": result.ok,
        "message": result.message,
        "needs_login": result.needs_login,
        "captured_from": result.captured_from,
        "count": len(saved),
        "items": saved,
    }


@app.post("/api/consultar")
async def api_consultar(body: ConsultaRequest) -> dict[str, Any]:
    result = await consultar_protocolo(
        numero=body.numero,
        ano=body.ano,
        cpf_cnpj=body.cpf_cnpj,
        digito=body.digito,
        headed=body.headed,
    )
    saved = None
    if result.ok and body.salvar and result.data.get("numero"):
        saved = await db.upsert_from_sync({**result.data, "origem": "consulta"})
    return {
        "ok": result.ok,
        "message": result.message,
        "needs_manual": result.needs_manual,
        "url": result.url,
        "data": result.data,
        "saved": saved,
    }


@app.get("/")
async def index() -> FileResponse:
    return FileResponse(STATIC_DIR / "index.html")


app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")
