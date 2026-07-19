import { AuthForm } from "@/components/AuthForm";
import Link from "next/link";

export default function RegisterPage() {
  return (
    <main className="container" style={{ padding: "3rem 0" }}>
      <p style={{ marginBottom: "1.5rem" }}>
        <Link href="/">← CivicLink</Link>
      </p>
      <AuthForm mode="register" />
    </main>
  );
}
