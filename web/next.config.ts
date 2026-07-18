import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  serverExternalPackages: ["playwright", "@prisma/client", "bcryptjs"],
};

export default nextConfig;
