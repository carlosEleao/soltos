from __future__ import annotations

import asyncio
import json
import re
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from playwright.async_api import Browser, BrowserContext, Page, async_playwright

DATA_DIR = Path(__file__).resolve().parent.parent / "data"
PROFILE_DIR = DATA_DIR / "browser-profile"
STORAGE_STATE = DATA_DIR / "betha-storage.json"

PROTOCOLO_CLOUD = "https://protocolo.betha.cloud"
CIDADAO_DASHBOARD = f"{PROTOCOLO_CLOUD}/#/cidadao/dashboard"
CIDADAO_MEUS = f"{PROTOCOLO_CLOUD}/#/cidadao/meusprotocolos"
CONSULTA_EXTERNA = f"{PROTOCOLO_CLOUD}/#/consulta-externa"
ABERTURA = f"{PROTOCOLO_CLOUD}/#/cidadao/solicitacao-abertura"
API_CIDADAO = "https://api.protocolo.betha.cloud/protocolo/api/cidadao"

# Portal legado / Portal 24h (Cidadão Web) — atalho oficial da prefeitura
PORTAL_PREFEITURA = "https://estanciavelha.rs.gov.br"
ENTIDADE_NOME = "Estância Velha"


@dataclass
class SyncResult:
    ok: bool
    message: str
    items: list[dict[str, Any]] = field(default_factory=list)
    needs_login: bool = False
    captured_from: str | None = None


@dataclass
class ConsultaResult:
    ok: bool
    message: str
    data: dict[str, Any] = field(default_factory=dict)
    needs_manual: bool = False
    url: str | None = None


def _extract_protocolo_fields(raw: dict[str, Any]) -> dict[str, Any] | None:
    """Normaliza payloads variados da API/DOM Betha."""
    numero = (
        raw.get("numero")
        or raw.get("nroProcesso")
        or raw.get("numeroProcesso")
        or raw.get("processoNumero")
    )
    ano = raw.get("ano") or raw.get("anoProcesso") or raw.get("exercicio")
    if not numero and raw.get("numeroUnico"):
        # Formatos comuns: 123/2024-5 ou 000123/2024
        m = re.search(r"(\d+)\s*/\s*(\d{4})(?:\s*[-/]\s*(\w+))?", str(raw["numeroUnico"]))
        if m:
            numero, ano, digito = m.group(1), m.group(2), m.group(3)
            raw = {**raw, "numero": numero, "ano": ano, "digito": digito}

    if not numero or not ano:
        return None

    digito = raw.get("digito") or raw.get("dv") or raw.get("digitoVerificador")
    assunto = (
        raw.get("assunto")
        or raw.get("descricaoAssunto")
        or raw.get("natureza")
        or raw.get("nomeAssunto")
        or raw.get("descricao")
    )
    status = (
        raw.get("status")
        or raw.get("situacao")
        or raw.get("descricaoSituacao")
        or raw.get("situacaoDescricao")
    )
    secretaria = (
        raw.get("secretaria")
        or raw.get("organograma")
        or raw.get("setorAtual")
        or raw.get("localizacao")
    )
    if isinstance(secretaria, dict):
        secretaria = secretaria.get("nome") or secretaria.get("descricao")

    tramites = raw.get("tramites") or raw.get("andamentos") or raw.get("linhaDoTempo") or []
    if isinstance(tramites, dict):
        tramites = tramites.get("content") or tramites.get("items") or []

    numero_unico = raw.get("numeroUnico") or raw.get("nroUnico") or f"{numero}/{ano}"
    if digito:
        numero_unico = f"{numero}/{ano}-{digito}"

    return {
        "numero": str(numero).strip(),
        "ano": int(str(ano)[:4]),
        "digito": str(digito).strip() if digito else None,
        "assunto": assunto,
        "secretaria": secretaria if isinstance(secretaria, str) else None,
        "status": status if isinstance(status, str) else (str(status) if status else None),
        "situacao": raw.get("situacaoDescricao") or raw.get("situacao"),
        "requerente_cpf": raw.get("cpf") or raw.get("cpfCnpj") or raw.get("documento"),
        "numero_unico": str(numero_unico),
        "url_consulta": f"{CONSULTA_EXTERNA}/protocolo/{numero_unico}",
        "tramites": tramites if isinstance(tramites, list) else [],
        "origem": "sync",
    }


