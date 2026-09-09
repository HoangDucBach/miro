import type { NextConfig } from "next";

/**
 * Deliberately empty. `distDir` was set to "dist" so root turbo.json's single
 * `outputs: ["dist/**"]` glob covered this app too -- but Vercel resolves a Next build
 * through `.next/routes-manifest.json` and fails with "Routes Manifest Could Not Be
 * Found" when the output moves. Keeping the default and widening turbo's globs instead
 * means a clone deploys without anyone remembering to override Output Directory in a
 * dashboard.
 */
const nextConfig: NextConfig = {};

export default nextConfig;
