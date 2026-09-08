import { defineConfig } from "@playwright/test";
import fs from "node:fs";

// Prefer the environment's preinstalled Chromium when the default download is absent.
const chromiumPath = ["/opt/pw-browsers/chromium", "/opt/pw-browsers/chromium-1194/chrome-linux/chrome"]
  .find((p) => fs.existsSync(p));

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 60_000,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3000",
    launchOptions: chromiumPath ? { executablePath: chromiumPath } : undefined,
  },
  webServer: {
    command: "npm run dev",
    url: "http://localhost:3000/login",
    reuseExistingServer: true,
    timeout: 60_000,
  },
});
