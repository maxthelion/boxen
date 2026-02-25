/// <reference types="node" />
import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright configuration for Boxen e2e tests.
 *
 * Tests run against the dev server (localhost:5173) in a real browser.
 * This tests R3F/Three.js interactions that cannot be exercised from unit tests.
 *
 * See CLAUDE.md §Playwright Testing for guidance on state setup via share links.
 */
export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false, // 3D interactions can be flaky if parallelized
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: 'html',
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  // Do NOT auto-start the dev server here — tests assume `npm run dev` is running.
  // This allows tests to run against an already-running server without managing lifecycle.
  // To run with auto-start: uncomment webServer below.
  //
  // webServer: {
  //   command: 'npm run dev',
  //   url: 'http://localhost:5173',
  //   reuseExistingServer: true,
  // },
});
