import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { listProviders, upcomingProviders } from "@/lib/providers/registry";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  return NextResponse.json({
    providers: listProviders().map((p) => ({
      key: p.key,
      kind: p.kind,
      name: p.name,
      description: p.description,
      entities: p.entities ?? [],
    })),
    upcoming: upcomingProviders,
  });
}
