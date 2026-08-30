import { defineConfig, devices } from "@playwright/test";

/**
 * E2E config (§70 — Playwright only, no Cypress). Scope per TASKS.md 8.3 / spec §67:
 * full admin setup → scorer live scoring → qualification → cross-category →
 * historical-access acceptance walk. Tests live in ./e2e.
 *
 * Requires browsers to be installed once: `npx playwright install`.
 */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: "html",
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000",
    trace: "on-first-retry",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "npm run dev",
    url: "http://localhost:3000",
    reuseExistingServer: !process.env.CI,
  },
});
