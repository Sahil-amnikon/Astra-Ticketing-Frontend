import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/ui',
  timeout: 45000,
  workers: 1,
  use: {
    baseURL: process.env.UI_PREVIEW_URL ?? 'http://127.0.0.1:3100',
    viewport: { width: 1440, height: 1000 },
    trace: 'retain-on-failure',
  },
  reporter: [
    ['list'],
    ['json', { outputFile: 'artifacts/ui/test-results.json' }],
  ],
  outputDir: 'artifacts/ui/test-output',
  webServer: {
    command: 'node scripts/preview-ui.cjs',
    url: process.env.UI_PREVIEW_URL ?? 'http://127.0.0.1:3100/ui-preview',
    reuseExistingServer: true,
    timeout: 90000,
  },
});
