import { defineConfig, devices } from '@playwright/test';
import path from 'path';

export const STORAGE_STATE = path.join(__dirname, '.auth/clerk.json');

export default defineConfig({
  testDir: './e2e',
  timeout: 60000,
  use: {
    baseURL: process.env.BASE_URL || 'http://localhost:3000',
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'setup',
      testMatch: /.*\.setup\.ts/,
    },
    {
      name: 'chromium-public',
      // Run all tests except those that require auth or are the setup script itself
      testIgnore: [/.*authed.*/, /.*\.setup\.ts/],
      use: {
        ...devices['Desktop Chrome'],
      },
    },
    {
      name: 'chromium-authed',
      // Only run tests matching *authed*
      testMatch: /.*authed.*/,
      dependencies: ['setup'],
      use: {
        ...devices['Desktop Chrome'],
        // Inject the auth state saved by auth.setup.ts
        storageState: STORAGE_STATE,
      },
    },
  ],
});
