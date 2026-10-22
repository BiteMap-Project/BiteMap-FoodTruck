import { defineConfig, devices } from "@playwright/test";

if (!/^bitemap-e2e-[a-f0-9]{8}$/.test(process.env.BITEMAP_E2E_PROJECT ?? "")) {
  throw new Error("Run npm run test:e2e; tests may only use the disposable Compose stack.");
}

export default defineConfig({
  testDir: "./e2e",
  outputDir: "./test-results",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 90_000,
  expect: { timeout: 15_000 },
  reporter: [["list"], ["html", { outputFolder: "playwright-report", open: "never" }]],
  use: {
    ...devices["Desktop Chrome"],
    baseURL: "http://127.0.0.1:15173",
    trace: process.env.CI ? "off" : "retain-on-failure",
    screenshot: "only-on-failure",
  },
});
