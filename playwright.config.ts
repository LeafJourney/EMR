import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  timeout: 60000,
  // EMR-758 — probes /api/health before any spec runs so a stuck dev server
  // (stale .next/cache) fails fast with an actionable message instead of
  // producing a sea of false-positive 500-page test failures.
  globalSetup: require.resolve('./e2e/global-setup.ts'),
  use: {
    baseURL: process.env.BASE_URL || 'http://localhost:3000',
  },
});
