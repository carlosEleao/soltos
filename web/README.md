# CivicLink (web)

App Next.js multi-user: conecte prefeitura (Betha) com login embutido, salve a sessão criptografada e gere um **link MCP** para ChatGPT/Cursor.

## Fluxo

1. Criar conta (`/register`)
2. No painel, conectar **prefeitura / energia / internet** (login embutido — senha **não** é persistida)
3. Gerar link MCP (token mostrado uma vez)
4. Colar a URL no agente (`/api/mcp/<token>`)

Provedores:
- `betha-prefeitura` — Protocolo Betha Cloud
- `energia` — RGE/CPFL, Equatorial/CEEE ou URL customizada
- `internet` — Vivo, Claro/NET, Oi ou provedor local (URL customizada)

## Segurança da sessão do provedor

- Credenciais do provedor existem só na memória durante o login embutido
- Sessão (cookies/storageState) é cifrada com **AES-256-GCM** + salt por conexão (`SESSION_ENCRYPTION_KEY`)
- Tokens MCP: só hash SHA-256 no banco; URL completa aparece uma vez
- Revogação imediata pelo painel

## Dev local

Na raiz do repo (pnpm workspace):

```bash
cp web/.env.example web/.env
# preencha AUTH_SECRET e SESSION_ENCRYPTION_KEY (32 bytes base64)

pnpm install
pnpm db:migrate
pnpm --filter civiclink-web exec playwright install chromium
pnpm dev
```

O SQLite fica em `web/data/civiclink.db` (criado pela migration).

Ou só dentro de `web/`:

```bash
pnpm install
pnpm exec prisma migrate deploy
pnpm exec playwright install chromium
pnpm dev
```

## Docker / Dokploy

Na raiz do repo:

- `Dockerfile` (Playwright + Next standalone)
- `docker-compose.yml` (web + volume SQLite em `/app/data`)
- Porta `3000`, healthcheck `/api/health`

Variáveis obrigatórias no Dokploy:

| Var | Descrição |
|---|---|
| `DATABASE_URL` | SQLite, ex. `file:/app/data/civiclink.db` |
| `AUTH_SECRET` | Secret Auth.js |
| `AUTH_URL` / `APP_URL` | URL pública HTTPS |
| `SESSION_ENCRYPTION_KEY` | 32 bytes em base64 |

```bash
# gerar chave
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

## MCP tools (por usuário)

- `listar_conexoes`
- `listar_tickets`
- `cadastrar_ticket` / `abrir_ticket`
- `sincronizar_conexao`
- `provedores_disponiveis`
- `link_mcp`

Endpoint: `POST https://seu-dominio/api/mcp/<token>`  
Clientes devem enviar `Accept: application/json, text/event-stream`.

Conectar provedores (com senha) fica só na UI web de propósito.
