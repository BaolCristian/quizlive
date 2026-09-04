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
    // Workspace locali e strumenti: non sono sorgenti del repo.
    ".worktrees/**",
    ".claire/**",
    // Bundle Numbas vendorizzato/scaricato: non è sorgente nostro.
    "packages/engine/oracle/**",
    ".numbas-upstream/**",
  ]),
]);

export default eslintConfig;
