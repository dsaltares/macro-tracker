import { defineConfig, devices } from '@playwright/test';

const isCI = !!process.env.CI;
const port = Number(process.env.E2E_PORT) || 3015;
const againstDevServer = process.env.E2E_SERVER === 'dev';
const baseURL = `http://localhost:${port}`;

export const e2eDatabaseUrl = '.data/e2e.sqlite';

export const e2eDistDir = '.next-e2e';

// next dev rewrites its prerender manifest in place and compiles each route
// on its first request, so under parallel workers a request reads the
// manifest half-written or a navigation outlasts its assertion. A production
// build does neither, which is why it is the default and dev is opt-in.
const serverCommand = againstDevServer
  ? `yarn next dev --port ${port}`
  : `yarn next build && yarn next start --port ${port}`;

export default defineConfig({
  testDir: './e2e',
  globalSetup: './e2e/global-setup.ts',
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
    },
  },
});
