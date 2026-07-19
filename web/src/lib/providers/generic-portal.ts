import { chromium, type Browser, type Page } from "playwright";
import type {
  ConnectInput,
  ConnectResult,
  ProviderAdapter,
  ProviderKind,
  ProviderSession,
  SyncItem,
  SyncResult,
} from "@/lib/providers/types";

export type PortalEntity = {
  id: string;
  label: string;
  portalUrl: string;
  /** Optional path/hash to open after login for listing tickets */
  listUrl?: string;
};

type GenericPortalConfig = {
  key: string;
  kind: ProviderKind;
  name: string;
  description: string;
  entities: PortalEntity[];
};

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

function resolveEntity(
  entities: PortalEntity[],
  cityOrEntity?: string,
  portalUrl?: string,
): PortalEntity {
  if (portalUrl) {
    return {
      id: cityOrEntity || "custom",
      label: cityOrEntity || "Portal customizado",
      portalUrl,
    };
  }
  const found = entities.find((e) => e.id === cityOrEntity) ?? entities[0];
  if (!found) {
    throw new Error("Nenhuma entidade configurada para este provedor");
  }
  return found;
}

async function fillLogin(page: Page, login: string, password: string): Promise<boolean> {
  const userSelectors = [
    'input[type="email"]',
    'input[name="username"]',
    'input[name="email"]',
    'input[name="login"]',
    'input[name="cpf"]',
    'input[name="user"]',
    'input[autocomplete="username"]',
    'input[placeholder*="mail" i]',
    'input[placeholder*="usuário" i]',
    'input[placeholder*="usuario" i]',
    'input[placeholder*="CPF" i]',
    'input[type="text"]',
  ];
  const passSelectors = [
    'input[type="password"]',
    'input[name="password"]',
    'input[name="senha"]',
    'input[autocomplete="current-password"]',
  ];

  let filledUser = false;
  for (const sel of userSelectors) {
    const loc = page.locator(sel).first();
    if ((await loc.count()) === 0) continue;
    try {
      await loc.fill(login);
      filledUser = true;
      break;
    } catch {
      /* try next */
    }
  }

  let filledPass = false;
  for (const sel of passSelectors) {
    const loc = page.locator(sel).first();
    if ((await loc.count()) === 0) continue;
    try {
      await loc.fill(password);
      filledPass = true;
      break;
    } catch {
      /* try next */
    }
  }

  if (!filledUser || !filledPass) return false;

  for (const sel of [
    'button[type="submit"]',
    'input[type="submit"]',
    'button:has-text("Entrar")',
    'button:has-text("Login")',
    'button:has-text("Acessar")',
    'button:has-text("Continuar")',
  ]) {
    const btn = page.locator(sel).first();
    if ((await btn.count()) === 0) continue;
    try {
      await btn.click();
      return true;
    } catch {
      /* try next */
    }
  }

  // fallback: press Enter on password field
  const pass = page.locator('input[type="password"]').first();
  if ((await pass.count()) > 0) {
    await pass.press("Enter");
    return true;
  }
  return true;
}

function looksLoggedIn(url: string, body: string): boolean {
  const u = url.toLowerCase();
  const b = body.toLowerCase();
  if (u.includes("logout") || b.includes("sair") || b.includes("minha conta")) return true;
  if (b.includes("meus protocolos") || b.includes("meus chamados") || b.includes("meus tickets")) {
    return true;
  }
  if (b.includes("protocolo") && b.includes("andamento")) return true;
  // still on login?
  const loginHeavy =
    (b.includes("senha") && (b.includes("entrar") || b.includes("login"))) ||
    u.includes("/login") ||
    u.includes("signin");
  return !loginHeavy;
}

