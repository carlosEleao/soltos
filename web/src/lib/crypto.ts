import { createCipheriv, createDecipheriv, createHash, randomBytes, scryptSync } from "crypto";
import { env } from "@/lib/env";

const ALGO = "aes-256-gcm";

function masterKey(): Buffer {
  const raw = env.sessionEncryptionKey();
  const buf = Buffer.from(raw, "base64");
  if (buf.length !== 32) {
    throw new Error("SESSION_ENCRYPTION_KEY must be 32 bytes (base64-encoded)");
  }
  return buf;
}

export type EncryptedBlob = {
  ciphertext: string;
  iv: string;
  tag: string;
  salt: string;
};

/** Encrypt JSON-serializable provider session data at rest. */
export function encryptSession(data: unknown): EncryptedBlob {
  const salt = randomBytes(16);
  const key = scryptSync(masterKey(), salt, 32);
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGO, key, iv);
  const plaintext = Buffer.from(JSON.stringify(data), "utf8");
  const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    ciphertext: encrypted.toString("base64"),
    iv: iv.toString("base64"),
    tag: tag.toString("base64"),
    salt: salt.toString("base64"),
  };
}

export function decryptSession<T = unknown>(blob: EncryptedBlob): T {
  const salt = Buffer.from(blob.salt, "base64");
  const key = scryptSync(masterKey(), salt, 32);
  const iv = Buffer.from(blob.iv, "base64");
  const tag = Buffer.from(blob.tag, "base64");
  const decipher = createDecipheriv(ALGO, key, iv);
  decipher.setAuthTag(tag);
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(blob.ciphertext, "base64")),
    decipher.final(),
  ]);
  return JSON.parse(decrypted.toString("utf8")) as T;
}

export function hashToken(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

export function generateMcpToken(): { raw: string; hash: string; prefix: string } {
  const raw = `mcp_${randomBytes(32).toString("base64url")}`;
  return {
    raw,
    hash: hashToken(raw),
    prefix: raw.slice(0, 12),
  };
}
