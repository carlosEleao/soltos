"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
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

type ProviderEntity = { id: string; label: string; portalUrl?: string };

type Provider = {
  key: string;
  kind: string;
  name: string;
  description: string;
  entities: ProviderEntity[];
  allowsCustomPortal?: boolean;
};

export function DashboardClient({ userEmail }: { userEmail: string }) {
  const [connections, setConnections] = useState<Connection[]>([]);
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [tokens, setTokens] = useState<McpToken[]>([]);
  const [providers, setProviders] = useState<Provider[]>([]);
  const [providerKey, setProviderKey] = useState("betha-prefeitura");
  const [entityId, setEntityId] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [freshMcpUrl, setFreshMcpUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const selectedProvider = useMemo(
    () => providers.find((p) => p.key === providerKey) ?? providers[0],
    [providers, providerKey],
  );

  const entities = selectedProvider?.entities ?? [];
  const needsCustomPortal = entityId === "custom" || selectedProvider?.allowsCustomPortal && entityId === "custom";

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
    const nextProviders: Provider[] = p.providers ?? [];
    setProviders(nextProviders);
    if (nextProviders.length && !nextProviders.some((x) => x.key === providerKey)) {
      setProviderKey(nextProviders[0].key);
    }
  }, [providerKey]);

  useEffect(() => {
    reload().catch((e) => setMsg(String(e)));
  }, [reload]);

  useEffect(() => {
    if (!selectedProvider) return;
    const first = selectedProvider.entities[0]?.id ?? "";
    if (!selectedProvider.entities.some((e) => e.id === entityId)) {
      setEntityId(first);
    }
  }, [selectedProvider, entityId]);

  async function onConnect(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setMsg("Conectando… isso pode levar até 1 minuto.");
    const fd = new FormData(e.currentTarget);
    const portalUrl = String(fd.get("portalUrl") || "").trim();
    try {
      const res = await fetch("/api/connections", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          providerKey: fd.get("providerKey"),
          cityOrEntity: fd.get("cityOrEntity"),
          login: fd.get("login"),
          password: fd.get("password"),
          ...(portalUrl ? { portalUrl } : {}),
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

  async function onCreateTicket(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    const fd = new FormData(e.currentTarget);
    try {
      const yearRaw = String(fd.get("year") || "").trim();
      const res = await fetch("/api/tickets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          providerKey: fd.get("providerKey"),
          externalId: fd.get("externalId"),
          year: yearRaw ? Number(yearRaw) : undefined,
          digit: String(fd.get("digit") || "") || undefined,
          title: String(fd.get("title") || "") || undefined,
          status: String(fd.get("status") || "") || undefined,
          notes: String(fd.get("notes") || "") || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Falha ao salvar");
      setMsg("Ticket cadastrado");
      e.currentTarget.reset();
      await reload();
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "Erro");
    } finally {
      setBusy(false);
    }
  }

  const loginLabel =
    selectedProvider?.kind === "PREFEITURA"
      ? "Usuário / email Betha"
      : "Usuário / CPF / email do portal";

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
          Conectar provedor
        </h2>
        <p className="muted" style={{ margin: 0 }}>
          Prefeitura, energia ou internet. Login embutido: a senha do provedor não é salva — só a
          sessão criptografada (AES-256-GCM).
        </p>
        <form className="stack" onSubmit={onConnect}>
          <label className="label">
            Provedor
            <select
              className="input"
              name="providerKey"
              required
              value={providerKey}
              onChange={(e) => setProviderKey(e.target.value)}
            >
              {providers.map((p) => (
                <option key={p.key} value={p.key}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
          {selectedProvider?.description && (
            <p className="muted" style={{ margin: 0, fontSize: "0.9rem" }}>
              {selectedProvider.description}
            </p>
          )}
          <label className="label">
            Entidade / cidade / empresa
            <select
              className="input"
              name="cityOrEntity"
              required
              value={entityId}
              onChange={(e) => setEntityId(e.target.value)}
            >
              {entities.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.label}
                </option>
              ))}
            </select>
          </label>
          {needsCustomPortal && (
            <label className="label">
              URL do portal (login)
              <input
                className="input"
                name="portalUrl"
                type="url"
                required
                placeholder="https://portal.seuprovedor.com.br/login"
              />
            </label>
          )}
          <label className="label">
            {loginLabel}
            <input className="input" name="login" required autoComplete="username" />
          </label>
          <label className="label">
            Senha do portal
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
              {c.providerKey} · {c.status}
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
          Cadastrar ticket / protocolo
        </h2>
        <form className="stack" onSubmit={onCreateTicket}>
          <label className="label">
            Provedor
            <select className="input" name="providerKey" defaultValue={providerKey}>
              {providers.map((p) => (
                <option key={p.key} value={p.key}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "0.75rem" }}>
            <label className="label">
              Número
              <input className="input" name="externalId" required placeholder="1234" />
            </label>
            <label className="label">
              Ano
              <input className="input" name="year" type="number" placeholder="2026" />
            </label>
            <label className="label">
              Dígito
              <input className="input" name="digit" placeholder="opcional" />
            </label>
          </div>
          <label className="label">
            Assunto
            <input className="input" name="title" placeholder="resumo" />
          </label>
          <label className="label">
            Status
            <input className="input" name="status" placeholder="aberto, em análise…" />
          </label>
          <label className="label">
            Notas
            <input className="input" name="notes" placeholder="lembrete interno" />
          </label>
          <button className="btn btn-primary" disabled={busy} type="submit">
            Salvar ticket
          </button>
        </form>
      </section>

      <section className="card stack">
        <h2 className="brand" style={{ margin: 0, fontSize: "1.4rem" }}>
          Tickets / protocolos
        </h2>
        {!tickets.length && <p className="muted">Nenhum ticket ainda. Conecte, sincronize ou cadastre.</p>}
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
