import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e', fullyParallel: false, retries: 1,
  use: { baseURL: 'http://127.0.0.1:4173/dinner-party-planner/', trace: 'on-first-retry' },
  webServer: { command: 'pnpm run dev --host 127.0.0.1 --port 4173', url: 'http://127.0.0.1:4173/dinner-party-planner/', reuseExistingServer: true },
  projects: [{ name: 'desktop', use: { ...devices['Desktop Chrome'] } }, { name: 'mobile', use: { ...devices['iPhone 13'] } }],
});

