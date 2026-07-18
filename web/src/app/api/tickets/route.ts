import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q")?.trim();

  const tickets = await prisma.ticket.findMany({
    where: {
      userId: session.user.id,
      ...(q
        ? {
            OR: [
              { externalId: { contains: q } },
              { title: { contains: q, mode: "insensitive" } },
              { status: { contains: q, mode: "insensitive" } },
            ],
          }
        : {}),
    },
    orderBy: [{ year: "desc" }, { externalId: "desc" }],
    take: 100,
  });

  return NextResponse.json({ tickets });
}

const createSchema = z.object({
  providerKey: z.string().default("betha-prefeitura"),
  externalId: z.string().min(1),
  year: z.number().int().optional(),
  digit: z.string().optional(),
  title: z.string().optional(),
  status: z.string().optional(),
  notes: z.string().optional(),
});

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Dados inválidos" }, { status: 400 });
  }

  const ticket = await prisma.ticket.upsert({
    where: {
      userId_providerKey_externalId_year: {
        userId: session.user.id,
        providerKey: parsed.data.providerKey,
        externalId: parsed.data.externalId,
        year: parsed.data.year ?? 0,
      },
    },
    create: {
      userId: session.user.id,
      providerKey: parsed.data.providerKey,
      externalId: parsed.data.externalId,
      year: parsed.data.year ?? null,
      digit: parsed.data.digit,
      title: parsed.data.title,
      status: parsed.data.status,
      notes: parsed.data.notes,
    },
    update: {
      digit: parsed.data.digit,
      title: parsed.data.title,
      status: parsed.data.status,
      notes: parsed.data.notes,
    },
  });

  return NextResponse.json({ ticket }, { status: 201 });
}
