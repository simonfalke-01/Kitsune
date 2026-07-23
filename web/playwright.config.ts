import { defineConfig, devices } from '@playwright/test';

const e2eDatabaseUrl =
  process.env.KITSUNE_E2E_DATABASE_URL ??
  process.env.DATABASE_URL ??
  'postgres://kitsune:kitsune@127.0.0.1:54329/kitsune_e2e';

export default defineConfig({
  testDir: '../tests/e2e',
  timeout: 120_000,
  fullyParallel: false,
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: process.env.KITSUNE_E2E_URL ?? 'http://localhost:4173',
    trace: 'retain-on-failure'
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile', use: { ...devices['Pixel 7'] } }
  ],
  webServer: [
    {
      command: [
        'KITSUNE__LISTEN=127.0.0.1:3000',
        'KITSUNE__FEATURES__EXTERNAL_AUTH=true',
        'KITSUNE__PUBLIC_ORIGIN=http://localhost:4173',
        'SQLX_OFFLINE=true',
        'cargo run --manifest-path ../Cargo.toml -p kitsune-server'
      ].join(' '),
      env: {
        KITSUNE__DATABASE_URL: e2eDatabaseUrl
      },
      url: 'http://127.0.0.1:3000/ready',
      reuseExistingServer: !process.env.CI,
      timeout: 120_000
    },
    {
      command: 'pnpm dev --hostname 127.0.0.1 --port 4173',
      port: 4173,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000
    }
  ]
});
