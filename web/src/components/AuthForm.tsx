"use client";

import { FormEvent, useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";

type Mode = "login" | "register";

export function AuthForm({ mode }: { mode: Mode }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const fd = new FormData(e.currentTarget);
    const email = String(fd.get("email") || "");
    const password = String(fd.get("password") || "");
    const name = String(fd.get("name") || "");

    try {
      if (mode === "register") {
        const res = await fetch("/api/register", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, password, name: name || undefined }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Falha no cadastro");
      }

      const result = await signIn("credentials", {
        email,
        password,
        redirect: false,
      });
      if (result?.error) throw new Error("Email ou senha inválidos");
      router.push("/dashboard");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form className="card stack" onSubmit={onSubmit} style={{ maxWidth: 420, margin: "0 auto" }}>
      <h1 className="brand" style={{ margin: 0, fontSize: "1.8rem" }}>
        {mode === "login" ? "Entrar" : "Criar conta"}
      </h1>
      {mode === "register" && (
        <label className="label">
          Nome
          <input className="input" name="name" placeholder="Como prefere ser chamado" />
        </label>
      )}
      <label className="label">
        Email
        <input className="input" name="email" type="email" required autoComplete="email" />
      </label>
      <label className="label">
        Senha
        <input
          className="input"
          name="password"
          type="password"
          required
          minLength={8}
          autoComplete={mode === "login" ? "current-password" : "new-password"}
        />
      </label>
      {error && <p style={{ color: "var(--danger)", margin: 0 }}>{error}</p>}
      <button className="btn btn-primary" disabled={loading} type="submit">
        {loading ? "Aguarde…" : mode === "login" ? "Entrar" : "Criar conta"}
      </button>
      <p className="muted" style={{ margin: 0, fontSize: "0.92rem" }}>
        {mode === "login" ? (
          <>
            Não tem conta? <Link href="/register">Cadastre-se</Link>
          </>
        ) : (
          <>
            Já tem conta? <Link href="/login">Entrar</Link>
          </>
        )}
      </p>
    </form>
  );
}
