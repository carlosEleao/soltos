from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import aiosqlite

DB_PATH = Path(__file__).resolve().parent.parent / "data" / "protocolos.db"


def _ensure_dir() -> None:
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)


async def init_db() -> None:
    _ensure_dir()
    async with aiosqlite.connect(DB_PATH) as db:
        await db.executescript(
            """
            CREATE TABLE IF NOT EXISTS protocolos (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                numero TEXT NOT NULL,
                ano INTEGER NOT NULL,
                digito TEXT,
                assunto TEXT,
                secretaria TEXT,
                status TEXT,
                situacao TEXT,
                requerente_cpf TEXT,
                numero_unico TEXT,
                url_consulta TEXT,
                trams_json TEXT,
                origem TEXT DEFAULT 'manual',
                notas TEXT,
                criado_em TEXT DEFAULT (datetime('now')),
                atualizado_em TEXT DEFAULT (datetime('now')),
                sincronizado_em TEXT,
                UNIQUE(numero, ano, digito)
            );

            CREATE TABLE IF NOT EXISTS config (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL
            );
            """
        )
        await db.commit()


def _row_to_dict(row: aiosqlite.Row) -> dict[str, Any]:
    data = dict(row)
    raw = data.pop("trams_json", None)
    data["tramites"] = json.loads(raw) if raw else []
    return data


async def list_protocolos(busca: str | None = None) -> list[dict[str, Any]]:
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        if busca:
            like = f"%{busca.strip()}%"
            cursor = await db.execute(
                """
                SELECT * FROM protocolos
                WHERE numero LIKE ?
                   OR CAST(ano AS TEXT) LIKE ?
                   OR IFNULL(assunto, '') LIKE ?
                   OR IFNULL(status, '') LIKE ?
                   OR IFNULL(secretaria, '') LIKE ?
                   OR IFNULL(notas, '') LIKE ?
                ORDER BY ano DESC, numero DESC
                """,
                (like, like, like, like, like, like),
            )
        else:
            cursor = await db.execute(
                "SELECT * FROM protocolos ORDER BY ano DESC, numero DESC"
            )
        rows = await cursor.fetchall()
        return [_row_to_dict(r) for r in rows]


async def get_protocolo(protocolo_id: int) -> dict[str, Any] | None:
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        cursor = await db.execute(
            "SELECT * FROM protocolos WHERE id = ?", (protocolo_id,)
        )
        row = await cursor.fetchone()
        return _row_to_dict(row) if row else None


async def create_protocolo(payload: dict[str, Any]) -> dict[str, Any]:
    tramites = payload.get("tramites") or []
    async with aiosqlite.connect(DB_PATH) as db:
        cursor = await db.execute(
            """
            INSERT INTO protocolos (
                numero, ano, digito, assunto, secretaria, status, situacao,
                requerente_cpf, numero_unico, url_consulta, trams_json,
                origem, notas
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (
                str(payload["numero"]).strip(),
                int(payload["ano"]),
                (payload.get("digito") or "").strip() or None,
                payload.get("assunto"),
                payload.get("secretaria"),
                payload.get("status"),
                payload.get("situacao"),
                payload.get("requerente_cpf"),
                payload.get("numero_unico"),
                payload.get("url_consulta"),
                json.dumps(tramites, ensure_ascii=False),
                payload.get("origem") or "manual",
                payload.get("notas"),
            ),
        )
        await db.commit()
        protocolo_id = cursor.lastrowid
    return await get_protocolo(protocolo_id)  # type: ignore[arg-type]


async def update_protocolo(protocolo_id: int, payload: dict[str, Any]) -> dict[str, Any] | None:
    current = await get_protocolo(protocolo_id)
    if not current:
        return None

    fields = [
        "numero",
        "ano",
        "digito",
        "assunto",
        "secretaria",
        "status",
        "situacao",
        "requerente_cpf",
        "numero_unico",
        "url_consulta",
        "origem",
        "notas",
    ]
    values: list[Any] = []
    sets: list[str] = []
    for field in fields:
        if field in payload:
            sets.append(f"{field} = ?")
            values.append(payload[field])

    if "tramites" in payload:
        sets.append("trams_json = ?")
        values.append(json.dumps(payload["tramites"] or [], ensure_ascii=False))

    if not sets:
        return current

    sets.append("atualizado_em = datetime('now')")
    values.append(protocolo_id)

    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute(
            f"UPDATE protocolos SET {', '.join(sets)} WHERE id = ?",
            values,
        )
        await db.commit()
    return await get_protocolo(protocolo_id)


async def delete_protocolo(protocolo_id: int) -> bool:
    async with aiosqlite.connect(DB_PATH) as db:
        cursor = await db.execute(
            "DELETE FROM protocolos WHERE id = ?", (protocolo_id,)
        )
        await db.commit()
        return cursor.rowcount > 0


async def upsert_from_sync(item: dict[str, Any]) -> dict[str, Any]:
    """Insere ou atualiza protocolo vindo da automação/sync."""
    numero = str(item["numero"]).strip()
    ano = int(item["ano"])
    digito = (item.get("digito") or "").strip() or None

    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        cursor = await db.execute(
            """
            SELECT id FROM protocolos
            WHERE numero = ? AND ano = ? AND IFNULL(digito, '') = IFNULL(?, '')
            """,
            (numero, ano, digito),
        )
        existing = await cursor.fetchone()

    payload = {
        "numero": numero,
        "ano": ano,
        "digito": digito,
        "assunto": item.get("assunto"),
        "secretaria": item.get("secretaria"),
        "status": item.get("status"),
        "situacao": item.get("situacao"),
        "requerente_cpf": item.get("requerente_cpf"),
        "numero_unico": item.get("numero_unico"),
        "url_consulta": item.get("url_consulta"),
        "tramites": item.get("tramites") or [],
        "origem": item.get("origem") or "sync",
        "notas": item.get("notas"),
    }

    if existing:
        updated = await update_protocolo(int(existing["id"]), payload)
        async with aiosqlite.connect(DB_PATH) as db:
            await db.execute(
                "UPDATE protocolos SET sincronizado_em = datetime('now') WHERE id = ?",
                (existing["id"],),
            )
            await db.commit()
        return updated  # type: ignore[return-value]

    created = await create_protocolo(payload)
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute(
            "UPDATE protocolos SET sincronizado_em = datetime('now') WHERE id = ?",
            (created["id"],),
        )
        await db.commit()
    return await get_protocolo(created["id"])  # type: ignore[arg-type]


async def get_config(key: str, default: str | None = None) -> str | None:
    async with aiosqlite.connect(DB_PATH) as db:
        db.row_factory = aiosqlite.Row
        cursor = await db.execute("SELECT value FROM config WHERE key = ?", (key,))
        row = await cursor.fetchone()
        return row["value"] if row else default


async def set_config(key: str, value: str) -> None:
    async with aiosqlite.connect(DB_PATH) as db:
        await db.execute(
            """
            INSERT INTO config(key, value) VALUES(?, ?)
            ON CONFLICT(key) DO UPDATE SET value = excluded.value
            """,
            (key, value),
        )
        await db.commit()
