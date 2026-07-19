import { chromium, type Browser, type Page } from "playwright";
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

/** Suite Betha (JSF) login form — redirected from protocolo.betha.cloud */
const SEL = {
  user: '#login\\:iUsuarios, input[name="login:iUsuarios"]',
  password: '#login\\:senha, input[name="login:senha"]',
  cpfMode: '#login\\:acessoCpf, input[name="login:acessoCpf"]',
  submit: '#login\\:btAcessar',
} as const;

function headless(): boolean {
  return process.env.PLAYWRIGHT_HEADLESS !== "false";
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function digitsOnly(value: string): string {
  return value.replace(/\D/g, "");
}

function looksLikeCpf(value: string): boolean {
  return digitsOnly(value).length === 11;
}

function formatCpf(value: string): string {
  const d = digitsOnly(value).padStart(11, "0").slice(0, 11);
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
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

async function waitForSuiteLogin(page: Page): Promise<boolean> {
  // Prefer the real JSF fields — URL can bounce through oauth before login.faces
  try {
    await page.locator(SEL.user).first().waitFor({ state: "visible", timeout: 60_000 });
    await page.locator(SEL.password).first().waitFor({ state: "visible", timeout: 15_000 });
    return true;
  } catch {
    return false;
  }
}

async function suiteBethaLogin(
  page: Page,
  login: string,
  password: string,
): Promise<{ ok: true } | { ok: false; message: string }> {
  const found = await waitForSuiteLogin(page);
  if (!found) {
    return {
      ok: false,
      message:
        "Não encontrei o formulário da Suite Betha (campos login:iUsuarios / senha). Tente novamente.",
    };
  }

  const user = page.locator(SEL.user).first();
  const pass = page.locator(SEL.password).first();
  const cpfMode = page.locator(SEL.cpfMode).first();

  if (looksLikeCpf(login)) {
    if ((await cpfMode.count()) > 0) {
      const checked = await cpfMode.isChecked().catch(() => false);
      if (!checked) {
        // Label click is more reliable on JSF than input.check()
        const label = page.locator('label[for="login:acessoCpf"]');
        if ((await label.count()) > 0) {
          await label.click();
        } else {
          await cpfMode.click({ force: true });
        }
        await sleep(600);
      }
    }
    await user.click();
    await user.fill("");
    await user.fill(formatCpf(login));
  } else {
    if ((await cpfMode.count()) > 0) {
      const checked = await cpfMode.isChecked().catch(() => false);
      if (checked) {
        await cpfMode.click({ force: true });
        await sleep(400);
      }
    }
    await user.fill(login.trim());
  }

  await pass.fill(password);

  const submit = page.locator(SEL.submit).first();
  if ((await submit.count()) > 0 && (await submit.isVisible().catch(() => false))) {
    await Promise.all([
      page.waitForNavigation({ waitUntil: "domcontentloaded", timeout: 45_000 }).catch(() => null),
      submit.click(),
    ]);
  } else {
    const byRole = page.getByRole("link", { name: /^Acessar$/i }).first();
    if ((await byRole.count()) > 0) {
      await Promise.all([
        page.waitForNavigation({ waitUntil: "domcontentloaded", timeout: 45_000 }).catch(() => null),
        byRole.click(),
      ]);
    } else {
      await pass.press("Enter");
      await sleep(3000);
    }
  }

  await sleep(1500);

  const url = page.url().toLowerCase();
  const body = (await page.content()).toLowerCase();
  if (
    body.includes("senha inválida") ||
    body.includes("senha invalida") ||
    body.includes("usuário ou senha") ||
    body.includes("usuario ou senha") ||
    body.includes("dados inválidos") ||
    body.includes("acesso negado")
  ) {
    return { ok: false, message: "Usuário/CPF ou senha inválidos na Suite Betha." };
  }

  if (
    (url.includes("login.betha.cloud") || url.includes("servicelogin")) &&
    (await page.locator(SEL.password).first().isVisible().catch(() => false))
  ) {
    return {
      ok: false,
      message:
        "Login não confirmado. Verifique CPF/senha ou complete 2FA na Central Betha e tente de novo.",
    };
  }

  return { ok: true };
}

async function maybeSelectEntity(page: Page, cityOrEntity?: string): Promise<void> {
  const label =
    !cityOrEntity || cityOrEntity === "estancia-velha-rs"
      ? /Est[âa]ncia\s+Velha/i
      : new RegExp(cityOrEntity.replace(/[-_/]/g, "[\\s\\-_]*"), "i");

  const entity = page.getByText(label).first();
  try {
    await entity.waitFor({ state: "visible", timeout: 5_000 });
    await entity.click();
    await sleep(1500);
  } catch {
    /* entity already bound / no picker */
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
          userAgent:
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
        });
        const page = await context.newPage();
        await page.goto(DASHBOARD, { waitUntil: "networkidle", timeout: 90_000 }).catch(async () => {
          await page.goto(DASHBOARD, { waitUntil: "domcontentloaded", timeout: 60_000 });
        });

        const loginResult = await suiteBethaLogin(page, input.login, input.password);
        if (!loginResult.ok) {
          await context.close();
          return { ok: false, message: loginResult.message };
        }

        await maybeSelectEntity(page, input.cityOrEntity);
        await page.goto(DASHBOARD, { waitUntil: "domcontentloaded", timeout: 60_000 });
        await sleep(2500);
        await maybeSelectEntity(page, input.cityOrEntity);

        const url = page.url().toLowerCase();
        const body = (await page.content()).toLowerCase();
        const formStillVisible =
          (await page.locator(SEL.user).count()) > 0 &&
          (await page.locator(SEL.password).isVisible().catch(() => false));
        const stillLogin =
          url.includes("login.betha.cloud") ||
          url.includes("servicelogin") ||
          formStillVisible ||
          (body.includes("fazer login") && body.includes("suite betha"));

        if (stillLogin) {
          await context.close();
          return {
            ok: false,
            message:
              "Login não confirmado. Verifique CPF/senha ou complete 2FA na Central Betha e tente de novo.",
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
              loginHint: looksLikeCpf(input.login)
                ? `${digitsOnly(input.login).slice(0, 3)}***`
                : input.login.includes("@")
                  ? input.login.split("@")[0]
                  : `${input.login.slice(0, 3)}***`,
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
