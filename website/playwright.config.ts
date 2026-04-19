import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  timeout: 30_000,
  retries: 0,
  use: {
    headless: true,
    viewport: { width: 1280, height: 800 },
  },
  webServer: {
    command: 'npm run dev -- --host 127.0.0.1 --port 4321',
    url: 'http://127.0.0.1:4321/pnxt/',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
