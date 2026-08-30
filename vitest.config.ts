import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

/**
 * Unit/integration test config (§70 — Vitest only, no Jest). Scope per TASKS.md:
 * scoring math, deuce/cap logic, rating, tournament points, standings, tie-breaks,
 * qualification. Lives alongside source as `*.test.ts` — see playwright.config.ts
 * for e2e, which is a separate concern and separate runner.
 */
export default defineConfig({
  plugins: [react()],
  resolve: { tsconfigPaths: true },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
    exclude: ["e2e/**", "node_modules/**"],
  },
});
