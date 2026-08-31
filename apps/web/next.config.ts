import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Aligns with the monorepo's existing dist/** convention (packages/shared, apps/worker
  // all build to dist/) so root turbo.json's build.outputs doesn't need a Next-specific
  // second glob pattern.
  distDir: "dist",
};

export default nextConfig;
