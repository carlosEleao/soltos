import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { connectProvider, syncConnection } from "@/lib/connections";
import { listProviders } from "@/lib/providers/registry";
import { env } from "@/lib/env";

function json(data: unknown): string {
  return JSON.stringify(data, null, 2);
}

export function createUserMcpServer(userId: string): McpServer {
  const server = new McpServer({
    name: "civiclink",
    version: "1.0.0",
  });

  server.registerTool(
    "listar_conexoes",
    {
      description: "Lista provedores conectados do usuário (prefeitura, energia, etc).",
      inputSchema: {},
    },
    async () => {
      const connections = await prisma.connection.findMany({
        where: { userId },
        select: {
          id: true,
          providerKey: true,
          providerKind: true,
          displayName: true,
          cityOrEntity: true,
          status: true,
          lastSyncAt: true,
          lastError: true,
        },
        orderBy: { updatedAt: "desc" },
      });
      return { content: [{ type: "text", text: json({ connections }) }] };
    },
  );

  server.registerTool(
    "listar_tickets",
    {
      description: "Lista tickets/protocolos salvos do usuário, com filtro opcional.",
      inputSchema: {
        busca: z.string().optional(),
        providerKey: z.string().optional(),
      },
    },
    async ({ busca, providerKey }) => {
      const tickets = await prisma.ticket.findMany({
        where: {
          userId,
          ...(providerKey ? { providerKey } : {}),
          ...(busca
            ? {
                OR: [
                  { externalId: { contains: busca } },
                  { title: { contains: busca, mode: "insensitive" } },
                  { status: { contains: busca, mode: "insensitive" } },
                  { notes: { contains: busca, mode: "insensitive" } },
                ],
              }
            : {}),
        },
        orderBy: [{ year: "desc" }, { externalId: "desc" }],
        take: 100,
      });
      return { content: [{ type: "text", text: json({ count: tickets.length, tickets }) }] };
    },
  );

  server.registerTool(
    "cadastrar_ticket",
    {
      description: "Cadastra um ticket/protocolo manualmente na conta do usuário.",
      inputSchema: {
        providerKey: z.string().default("betha-prefeitura"),
        externalId: z.string(),
        year: z.number().int().optional(),
        digit: z.string().optional(),
        title: z.string().optional(),
        status: z.string().optional(),
        notes: z.string().optional(),
      },
    },
    async (input) => {
      const ticket = await prisma.ticket.upsert({
        where: {
          userId_providerKey_externalId_year: {
            userId,
            providerKey: input.providerKey,
            externalId: input.externalId,
            year: input.year ?? 0,
          },
        },
        create: {
          userId,
          providerKey: input.providerKey,
          externalId: input.externalId,
          year: input.year ?? null,
          digit: input.digit ?? null,
          title: input.title ?? null,
          status: input.status ?? null,
          notes: input.notes ?? null,
        },
        update: {
          digit: input.digit ?? undefined,
          title: input.title ?? undefined,
          status: input.status ?? undefined,
          notes: input.notes ?? undefined,
        },
      });
      return { content: [{ type: "text", text: json({ ok: true, ticket }) }] };
    },
  );

  server.registerTool(
    "sincronizar_conexao",
    {
      description:
        "Sincroniza tickets de uma conexão (ex.: prefeitura Betha) usando a sessão criptografada.",
      inputSchema: {
        connectionId: z.string(),
      },
    },
    async ({ connectionId }) => {
      const result = await syncConnection(userId, connectionId);
      return { content: [{ type: "text", text: json(result) }] };
    },
  );

  server.registerTool(
    "provedores_disponiveis",
    {
      description: "Lista provedores que o app sabe conectar hoje.",
      inputSchema: {},
    },
    async () => {
      const items = listProviders().map((p) => ({
        key: p.key,
        kind: p.kind,
        name: p.name,
        description: p.description,
        entities: p.entities ?? [],
      }));
      return { content: [{ type: "text", text: json({ providers: items }) }] };
    },
  );

  server.registerTool(
    "link_mcp",
    {
      description: "Retorna a URL base do endpoint MCP desta instalação (sem o token).",
      inputSchema: {},
    },
    async () => {
      return {
        content: [
          {
            type: "text",
            text: json({
              mcpBaseUrl: `${env.appUrl()}/api/mcp/<seu-token>`,
              tip: "Gere/revogue tokens no dashboard web.",
            }),
          },
        ],
      };
    },
  );

  // Intentionally NOT exposing raw passwords via MCP connect — connect stays in the web UI.
  void connectProvider;

  return server;
}
