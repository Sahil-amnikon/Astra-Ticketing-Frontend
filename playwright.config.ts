import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests/e2e',
  use: { baseURL: process.env.E2E_BASE_URL ?? 'http://127.0.0.1:3000' },
  reporter: 'list',
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : [
        {
          command: 'node apps/api/dist/src/main.js',
          env: { API_HOST: '127.0.0.1', PORT: '3001' },
          url: 'http://127.0.0.1:3001/health',
          reuseExistingServer: false,
          timeout: 60000,
        },
        {
          command: 'npm run start --workspace @amnikon/web',
          env: { HOSTNAME: '127.0.0.1', PORT: '3000' },
          url: 'http://127.0.0.1:3000/health',
          reuseExistingServer: false,
          timeout: 60000,
        },
      ],
});
