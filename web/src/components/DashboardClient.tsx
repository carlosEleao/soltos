"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { signOut } from "next-auth/react";
import Link from "next/link";

type Connection = {
  id: string;
  providerKey: string;
  displayName: string;
  cityOrEntity: string | null;
  status: string;
  lastSyncAt: string | null;
  lastError: string | null;
};

type Ticket = {
  id: string;
  providerKey: string;
  externalId: string;
  year: number | null;
  digit: string | null;
  title: string | null;
  status: string | null;
};

type McpToken = {
  id: string;
  name: string;
  tokenPrefix: string;
  lastUsedAt: string | null;
  createdAt: string;
};

type Provider = {
  key: string;
  name: string;
  description: string;
  entities: { id: string; label: string }[];
};

export function DashboardClient({ userEmail }: { userEmail: string }) {
  const [connections, setConnections] = useState<Connection[]>([]);
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [tokens, setTokens] = useState<McpToken[]>([]);
  const [providers, setProviders] = useState<Provider[]>([]);
  const [msg, setMsg] = useState<string | null>(null);
  const [freshMcpUrl, setFreshMcpUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const reload = useCallback(async () => {
    const [c, t, m, p] = await Promise.all([
      fetch("/api/connections").then((r) => r.json()),
      fetch("/api/tickets").then((r) => r.json()),
      fetch("/api/mcp-tokens").then((r) => r.json()),
      fetch("/api/providers").then((r) => r.json()),
    ]);
    setConnections(c.connections ?? []);
    setTickets(t.tickets ?? []);
    setTokens(m.tokens ?? []);
    setProviders(p.providers ?? []);
  }, []);

  useEffect(() => {
    reload().catch((e) => setMsg(String(e)));
  }, [reload]);

  async function onConnect(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setMsg("Conectando… isso pode levar até 1 minuto.");
    const fd = new FormData(e.currentTarget);
    try {
      const res = await fetch("/api/connections", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          providerKey: fd.get("providerKey"),
          cityOrEntity: fd.get("cityOrEntity"),
          login: fd.get("login"),
          password: fd.get("password"),
        }),
      });
      const data = await res.json();
      setMsg(data.message || data.error || (res.ok ? "Conectado" : "Falha"));
      if (res.ok) {
        e.currentTarget.reset();
        await reload();
      }
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "Erro");
    } finally {
      setBusy(false);
    }
  }

  async function syncConnection(id: string) {
    setBusy(true);
    setMsg("Sincronizando…");
    try {
      const res = await fetch(`/api/connections/${id}/sync`, { method: "POST" });
      const data = await res.json();
      setMsg(data.message || data.error || "Sync finalizada");
      await reload();
    } finally {
      setBusy(false);
    }
  }

  async function createMcpToken() {
    setBusy(true);
    try {
      const res = await fetch("/api/mcp-tokens", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "agent" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Falha");
      setFreshMcpUrl(data.url);
      setMsg("Link MCP gerado — copie agora, o token completo não será mostrado de novo.");
      await reload();
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "Erro");
    } finally {
      setBusy(false);
    }
  }

  async function revokeToken(id: string) {
    await fetch(`/api/mcp-tokens/${id}`, { method: "DELETE" });
    await reload();
  }

  const betha = providers.find((p) => p.key === "betha-prefeitura");

  return (
    <div className="stack" style={{ gap: "1.25rem" }}>
      <header style={{ display: "flex", justifyContent: "space-between", gap: "1rem", flexWrap: "wrap" }}>
        <div>
          <p className="badge" style={{ margin: 0 }}>
            CivicLink
          </p>
          <h1 className="brand" style={{ margin: "0.2rem 0", fontSize: "2rem" }}>
            Painel
          </h1>
          <p className="muted" style={{ margin: 0 }}>
            {userEmail}
          </p>
        </div>
        <div style={{ display: "flex", gap: "0.5rem", alignItems: "start" }}>
          <Link className="btn" href="/">
            Início
          </Link>
          <button className="btn" type="button" onClick={() => signOut({ callbackUrl: "/" })}>
            Sair
          </button>
        </div>
      </header>

      {msg && (
        <div className="card" style={{ borderColor: "rgba(226,177,74,0.35)" }}>
          {msg}
        </div>
      )}

      <section className="card stack">
        <h2 className="brand" style={{ margin: 0, fontSize: "1.4rem" }}>
          Conectar cidade / provedor
        </h2>
        <p className="muted" style={{ margin: 0 }}>
          Login embutido: usamos suas credenciais só para autenticar no provedor e gravar a sessão
          criptografada (AES-256-GCM). A senha do provedor não é salva.
        </p>
        <form className="stack" onSubmit={onConnect}>
          <label className="label">
            Provedor
            <select className="input" name="providerKey" defaultValue="betha-prefeitura" required>
              {(providers.length ? providers : [{ key: "betha-prefeitura", name: "Betha" }]).map(
                (p) => (
                  <option key={p.key} value={p.key}>
                    {p.name}
                  </option>
                ),
              )}
            </select>
          </label>
          <label className="label">
            Cidade / entidade
            <select
              className="input"
              name="cityOrEntity"
              defaultValue={betha?.entities?.[0]?.id ?? "estancia-velha-rs"}
            >
              {(betha?.entities ?? [{ id: "estancia-velha-rs", label: "Estância Velha / RS" }]).map(
                (e) => (
                  <option key={e.id} value={e.id}>
                    {e.label}
                  </option>
                ),
              )}
            </select>
          </label>
          <label className="label">
            Usuário / email Betha
            <input className="input" name="login" required autoComplete="username" />
          </label>
          <label className="label">
            Senha Betha
            <input
              className="input"
              name="password"
              type="password"
              required
              autoComplete="current-password"
            />
          </label>
          <button className="btn btn-primary" disabled={busy} type="submit">
            Conectar com login embutido
          </button>
        </form>
      </section>

      <section className="card stack">
        <h2 className="brand" style={{ margin: 0, fontSize: "1.4rem" }}>
          Minhas conexões
        </h2>
        {!connections.length && <p className="muted">Nenhuma conexão ainda.</p>}
        {connections.map((c) => (
          <div
            key={c.id}
            style={{
              borderTop: "1px solid var(--line)",
              paddingTop: "0.85rem",
              display: "grid",
              gap: "0.35rem",
            }}
          >
            <strong>
              {c.displayName} · {c.cityOrEntity}
            </strong>
            <span className="muted">
              {c.status}
              {c.lastSyncAt ? ` · sync ${new Date(c.lastSyncAt).toLocaleString("pt-BR")}` : ""}
            </span>
            {c.lastError && <span style={{ color: "var(--danger)" }}>{c.lastError}</span>}
            <button
              className="btn"
              type="button"
              disabled={busy || c.status === "PENDING"}
              onClick={() => syncConnection(c.id)}
              style={{ width: "fit-content" }}
            >
              Sincronizar agora
            </button>
          </div>
        ))}
      </section>

      <section className="card stack">
        <div style={{ display: "flex", justifyContent: "space-between", gap: "1rem", flexWrap: "wrap" }}>
          <h2 className="brand" style={{ margin: 0, fontSize: "1.4rem" }}>
            Link MCP do agente
          </h2>
          <button className="btn btn-primary" type="button" disabled={busy} onClick={createMcpToken}>
            Gerar novo link
          </button>
        </div>
        <p className="muted" style={{ margin: 0 }}>
          Cole a URL no ChatGPT (MCP) ou Cursor. O token completo só aparece uma vez.
        </p>
        {freshMcpUrl && (
          <div className="stack">
            <code
              style={{
                display: "block",
                padding: "0.85rem",
                borderRadius: 10,
                background: "rgba(0,0,0,0.35)",
                wordBreak: "break-all",
              }}
            >
              {freshMcpUrl}
            </code>
            <button
              className="btn"
              type="button"
              onClick={() => navigator.clipboard.writeText(freshMcpUrl)}
            >
              Copiar URL
            </button>
          </div>
        )}
        {tokens.map((t) => (
          <div
            key={t.id}
            style={{
              display: "flex",
              justifyContent: "space-between",
              gap: "0.75rem",
              borderTop: "1px solid var(--line)",
              paddingTop: "0.75rem",
              flexWrap: "wrap",
            }}
          >
            <div>
              <strong>{t.name}</strong>
              <div className="muted">
                {t.tokenPrefix}… · criado {new Date(t.createdAt).toLocaleDateString("pt-BR")}
              </div>
            </div>
            <button className="btn btn-danger" type="button" onClick={() => revokeToken(t.id)}>
              Revogar
            </button>
          </div>
        ))}
      </section>

      <section className="card stack">
        <h2 className="brand" style={{ margin: 0, fontSize: "1.4rem" }}>
          Tickets / protocolos
        </h2>
        {!tickets.length && <p className="muted">Nenhum ticket ainda. Conecte e sincronize.</p>}
        {tickets.map((t) => (
          <div key={t.id} style={{ borderTop: "1px solid var(--line)", paddingTop: "0.75rem" }}>
            <strong>
              {t.externalId}
              {t.year ? `/${t.year}` : ""}
              {t.digit ? `-${t.digit}` : ""}
            </strong>
            <div className="muted">
              {t.title || "Sem título"} · {t.status || "sem status"} · {t.providerKey}
            </div>
          </div>
        ))}
      </section>
    </div>
  );
}
