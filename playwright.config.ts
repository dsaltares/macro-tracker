import { defineConfig, devices } from '@playwright/test';

const isCI = !!process.env.CI;
const port = Number(process.env.E2E_PORT) || 3015;
const againstDevServer = process.env.E2E_SERVER === 'dev';
const baseURL = `http://localhost:${port}`;

export const e2eDatabaseUrl = '.data/e2e.sqlite';

export const e2eDistDir = '.next-e2e';

export const e2eOutboxDir = '.data/e2e-outbox';

export const e2eGoogleClientId = 'e2e-google-client.apps.googleusercontent.com';

// next dev rewrites its prerender manifest in place and compiles each route
// on its first request, so under parallel workers a request reads the
// manifest half-written or a navigation outlasts its assertion. A production
// build does neither, which is why it is the default and dev is opt-in.
const prepareDatabase =
  'node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON e2e/prepare-database.ts';

const serverCommand = againstDevServer
  ? `${prepareDatabase} && yarn next dev --port ${port}`
  : `yarn next build && ${prepareDatabase} && yarn next start --port ${port}`;

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: isCI,
  retries: isCI ? 2 : 0,
  reporter: isCI
    ? [['github'], ['html', { open: 'never' }]]
    : [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL,
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'desktop-chrome',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'mobile-chrome',
      use: { ...devices['Pixel 7'] },
    },
  ],
  webServer: {
    command: serverCommand,
    url: baseURL,
    reuseExistingServer: false,
    timeout: 300_000,
    env: {
      NEXT_DIST_DIR: e2eDistDir,
      NEXT_TELEMETRY_DISABLED: '1',
      DATABASE_URL: e2eDatabaseUrl,
      FOOD_IMPORT_CRON: '',
      DISABLE_AUTH_RATE_LIMIT: '1',
      BETTER_AUTH_URL: baseURL,
      BETTER_AUTH_SECRET: 'a-throwaway-secret-only-the-e2e-server-signs-with',
      RESEND_API_KEY: '',
      EMAIL_FROM: '',
      EMAIL_OUTBOX_DIR: e2eOutboxDir,
      FOOD_DELTA_CRON: '',
      GOOGLE_CLIENT_ID: e2eGoogleClientId,
      GOOGLE_CLIENT_SECRET: 'a-throwaway-secret-google-never-sees',
    },
  },
});
