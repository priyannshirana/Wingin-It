import path from "node:path";
import { fileURLToPath } from "node:url";
import tailwind from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

const here = path.dirname(fileURLToPath(import.meta.url));
const proxyTarget = process.env.VITE_PROXY_TARGET ?? "http://localhost:8000";

// §F2: content lives outside the client root; docker compose mounts it at CONTENT_DIR=/content.
export default defineConfig({
  plugins: [react(), tailwind()],
  resolve: {
    alias: { "@content": process.env.CONTENT_DIR ?? path.resolve(here, "../content") },
  },
  server: {
    fs: { allow: [".."] },
    proxy: {
      "/api": { target: proxyTarget, changeOrigin: true },
      "/clips": { target: proxyTarget, changeOrigin: true },
      "/ws": { target: proxyTarget.replace("http", "ws"), ws: true },
    },
  },
  test: {
    environment: "jsdom",
    include: ["tests/**/*.test.{ts,tsx}"],
  },
});
