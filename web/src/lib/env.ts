function required(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;
  if (!value) {
    throw new Error(`Missing env var: ${name}`);
  }
  return value;
}

export const env = {
  appUrl: () => required("APP_URL", process.env.AUTH_URL ?? "http://localhost:3000"),
  authSecret: () => required("AUTH_SECRET", process.env.NEXTAUTH_SECRET),
  databaseUrl: () => required("DATABASE_URL"),
  sessionEncryptionKey: () => required("SESSION_ENCRYPTION_KEY"),
  playwrightHeadless: () => process.env.PLAYWRIGHT_HEADLESS !== "false",
};
