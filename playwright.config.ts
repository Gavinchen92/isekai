import { defineConfig, devices } from "@playwright/test";
import { tmpdir } from "node:os";
import { join } from "node:path";

const apiUrl = "http://127.0.0.1:8788";
const baseUrl = "http://127.0.0.1:5174";
const e2eDatabasePath = join(tmpdir(), "isekai-e2e", `isekai-${process.pid}.sqlite`);

export default defineConfig({
  forbidOnly: Boolean(process.env.CI),
  fullyParallel: false,
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"]
      }
    }
  ],
  reporter: process.env.CI
    ? [["github"], ["html", { open: "never" }]]
    : [["list"], ["html", { open: "never" }]],
  retries: process.env.CI ? 2 : 0,
  testDir: "./tests/e2e",
  use: {
    baseURL: baseUrl,
    screenshot: "only-on-failure",
    trace: "retain-on-failure"
  },
  webServer: [
    {
      command: "pnpm start",
      env: {
        GM_PROVIDER: "mock",
        HOST: "127.0.0.1",
        ISEKAI_DB_PATH: e2eDatabasePath,
        NODE_ENV: "test",
        PORT: "8788"
      },
      name: "api",
      reuseExistingServer: false,
      timeout: 120_000,
      url: `${apiUrl}/api/health`
    },
    {
      command: "pnpm exec vite --host 127.0.0.1 --port 5174 --strictPort",
      env: {
        ISEKAI_API_ORIGIN: apiUrl
      },
      name: "web",
      reuseExistingServer: false,
      timeout: 120_000,
      url: baseUrl
    }
  ],
  workers: 1
});
