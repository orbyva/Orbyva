import { defineConfig, devices } from "@playwright/test";
import { loadEnv } from "vite";

// Playwright não carrega .env sozinho — espelha Vite (.env, .env.local, …).
const loaded = loadEnv(process.env.MODE || "test", process.cwd(), "");
for (const [key, value] of Object.entries(loaded)) {
  if (process.env[key] === undefined) process.env[key] = value;
}

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  // Conta E2E compartilhada: 1 worker evita corrida em REST/UI da mesma base.
  workers: 1,
  globalTeardown: "./e2e/global-teardown.ts",
  reporter: "list",
  use: {
    baseURL: "http://127.0.0.1:4173",
    trace: "on-first-retry",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    // Local: rebuild pra não testar dist velho. CI: só preview (job já fez build).
    command: process.env.CI
      ? "npm run preview -- --host 127.0.0.1 --port 4173"
      : "npm run build && npm run preview -- --host 127.0.0.1 --port 4173",
    url: "http://127.0.0.1:4173",
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
});
