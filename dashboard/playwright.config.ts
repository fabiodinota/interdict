import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright configuration for Interdict Dashboard E2E smoke tests.
 *
 * Default baseURL is http://localhost:3000 (Next.js dev server).
 * Override with PLAYWRIGHT_BASE_URL env var for docker-compose runs
 * (e.g. PLAYWRIGHT_BASE_URL=http://localhost:8080).
 */
export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  retries: 1,
  reporter: [["html", { open: "never" }]],
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000",
    headless: true,
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "smoke",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
