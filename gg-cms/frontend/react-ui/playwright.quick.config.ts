import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false, retries: 1, workers: 1, timeout: 45000,
  reporter: [["list"]],
  use: { baseURL: "http://localhost:8080", trace: "off", screenshot: "only-on-failure", actionTimeout: 10000 },
  projects: [{ name: "chrome", use: { channel: "chrome" } }],
});
