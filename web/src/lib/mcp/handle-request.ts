import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { createUserMcpServer } from "@/lib/mcp/server-for-user";
import { hashToken } from "@/lib/crypto";
import { prisma } from "@/lib/db";

export async function resolveUserIdFromMcpToken(rawToken: string): Promise<string | null> {
  const tokenHash = hashToken(rawToken);
  const token = await prisma.mcpToken.findUnique({ where: { tokenHash } });
  if (!token || token.revokedAt) return null;

  await prisma.mcpToken.update({
    where: { id: token.id },
    data: { lastUsedAt: new Date() },
  });

  return token.userId;
}

/** Stateless Streamable HTTP MCP handler scoped to a user. */
export async function handleUserMcpRequest(
  userId: string,
  req: Request,
): Promise<Response> {
  const server = createUserMcpServer(userId);
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined, // stateless
    enableJsonResponse: true,
  });

  await server.connect(transport);
  return transport.handleRequest(req);
}
