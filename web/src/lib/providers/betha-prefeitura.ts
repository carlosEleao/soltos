import { chromium, type Browser } from "playwright";
import type {
  ConnectInput,
  ConnectResult,
  ProviderAdapter,
  ProviderSession,
  SyncItem,
  SyncResult,
} from "@/lib/providers/types";

const DASHBOARD = "https://protocolo.betha.cloud/#/cidadao/dashboard";
const MEUS = "https://protocolo.betha.cloud/#/cidadao/meusprotocolos";

function headless(): boolean {
  return process.env.PLAYWRIGHT_HEADLESS !== "false";
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function withBrowser<T>(fn: (browser: Browser) => Promise<T>): Promise<T> {
  const browser = await chromium.launch({
    headless: headless(),
    args: ["--disable-dev-shm-usage", "--no-sandbox"],
  });
  try {
    return await fn(browser);
  } finally {
    await browser.close();
  }
}

function walkCollect(obj: unknown, out: SyncItem[]): void {
  if (!obj || typeof obj !== "object") return;
  if (Array.isArray(obj)) {
    for (const item of obj) walkCollect(item, out);
    return;
  }
  const rec = obj as Record<string, unknown>;
  const numero = rec.numero ?? rec.nroProcesso ?? rec.numeroProcesso;
  const ano = rec.ano ?? rec.anoProcesso ?? rec.exercicio;
  const numeroUnico = rec.numeroUnico ?? rec.nroUnico;

  let externalId = numero != null ? String(numero) : null;
  let year = ano != null ? Number(String(ano).slice(0, 4)) : undefined;
  let digit =
    rec.digito != null
      ? String(rec.digito)
      : rec.dv != null
        ? String(rec.dv)
        : undefined;

  if (!externalId && typeof numeroUnico === "string") {
    const m = numeroUnico.match(/(\d+)\s*\/\s*(\d{4})(?:\s*[-/]\s*(\w+))?/);
    if (m) {
      externalId = m[1];
      year = Number(m[2]);
      digit = m[3];
    }
  }

  if (externalId) {
    out.push({
      externalId,
      year,
      digit,
      title:
        (rec.assunto as string) ||
        (rec.descricaoAssunto as string) ||
        (rec.natureza as string) ||
        undefined,
      status:
        (rec.status as string) ||
        (rec.situacao as string) ||
        (rec.descricaoSituacao as string) ||
        undefined,
      payload: rec,
    });
  }

  for (const value of Object.values(rec)) walkCollect(value, out);
}

export const bethaPrefeitura: ProviderAdapter = {
  key: "betha-prefeitura",
  kind: "PREFEITURA",
  name: "Prefeitura (Betha Protocolo)",
  description:
    "Conecta ao Protocolo Betha Cloud para listar e acompanhar protocolos municipais.",
  entities: [
    { id: "estancia-velha-rs", label: "Estância Velha / RS" },
  ],

  async connect(input: ConnectInput): Promise<ConnectResult> {
    try {
      return await withBrowser(async (browser) => {
        const context = await browser.newContext({
          locale: "pt-BR",
          viewport: { width: 1280, height: 800 },
        });
        const page = await context.newPage();
        await page.goto(DASHBOARD, { waitUntil: "domcontentloaded", timeout: 60_000 });
        await sleep(2000);

        // Betha usually redirects to Central do Usuário / OAuth form
        const emailSel = [
          'input[type="email"]',
          'input[name="username"]',
          'input[name="email"]',
          'input[placeholder*="mail" i]',
          'input[placeholder*="usuário" i]',
          'input[placeholder*="usuario" i]',
        ];
        const passSel = ['input[type="password"]', 'input[name="password"]'];

        let filled = false;
        for (const sel of emailSel) {
          const loc = page.locator(sel).first();
          if ((await loc.count()) > 0) {
            await loc.fill(input.login);
            filled = true;
            break;
          }
        }
        for (const sel of passSel) {
          const loc = page.locator(sel).first();
          if ((await loc.count()) > 0) {
            await loc.fill(input.password);
            filled = true;
            break;
          }
        }

        if (!filled) {
          return {
            ok: false,
            message:
              "Não encontrei o formulário de login da Betha. Tente novamente em alguns minutos.",
          };
        }

        for (const sel of [
          'button[type="submit"]',
          'button:has-text("Entrar")',
          'button:has-text("Login")',
          'input[type="submit"]',
        ]) {
          const btn = page.locator(sel).first();
          if ((await btn.count()) > 0) {
            await btn.click();
            break;
          }
        }

        await sleep(4000);
        await page.goto(DASHBOARD, { waitUntil: "domcontentloaded", timeout: 60_000 });
        await sleep(2500);

        const url = page.url().toLowerCase();
        const body = (await page.content()).toLowerCase();
        const stillLogin =
          url.includes("login") ||
          url.includes("auth") ||
          url.includes("autoriz") ||
          (body.includes("senha") && body.includes("entrar"));

        if (stillLogin) {
          return {
            ok: false,
            message:
              "Login não confirmado. Verifique usuário/senha ou complete 2FA na Central Betha e tente de novo.",
          };
        }

        const storageState = await context.storageState();
        await context.close();

        return {
          ok: true,
          message: "Conta Betha conectada. Sessão salva de forma criptografada.",
          session: {
            storageState,
            meta: {
              connectedAt: new Date().toISOString(),
              loginHint: input.login.includes("@")
                ? input.login.split("@")[0]
                : input.login.slice(0, 3) + "***",
            },
          },
          displayName: "Betha Protocolo",
          cityOrEntity: input.cityOrEntity ?? "estancia-velha-rs",
        };
      });
    } catch (error) {
      return {
        ok: false,
        message: `Falha ao conectar: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  },

  async sync(session: ProviderSession): Promise<SyncResult> {
    if (!session.storageState) {
      return {
        ok: false,
        needsReconnect: true,
        message: "Sessão ausente. Reconecte a prefeitura.",
        items: [],
      };
    }

    try {
      return await withBrowser(async (browser) => {
        const context = await browser.newContext({
          storageState: session.storageState as never,
          locale: "pt-BR",
        });
        const page = await context.newPage();
        const captured: SyncItem[] = [];
        let apiHits = 0;

        page.on("response", async (response) => {
          const url = response.url();
          if (!url.includes("api.protocolo.betha.cloud")) return;
          if (!/cidadao|processos|solicitacoes/i.test(url)) return;
          try {
            if (response.status() !== 200) return;
            const ctype = response.headers()["content-type"] ?? "";
            if (!ctype.includes("json")) return;
            const payload = await response.json();
            apiHits += 1;
            const found: SyncItem[] = [];
            walkCollect(payload, found);
            for (const item of found) {
              const key = `${item.externalId}-${item.year ?? ""}-${item.digit ?? ""}`;
              if (
                !captured.some(
                  (c) => `${c.externalId}-${c.year ?? ""}-${c.digit ?? ""}` === key,
                )
              ) {
                captured.push(item);
              }
            }
          } catch {
            /* ignore parse errors */
          }
        });

        for (const url of [DASHBOARD, MEUS]) {
          await page.goto(url, { waitUntil: "networkidle", timeout: 60_000 });
          await sleep(2500);
        }

        const currentUrl = page.url().toLowerCase();
        if (currentUrl.includes("login") || currentUrl.includes("auth")) {
          await context.close();
          return {
            ok: false,
            needsReconnect: true,
            message: "Sessão Betha expirou. Reconecte pelo fluxo embutido.",
            items: [],
          };
        }

        // Persist refreshed cookies
        const storageState = await context.storageState();
        session.storageState = storageState;
        await context.close();

        if (!captured.length) {
          return {
            ok: false,
            message: `Nenhum protocolo capturado (API hits: ${apiHits}). Confirme o vínculo do CPF na entidade.`,
            items: [],
          };
        }

        return {
          ok: true,
          message: `${captured.length} protocolo(s) sincronizado(s).`,
          items: captured,
        };
      });
    } catch (error) {
      return {
        ok: false,
        message: `Falha na sync: ${error instanceof Error ? error.message : String(error)}`,
        items: [],
      };
    }
  },
};
