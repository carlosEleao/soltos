import { NextResponse } from "next/server";
import {
  handleUserMcpRequest,
  resolveUserIdFromMcpToken,
} from "@/lib/mcp/handle-request";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

async function withUser(
  token: string,
  req: Request,
): Promise<Response> {
  const userId = await resolveUserIdFromMcpToken(token);
  if (!userId) {
    return NextResponse.json({ error: "Token MCP inválido" }, { status: 401 });
  }
  return handleUserMcpRequest(userId, req);
}

export async function GET(
  req: Request,
  ctx: { params: Promise<{ token: string }> },
) {
  const { token } = await ctx.params;
  return withUser(token, req);
}

export async function POST(
  req: Request,
  ctx: { params: Promise<{ token: string }> },
) {
  const { token } = await ctx.params;
  return withUser(token, req);
}

export async function DELETE(
  req: Request,
  ctx: { params: Promise<{ token: string }> },
) {
  const { token } = await ctx.params;
  return withUser(token, req);
}
