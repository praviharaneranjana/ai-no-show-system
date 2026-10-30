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
    // Electron main-process scripts: plain CommonJS Node, not part of the
    // Next.js app bundle, so the app's TS/React lint rules don't apply.
    "electron/**",
    "dist-electron/**",
    // Build-time Node script and the vendored MapLibre worker it copies into /public.
    "scripts/**",
    "public/maplibre/**",
  ]),
]);

export default eslintConfig;