function extractTicketsFromText(text: string): SyncItem[] {
  const items: SyncItem[] = [];
  const seen = new Set<string>();

  const patterns = [
    /(?:protocolo|chamado|ticket|os|ocorr[eê]ncia)\s*[#:º.]?\s*([A-Z0-9\-\/]{4,})/gi,
    /\b(\d{1,7}\s*\/\s*\d{4}(?:\s*[-/]\s*\d{1,3})?)\b/g,
    /\b(\d{6,12})\b/g,
  ];

  for (const re of patterns) {
    for (const match of text.matchAll(re)) {
      const raw = match[1]?.trim();
      if (!raw) continue;
      if (/^(19|20)\d{2}$/.test(raw)) continue; // year alone
      const key = raw.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);

      let externalId = raw;
      let year: number | undefined;
      let digit: string | undefined;
      const m = raw.match(/^(\d+)\s*\/\s*(\d{4})(?:\s*[-/]\s*(\w+))?$/);
      if (m) {
        externalId = m[1];
        year = Number(m[2]);
        digit = m[3];
      }

      items.push({
        externalId,
        year,
        digit,
        title: "Importado do portal",
        status: "sincronizado",
        payload: { raw },
      });
      if (items.length >= 40) return items;
    }
  }
  return items;
}

export function createGenericPortalProvider(config: GenericPortalConfig): ProviderAdapter {
  return {
    key: config.key,
    kind: config.kind,
    name: config.name,
    description: config.description,
    entities: config.entities.map((e) => ({
      id: e.id,
      label: e.label,
      portalUrl: e.portalUrl,
    })),

    async connect(input: ConnectInput): Promise<ConnectResult> {
      try {
        const entity = resolveEntity(config.entities, input.cityOrEntity, input.portalUrl);
        return await withBrowser(async (browser) => {
          const context = await browser.newContext({
            locale: "pt-BR",
            viewport: { width: 1280, height: 800 },
          });
          const page = await context.newPage();
          await page.goto(entity.portalUrl, {
            waitUntil: "domcontentloaded",
            timeout: 60_000,
          });
          await sleep(1500);

          const filled = await fillLogin(page, input.login, input.password);
          if (!filled) {
            await context.close();
            return {
              ok: false,
              message:
                "Não encontrei campos de login nesse portal. Informe uma URL de login direta em “Portal customizado”.",
            };
          }

          await sleep(4000);
          if (entity.listUrl) {
            try {
              await page.goto(entity.listUrl, {
                waitUntil: "domcontentloaded",
                timeout: 45_000,
              });
              await sleep(1500);
            } catch {
              /* keep current page */
            }
          }

          const url = page.url();
          const body = await page.content();
          if (!looksLoggedIn(url, body)) {
            await context.close();
            return {
              ok: false,
              message:
                "Login não confirmado (captcha/2FA/layout diferente). Tente a URL exata da área logada ou conclua 2FA e reconecte.",
            };
          }

          const storageState = await context.storageState();
          await context.close();

          return {
            ok: true,
            message: `${config.name} conectado. Sessão salva criptografada.`,
            session: {
              storageState,
              meta: {
                portalUrl: entity.portalUrl,
                listUrl: entity.listUrl ?? null,
                entityId: entity.id,
                connectedAt: new Date().toISOString(),
                loginHint: input.login.includes("@")
                  ? input.login.split("@")[0]
                  : `${input.login.slice(0, 3)}***`,
              },
            },
            displayName: `${config.name} · ${entity.label}`,
            cityOrEntity: entity.id,
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
          message: "Sessão ausente. Reconecte o provedor.",
          items: [],
        };
      }

      const portalUrl = String(session.meta?.portalUrl || config.entities[0]?.portalUrl || "");
      const listUrl = session.meta?.listUrl ? String(session.meta.listUrl) : portalUrl;

      try {
        return await withBrowser(async (browser) => {
          const context = await browser.newContext({
            storageState: session.storageState as never,
            locale: "pt-BR",
          });
          const page = await context.newPage();
          await page.goto(listUrl || portalUrl, {
            waitUntil: "domcontentloaded",
            timeout: 60_000,
          });
          await sleep(2500);

          const url = page.url();
          const body = await page.content();
          if (!looksLoggedIn(url, body)) {
            await context.close();
            return {
              ok: false,
              needsReconnect: true,
              message: "Sessão expirou. Reconecte pelo login embutido.",
              items: [],
            };
          }

          const text = await page.locator("body").innerText();
          const items = extractTicketsFromText(text);
          session.storageState = await context.storageState();
          await context.close();

          if (!items.length) {
            return {
              ok: true,
              message:
                "Conexão ok, mas nenhum chamado foi detectado automaticamente. Cadastre tickets manualmente ou via MCP (`cadastrar_ticket`).",
              items: [],
            };
          }

          return {
            ok: true,
            message: `${items.length} chamado(s) detectado(s) no portal.`,
            items,
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
}
