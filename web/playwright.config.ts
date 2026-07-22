import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: '../tests/e2e',
  fullyParallel: false,
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: process.env.KITSUNE_E2E_URL ?? 'http://127.0.0.1:4173',
    trace: 'retain-on-failure'
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile', use: { ...devices['Pixel 7'] } }
  ],
  webServer: [
    {
      command: [
        'KITSUNE__DATABASE_URL=${DATABASE_URL:-postgres://kitsune:kitsune@127.0.0.1:5432/kitsune}',
        'KITSUNE__LISTEN=127.0.0.1:3000',
        'cargo run --manifest-path ../Cargo.toml -p kitsune-server'
      ].join(' '),
      url: 'http://127.0.0.1:3000/ready',
      reuseExistingServer: !process.env.CI,
      timeout: 120_000
    },
    {
      command: 'pnpm dev --host 127.0.0.1 --port 4173',
      port: 4173,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000
    }
  ]
});
