import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests/browser",
  workers: 1,
  use: { baseURL: "http://127.0.0.1:4173", viewport: { width: 1280, height: 800 } },
  webServer: { command: "npm run preview", url: "http://127.0.0.1:4173", reuseExistingServer: !process.env.CI }
});
