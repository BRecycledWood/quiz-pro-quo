import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: "list",
  use: {
    baseURL: "http://127.0.0.1:4173",
    trace: "retain-on-failure",
    ...devices["Desktop Chrome"],
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "npm run dev",
    url: "http://127.0.0.1:4173/healthz",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: {
      NODE_ENV: "development",
      PORT: "4173",
      ADMIN_KEY: "e2e-admin-key-with-at-least-32-characters",
      SEED_DEMO_DATA: "false",
      SMTP_HOST: "",
      SMTP_USER: "",
      SMTP_PASSWORD: "",
      EMAIL_FROM: "",
      LEAD_NOTIFICATION_EMAIL: "",
    },
  },
});