def _walk_collect(obj: Any, out: list[dict[str, Any]]) -> None:
    if isinstance(obj, dict):
        normalized = _extract_protocolo_fields(obj)
        if normalized:
            out.append(normalized)
        for value in obj.values():
            _walk_collect(value, out)
    elif isinstance(obj, list):
        for item in obj:
            _walk_collect(item, out)


async def _new_context(browser: Browser, headed_hint: bool = False) -> BrowserContext:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    kwargs: dict[str, Any] = {
        "viewport": {"width": 1360, "height": 900},
        "locale": "pt-BR",
        "user_agent": (
            "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 "
            "(KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"
        ),
    }
    if STORAGE_STATE.exists():
        kwargs["storage_state"] = str(STORAGE_STATE)
    return await browser.new_context(**kwargs)


async def _save_storage(context: BrowserContext) -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    await context.storage_state(path=str(STORAGE_STATE))


async def _page_needs_login(page: Page) -> bool:
    url = page.url.lower()
    content = ""
    try:
        content = (await page.content()).lower()
    except Exception:
        pass
    markers = [
        "central do usuário",
        "entrar com",
        "faça login",
        "criar conta",
        "authentication",
        "oauth",
        "authorize",
    ]
    if "login" in url or "auth" in url or "autorizacoes" in url:
        return True
    return any(m in content for m in markers) and "meus protocolos" not in content


async def sync_meus_protocolos(
    *,
    timeout_ms: int = 90_000,
    headed: bool = False,
    wait_login_seconds: int = 120,
) -> SyncResult:
    """
    Abre o Protocolo Betha Cloud, captura respostas da API do cidadão
    e/ou extrai cards da listagem após login.
    """
    captured: list[dict[str, Any]] = []
    api_hits = 0

    async with async_playwright() as p:
        browser = await p.chromium.launch(
            headless=not headed,
            args=["--disable-dev-shm-usage"],
        )
        context = await _new_context(browser)
        page = await context.new_page()

        async def on_response(response) -> None:
            nonlocal api_hits
            url = response.url
            if "api.protocolo.betha.cloud" not in url:
                return
            if not any(x in url for x in ("/cidadao/", "/processos", "/solicitacoes")):
                return
            try:
                if response.status != 200:
                    return
                ctype = response.headers.get("content-type", "")
                if "json" not in ctype:
                    return
                payload = await response.json()
                api_hits += 1
                found: list[dict[str, Any]] = []
                _walk_collect(payload, found)
                for item in found:
                    key = (item["numero"], item["ano"], item.get("digito"))
                    if not any(
                        (c["numero"], c["ano"], c.get("digito")) == key for c in captured
                    ):
                        captured.append(item)
            except Exception:
                return

        page.on("response", on_response)

        try:
            await page.goto(CIDADAO_DASHBOARD, wait_until="domcontentloaded", timeout=timeout_ms)
            await page.wait_for_timeout(2500)

            if await _page_needs_login(page):
                if not headed:
                    return SyncResult(
                        ok=False,
                        needs_login=True,
                        message=(
                            "Login Betha necessário. Rode com headed=true "
                            "(interface gráfica) uma vez para autenticar e salvar a sessão, "
                            f"ou abra {CIDADAO_DASHBOARD} no navegador, faça login e tente de novo "
                            "após copiar o storage (ver README)."
                        ),
                    )

                # Modo assistido: usuário loga manualmente na janela do Chromium.
                await page.goto(CIDADAO_DASHBOARD, wait_until="domcontentloaded")
                deadline = asyncio.get_event_loop().time() + wait_login_seconds
                while asyncio.get_event_loop().time() < deadline:
                    if not await _page_needs_login(page):
                        break
                    await page.wait_for_timeout(1500)
                else:
                    return SyncResult(
                        ok=False,
                        needs_login=True,
                        message="Tempo esgotado aguardando login na Betha.",
                    )
                await _save_storage(context)

            # Navega nas telas que disparam a listagem
            for url in (CIDADAO_DASHBOARD, CIDADAO_MEUS):
                await page.goto(url, wait_until="networkidle", timeout=timeout_ms)
                await page.wait_for_timeout(3000)

            # Fallback: tentar ler texto de cards na página
            if not captured:
                texts = await page.locator("body").inner_text()
                for m in re.finditer(
                    r"(\d{1,7})\s*/\s*(\d{4})(?:\s*[-/]\s*(\d{1,3}))?", texts
                ):
                    item = _extract_protocolo_fields(
                        {
                            "numero": m.group(1),
                            "ano": m.group(2),
                            "digito": m.group(3),
                            "assunto": "Importado da tela (sem detalhe da API)",
                            "status": "sincronizado",
                        }
                    )
                    if item:
                        key = (item["numero"], item["ano"], item.get("digito"))
                        if not any(
                            (c["numero"], c["ano"], c.get("digito")) == key for c in captured
                        ):
                            captured.append(item)

            await _save_storage(context)

            if not captured:
                return SyncResult(
                    ok=False,
                    message=(
                        "Login ok (ou sessão salva), mas nenhum protocolo foi capturado. "
                        "Confirme se sua conta Betha está vinculada ao CPF e à entidade "
                        f"{ENTIDADE_NOME}. Respostas de API vistas: {api_hits}."
                    ),
                    captured_from="empty",
                )

            return SyncResult(
                ok=True,
                message=f"{len(captured)} protocolo(s) capturado(s) via automação.",
                items=captured,
                captured_from="api" if api_hits else "dom",
            )
        except Exception as exc:
            return SyncResult(ok=False, message=f"Falha na automação: {exc}")
        finally:
            await context.close()
            await browser.close()


