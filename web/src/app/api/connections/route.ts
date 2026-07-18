import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { connectProvider } from "@/lib/connections";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  const connections = await prisma.connection.findMany({
    where: { userId: session.user.id },
    select: {
      id: true,
      providerKey: true,
      providerKind: true,
      displayName: true,
      cityOrEntity: true,
      status: true,
      lastSyncAt: true,
      lastError: true,
      sessionUpdatedAt: true,
      createdAt: true,
    },
    orderBy: { updatedAt: "desc" },
  });

  return NextResponse.json({ connections });
}

const connectSchema = z.object({
  providerKey: z.string(),
  login: z.string().min(3),
  password: z.string().min(1),
  cityOrEntity: z.string().optional(),
  portalUrl: z.string().url().optional(),
});

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const parsed = connectSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Dados inválidos" }, { status: 400 });
  }

  // Password is used only in-memory for the embedded login, never persisted.
  const result = await connectProvider({
    userId: session.user.id,
    ...parsed.data,
  });

  return NextResponse.json(result, { status: result.ok ? 200 : 400 });
}
