import type { NextConfig } from "next";
import path from "node:path";

const monorepoRoot = path.join(__dirname, "..");

const nextConfig: NextConfig = {
  output: "standalone",
  // pnpm workspace root (avoids wrong lockfile / tracing root inference)
  outputFileTracingRoot: monorepoRoot,
  turbopack: {
    root: monorepoRoot,
  },
  serverExternalPackages: ["playwright", "@prisma/client", "bcryptjs"],
};

export default nextConfig;
