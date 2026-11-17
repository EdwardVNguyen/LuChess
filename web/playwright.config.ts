import { defineConfig, devices } from '@playwright/test'

// The browser test of the core flow (`npm run e2e`, #43). e2e/stack.ts starts
// Postgres, the API and the app before it runs; see web/README.md.
export default defineConfig({
  testDir: 'e2e',
  outputDir: 'e2e-results',
  globalSetup: './e2e/stack.ts',
  // One try, so a flaky step shows up instead of passing on a retry.
  retries: 0,
  workers: 1,
  forbidOnly: true,
  reporter: 'list',
  // Covers the builds and the whole flow, which waits on real requests
  timeout: 60_000,
  use: {
    ...devices['Desktop Chrome'],
    viewport: { width: 1440, height: 1080 },
    trace: 'retain-on-failure',
  },
})
