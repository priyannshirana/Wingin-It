import js from "@eslint/js";
import { defineConfig } from "eslint/config";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import globals from "globals";
import tseslint from "typescript-eslint";

export default defineConfig(
  { ignores: ["dist", "node_modules", "test-results", "playwright-report", "e2e/__screenshots__"] },
  {
    files: ["**/*.{ts,tsx}"],
    extends: [js.configs.recommended, tseslint.configs.recommendedTypeChecked],
    languageOptions: {
      ecmaVersion: 2023,
      globals: globals.browser,
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
    plugins: { "react-hooks": reactHooks, "react-refresh": reactRefresh },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "react-refresh/only-export-components": ["warn", { allowConstantExport: true }],
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
      "@typescript-eslint/no-non-null-assertion": "error",
      "@typescript-eslint/switch-exhaustiveness-check": "error",
      // console.log only behind `if (DEV)` — use console.debug for those; warn/error are allowed.
      "no-console": ["error", { allow: ["warn", "error", "debug"] }],
    },
  },
  {
    // Node-side config and e2e files
    files: ["vite.config.ts", "playwright.config.ts", "e2e/**/*.ts"],
    languageOptions: { globals: globals.node },
  },
  {
    // Plain JS: this config file, and the AudioWorklet (runs in AudioWorkletGlobalScope).
    files: ["**/*.js"],
    extends: [js.configs.recommended],
    languageOptions: { ecmaVersion: 2023, sourceType: "module", globals: globals.node },
  },
  {
    files: ["src/audio/pcm-worklet.js"],
    languageOptions: { globals: globals.audioWorklet },
  },
);
