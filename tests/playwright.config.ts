import { defineConfig, devices } from "@playwright/test";

/**
 * AVIR Mind E2E config.
 * - baseURL defaults to http://localhost:3000; set AVIR_TEST_TARGET to override
 *   (e.g. https://mind.avirspace.com for smoke tests).
 * - Serialized (workers: 1, fullyParallel: false) to eliminate session-tracking
 *   flakes in parallel mode; manual verification is the authoritative quality gate.
 * - 60s test / 10s expect. Traces + screenshots on failure, no video.
 */
const TARGET = process.env.AVIR_TEST_TARGET || "http://localhost:3000";
const isRemote = Boolean(process.env.AVIR_TEST_TARGET);

export default defineConfig({
  testDir: "./modules",
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: process.env.CI
    ? [["json", { outputFile: "test-results/results.json" }], ["list"]]
    : [["html", { open: "never", outputFolder: "playwright-report" }], ["list"]],
  use: {
    baseURL: TARGET,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "off",
    actionTimeout: 15_000,
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  // Only spin up a local dev server when targeting localhost.
  webServer: isRemote ? undefined : {
    command: "pnpm dev",
    url: "http://localhost:3000/login",
    reuseExistingServer: true,
    timeout: 180_000,
  },
});
