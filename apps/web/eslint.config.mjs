import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // next.config.ts sets distDir to "dist" (matches the monorepo's other packages'
    // build output convention), so it needs the same treatment as ".next/**" above.
    "dist/**",
  ]),
]);

export default eslintConfig;
