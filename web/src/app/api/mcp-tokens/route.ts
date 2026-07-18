import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { generateMcpToken } from "@/lib/crypto";
import { env } from "@/lib/env";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  const tokens = await prisma.mcpToken.findMany({
    where: { userId: session.user.id, revokedAt: null },
    select: {
      id: true,
      name: true,
      tokenPrefix: true,
      lastUsedAt: true,
      createdAt: true,
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({
    tokens,
    mcpBasePattern: `${env.appUrl()}/api/mcp/<token>`,
  });
}

const createSchema = z.object({
  name: z.string().min(1).max(60).default("default"),
});

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Dados inválidos" }, { status: 400 });
  }

  const generated = generateMcpToken();
  const token = await prisma.mcpToken.create({
    data: {
      userId: session.user.id,
      name: parsed.data.name,
      tokenHash: generated.hash,
      tokenPrefix: generated.prefix,
    },
  });

  const url = `${env.appUrl()}/api/mcp/${generated.raw}`;

  return NextResponse.json({
    id: token.id,
    name: token.name,
    tokenPrefix: token.tokenPrefix,
    /** Shown only once */
    token: generated.raw,
    url,
    cursorConfig: {
      mcpServers: {
        civiclink: {
          url,
        },
      },
    },
  });
}
