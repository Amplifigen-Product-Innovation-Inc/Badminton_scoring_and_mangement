import { test, expect } from "@playwright/test";

/**
 * Tooling smoke test only — confirms Playwright + webServer wiring works against
 * the real login page. Real e2e coverage (full admin/scorer acceptance flow, §67)
 * lands in Phase 8.3 once there's an actual dev/test Supabase project to run
 * against — these tests need `.env.local` populated and are not meaningful without it.
 */
test("login page renders the sign-in form", async ({ page }) => {
  await page.goto("/login");
  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
  await expect(page.getByPlaceholder("you@email.com")).toBeVisible();
});
