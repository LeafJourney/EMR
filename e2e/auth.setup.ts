import { test as setup, expect } from '@playwright/test';
import { dirname, resolve } from 'node:path';
import { mkdirSync } from 'node:fs';

const authFile = resolve('.auth/clerk.json');

setup('authenticate as test user', async ({ page }) => {
  // We only run this if TEST_USER_EMAIL is provided in CI/locally
  if (!process.env.TEST_USER_EMAIL || !process.env.TEST_USER_PASSWORD) {
    console.log('Skipping auth setup: TEST_USER_EMAIL or TEST_USER_PASSWORD not set');
    return;
  }

  mkdirSync(dirname(authFile), { recursive: true });

  await page.goto('/sign-in');

  // Fill in email
  await page.waitForSelector('input[name="identifier"]');
  await page.fill('input[name="identifier"]', process.env.TEST_USER_EMAIL);
  // Click continue
  await page.click('button:has-text("Continue")'); // Clerk standard button

  // Fill in password
  await page.waitForSelector('input[name="password"]');
  await page.fill('input[name="password"]', process.env.TEST_USER_PASSWORD);
  // Click continue
  await page.click('button:has-text("Continue")');

  // Wait until we land on the post-sign-in router or a secure page.
  // Fail loudly here rather than swallowing — if this doesn't match, the
  // cookie wait below will time out with a misleading message.
  await page.waitForURL(/.*(\/post-sign-in|\/clinic|\/portal|\/ops).*/, { timeout: 30000 });

  // Wait until Clerk's session cookie is persisted. Don't use
  // waitForLoadState('networkidle') — Clerk does background session polling
  // (v1/environment, client/me, etc.) so the page never reaches networkidle
  // and the wait times out at 60s.
  await expect
    .poll(
      async () => {
        const cookies = await page.context().cookies();
        return cookies.some((c) => c.name === '__session' || c.name.startsWith('__session_'));
      },
      { timeout: 15000, message: 'Clerk __session cookie was not set after sign-in' },
    )
    .toBe(true);

  await page.context().storageState({ path: authFile });
});