async def consultar_protocolo(
    *,
    numero: str,
    ano: int,
    cpf_cnpj: str,
    digito: str | None = None,
    headed: bool = False,
    timeout_ms: int = 60_000,
) -> ConsultaResult:
    """
    Tenta consulta externa no Protocolo Cloud.
    Se houver captcha/bloqueio, devolve URL para consulta manual.
    """
    numero_unico = f"{numero}/{ano}" + (f"-{digito}" if digito else "")
    url = f"{CONSULTA_EXTERNA}"

    async with async_playwright() as p:
        browser = await p.chromium.launch(
            headless=not headed,
            args=["--disable-dev-shm-usage"],
        )
        context = await _new_context(browser)
        page = await context.new_page()
        captured: dict[str, Any] = {}

        async def on_response(response) -> None:
            if "api.protocolo.betha.cloud" not in response.url:
                return
            try:
                if response.status != 200:
                    return
                if "json" not in response.headers.get("content-type", ""):
                    return
                payload = await response.json()
                found: list[dict[str, Any]] = []
                _walk_collect(payload, found)
                for item in found:
                    if str(item["numero"]) == str(numero) and int(item["ano"]) == int(ano):
                        captured.update(item)
                        captured["tramites"] = item.get("tramites") or captured.get("tramites")
            except Exception:
                return

        page.on("response", on_response)

        try:
            await page.goto(url, wait_until="domcontentloaded", timeout=timeout_ms)
            await page.wait_for_timeout(2000)

            # Preenche campos comuns (labels/placeholders variam)
            filled = False
            candidates = [
                ('input[placeholder*="protocolo" i]', numero),
                ('input[placeholder*="número" i]', numero),
                ('input[name*="numero" i]', numero),
                ('input[placeholder*="ano" i]', str(ano)),
                ('input[name*="ano" i]', str(ano)),
                ('input[placeholder*="CPF" i]', cpf_cnpj),
                ('input[placeholder*="CNPJ" i]', cpf_cnpj),
                ('input[name*="cpf" i]', cpf_cnpj),
                ('input[name*="cnpj" i]', cpf_cnpj),
            ]
            for selector, value in candidates:
                loc = page.locator(selector).first
                if await loc.count() == 0:
                    continue
                try:
                    await loc.fill(str(value))
                    filled = True
                except Exception:
                    continue

            # Tentativa genérica: inputs visíveis na ordem
            if not filled:
                inputs = page.locator("input:visible")
                count = await inputs.count()
                values = [str(numero), str(ano), cpf_cnpj]
                if digito:
                    values.insert(1, str(digito))
                for i, value in enumerate(values):
                    if i >= count:
                        break
                    try:
                        await inputs.nth(i).fill(value)
                        filled = True
                    except Exception:
                        pass

            # Captcha?
            body = (await page.content()).lower()
            if "captcha" in body or "recaptcha" in body or "digite os caracteres" in body:
                return ConsultaResult(
                    ok=False,
                    needs_manual=True,
                    url=url,
                    message=(
                        "O portal pediu captcha. Abra a URL de consulta e complete manualmente; "
                        "depois cadastre/atualize o status nesta UI."
                    ),
                    data={
                        "numero": numero,
                        "ano": ano,
                        "digito": digito,
                        "numero_unico": numero_unico,
                        "url_consulta": url,
                    },
                )

            for sel in (
                'button:has-text("Confirmar")',
                'button:has-text("Consultar")',
                'button:has-text("Pesquisar")',
                'button[type="submit"]',
            ):
                btn = page.locator(sel).first
                if await btn.count():
                    try:
                        await btn.click()
                        break
                    except Exception:
                        continue

            await page.wait_for_timeout(4000)

            # Linha do tempo / andamentos na DOM
            tramites: list[dict[str, Any]] = []
            for sel in (
                "text=Linha do tempo",
                "text=Andamentos",
                "text=Trâmites",
            ):
                link = page.locator(sel).first
                if await link.count():
                    try:
                        await link.click()
                        await page.wait_for_timeout(1500)
                    except Exception:
                        pass

            rows = page.locator("table tr, .timeline-item, .andamento, li")
            n = min(await rows.count(), 40)
            for i in range(n):
                text = (await rows.nth(i).inner_text()).strip()
                if len(text) > 8 and any(
                    k in text.lower() for k in ("tramit", "setor", "despacho", "andamento", "/")
                ):
                    tramites.append({"texto": text})

            if captured:
                if tramites and not captured.get("tramites"):
                    captured["tramites"] = tramites
                return ConsultaResult(
                    ok=True,
                    message="Consulta concluída via automação.",
                    data=captured,
                    url=url,
                )

            # DOM fallback status
            status_text = None
            for sel in ("text=/situa[cç][aã]o/i", ".status", "h2", "h3"):
                loc = page.locator(sel).first
                if await loc.count():
                    try:
                        status_text = (await loc.inner_text()).strip()[:200]
                        if status_text:
                            break
                    except Exception:
                        pass

            if tramites or (status_text and "consulta externa" not in status_text.lower()):
                data = {
                    "numero": str(numero),
                    "ano": int(ano),
                    "digito": digito,
                    "numero_unico": numero_unico,
                    "status": status_text or "consultado",
                    "tramites": tramites,
                    "url_consulta": url,
                    "origem": "consulta",
                }
                return ConsultaResult(
                    ok=True,
                    message="Consulta parcial via automação (DOM).",
                    data=data,
                    url=url,
                )

            return ConsultaResult(
                ok=False,
                needs_manual=True,
                url=url,
                message=(
                    "Não foi possível concluir a consulta automática"
                    + (" (formulário preenchido; falta confirmação/captcha no portal)." if filled else ".")
                    + " Use a URL oficial e atualize o protocolo aqui depois."
                ),
                data={"numero": numero, "ano": ano, "digito": digito, "url_consulta": url},
            )
        except Exception as exc:
            return ConsultaResult(
                ok=False,
                needs_manual=True,
                url=url,
                message=f"Falha na consulta automática: {exc}",
                data={"numero": numero, "ano": ano, "digito": digito, "url_consulta": url},
            )
        finally:
            await context.close()
            await browser.close()


def portal_links() -> dict[str, str]:
    return {
        "dashboard_cidadao": CIDADAO_DASHBOARD,
        "meus_protocolos": CIDADAO_MEUS,
        "consulta_externa": CONSULTA_EXTERNA,
        "abertura": ABERTURA,
        "prefeitura": PORTAL_PREFEITURA,
        "api_cidadao": API_CIDADAO,
        "entidade": ENTIDADE_NOME,
    }
