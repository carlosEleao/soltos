import Link from "next/link";
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";

export default async function HomePage() {
  const session = await auth();
  if (session?.user) redirect("/dashboard");

  return (
    <main className="container" style={{ padding: "3rem 0 5rem" }}>
      <p className="badge">CivicLink</p>
      <h1
        className="brand"
        style={{ fontSize: "clamp(2.4rem, 6vw, 4rem)", margin: "0.4rem 0 1rem", maxWidth: "14ch" }}
      >
        Seus protocolos no agente
      </h1>
      <p className="muted" style={{ maxWidth: "52ch", fontSize: "1.15rem", lineHeight: 1.5 }}>
        Crie uma conta, conecte a prefeitura (e em breve energia/internet) com login embutido,
        e gere um link MCP para o ChatGPT ou Cursor acompanhar e abrir tickets.
      </p>
      <div style={{ display: "flex", gap: "0.75rem", marginTop: "1.75rem", flexWrap: "wrap" }}>
        <Link className="btn btn-primary" href="/register">
          Criar conta
        </Link>
        <Link className="btn" href="/login">
          Entrar
        </Link>
      </div>

      <section
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
          gap: "1rem",
          marginTop: "3rem",
        }}
      >
        {[
          ["1. Conta", "Cadastro simples com email e senha."],
          ["2. Conectar cidade", "Login embutido na Betha; sessão fica criptografada."],
          ["3. Link MCP", "Cole no ChatGPT/Cursor e peça status ou sync."],
        ].map(([title, text]) => (
          <div className="card" key={title}>
            <h2 className="brand" style={{ margin: "0 0 0.5rem", fontSize: "1.35rem" }}>
              {title}
            </h2>
            <p className="muted" style={{ margin: 0 }}>
              {text}
            </p>
          </div>
        ))}
      </section>
    </main>
  );
}
