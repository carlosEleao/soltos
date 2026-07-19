import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { DashboardClient } from "@/components/DashboardClient";

export default async function DashboardPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  return (
    <main className="container" style={{ padding: "2rem 0 4rem" }}>
      <DashboardClient userEmail={session.user.email ?? ""} />
    </main>
  );
}
