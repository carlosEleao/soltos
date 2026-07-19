# CivicLink / soltos

Plataforma multi-user (Next.js) para conectar **prefeitura / energia / internet**, sincronizar tickets e gerar **link MCP** para ChatGPT ou agentes.

## App principal

Tudo vive em [`web/`](./web/):

1. Criar conta  
2. Conectar cidade (login embutido Betha — senha não é salva)  
3. Gerar link MCP pessoal  
4. Usar no ChatGPT / Cursor

Sessões de provedor: **AES-256-GCM** at rest. Tokens MCP: só hash no banco. Persistência: **SQLite**.

## Deploy Dokploy

- Build method: **Dockerfile**
- Dockerfile path: `Dockerfile` (raiz)
- Port: `3000`
- Healthcheck: `/api/health`
- Persist volume em `/app/data` (arquivo SQLite)

Env obrigatórias:

```
DATABASE_URL=file:/app/data/civiclink.db
AUTH_SECRET=...
AUTH_URL=https://seu-dominio
APP_URL=https://seu-dominio
SESSION_ENCRYPTION_KEY=...   # 32 bytes base64
```

Dev local (pnpm, na raiz do repo):

```bash
pnpm install
pnpm --filter civiclink-web exec playwright install chromium
cp web/.env.example web/.env   # preencha AUTH_SECRET e SESSION_ENCRYPTION_KEY
pnpm db:migrate
pnpm dev
```

Local com compose:

```bash
docker compose up --build
```

## Legado

A pasta `protocolos/` contém o protótipo Python anterior (single-user). O produto multi-user é o app em `web/`.
