import { defineConfig, devices } from '@playwright/test';
export default defineConfig({
  testDir: './tests/e2e', fullyParallel: false, workers: 1,
  use: { baseURL: 'http://127.0.0.1:4400', trace: 'retain-on-failure' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    { command: 'npm run start --workspace apps/api', url: 'http://127.0.0.1:3300/products', timeout: 60000,
      env: { NODE_ENV: 'test', PORT: '3300', DATA_DIR: 'memory://', DATABASE_URL: '', ADMIN_TOKEN: 'e2e-isolated-admin-token-for-tests', CDN_MODE: 'simulated', ALLOW_DEMO_FAILURES: 'true', PURGE_POLL_MS: '100' } },
    { command: 'npm run start --workspace apps/web -- --hostname 127.0.0.1 --port 4400', url: 'http://127.0.0.1:4400', timeout: 60000,
      env: { NODE_ENV: 'production', API_BASE_URL: 'http://127.0.0.1:3300' } },
  ],
});
