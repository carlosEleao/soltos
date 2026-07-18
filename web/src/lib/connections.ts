import { prisma } from "@/lib/db";
import { decryptSession, encryptSession } from "@/lib/crypto";
import { getProvider } from "@/lib/providers/registry";
import type { ProviderSession } from "@/lib/providers/types";
import type { Connection, Prisma } from "@prisma/client";

export function connectionSession(connection: Connection): ProviderSession | null {
  if (
    !connection.encryptedSession ||
    !connection.sessionIv ||
    !connection.sessionTag ||
    !connection.sessionSalt
  ) {
    return null;
  }
  return decryptSession<ProviderSession>({
    ciphertext: connection.encryptedSession,
    iv: connection.sessionIv,
    tag: connection.sessionTag,
    salt: connection.sessionSalt,
  });
}

export async function saveConnectionSession(
  connectionId: string,
  session: ProviderSession,
) {
  const blob = encryptSession(session);
  return prisma.connection.update({
    where: { id: connectionId },
    data: {
      encryptedSession: blob.ciphertext,
      sessionIv: blob.iv,
      sessionTag: blob.tag,
      sessionSalt: blob.salt,
      sessionUpdatedAt: new Date(),
      status: "CONNECTED",
      lastError: null,
    },
  });
}

export async function connectProvider(params: {
  userId: string;
  providerKey: string;
  login: string;
  password: string;
  cityOrEntity?: string;
  portalUrl?: string;
}) {
  const provider = getProvider(params.providerKey);
  if (!provider) {
    throw new Error("Provedor não suportado");
  }

  const result = await provider.connect({
    login: params.login,
    password: params.password,
    cityOrEntity: params.cityOrEntity,
    portalUrl: params.portalUrl,
  });

  if (!result.ok || !result.session) {
    return result;
  }

  const cityOrEntity = result.cityOrEntity ?? params.cityOrEntity ?? "default";
  const blob = encryptSession(result.session);
  const metadata = {
    loginHint: result.session.meta?.loginHint ?? null,
    portalUrl: result.session.meta?.portalUrl ?? params.portalUrl ?? null,
  };

  const connection = await prisma.connection.upsert({
    where: {
      userId_providerKey_cityOrEntity: {
        userId: params.userId,
        providerKey: provider.key,
        cityOrEntity,
      },
    },
    create: {
      userId: params.userId,
      providerKey: provider.key,
      providerKind: provider.kind,
      displayName: result.displayName ?? provider.name,
      cityOrEntity,
      status: "CONNECTED",
      encryptedSession: blob.ciphertext,
      sessionIv: blob.iv,
      sessionTag: blob.tag,
      sessionSalt: blob.salt,
      sessionUpdatedAt: new Date(),
      metadata,
    },
    update: {
      displayName: result.displayName ?? provider.name,
      status: "CONNECTED",
      encryptedSession: blob.ciphertext,
      sessionIv: blob.iv,
      sessionTag: blob.tag,
      sessionSalt: blob.salt,
      sessionUpdatedAt: new Date(),
      lastError: null,
      metadata,
    },
  });

  return { ...result, connectionId: connection.id };
}

export async function syncConnection(userId: string, connectionId: string) {
  const connection = await prisma.connection.findFirst({
    where: { id: connectionId, userId },
  });
  if (!connection) throw new Error("Conexão não encontrada");

  const provider = getProvider(connection.providerKey);
  if (!provider) throw new Error("Provedor não suportado");

  const session = connectionSession(connection);
  if (!session) {
    await prisma.connection.update({
      where: { id: connection.id },
      data: { status: "ERROR", lastError: "Sessão ausente" },
    });
    return { ok: false, message: "Sessão ausente. Reconecte.", items: [], needsReconnect: true };
  }

  const result = await provider.sync(session);

  if (result.needsReconnect) {
    await prisma.connection.update({
      where: { id: connection.id },
      data: {
        status: "ERROR",
        lastError: result.message,
        encryptedSession: null,
        sessionIv: null,
        sessionTag: null,
        sessionSalt: null,
      },
    });
    return result;
  }

  // Refresh encrypted session if adapter mutated storageState
  await saveConnectionSession(connection.id, session);

  if (result.ok) {
    for (const item of result.items) {
      await prisma.ticket.upsert({
        where: {
          userId_providerKey_externalId_year: {
            userId,
            providerKey: connection.providerKey,
            externalId: item.externalId,
            year: item.year ?? 0,
          },
        },
        create: {
          userId,
          connectionId: connection.id,
          providerKey: connection.providerKey,
          externalId: item.externalId,
          year: item.year ?? null,
          digit: item.digit ?? null,
          title: item.title ?? null,
          status: item.status ?? null,
          payload: (item.payload as Prisma.InputJsonValue | undefined) ?? undefined,
          syncedAt: new Date(),
        },
        update: {
          connectionId: connection.id,
          digit: item.digit ?? null,
          title: item.title ?? null,
          status: item.status ?? null,
          payload: (item.payload as Prisma.InputJsonValue | undefined) ?? undefined,
          syncedAt: new Date(),
        },
      });
    }

    await prisma.connection.update({
      where: { id: connection.id },
      data: { lastSyncAt: new Date(), status: "CONNECTED", lastError: null },
    });
  } else {
    await prisma.connection.update({
      where: { id: connection.id },
      data: { status: "ERROR", lastError: result.message },
    });
  }

  return result;
}
