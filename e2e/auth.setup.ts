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

  // Wait until we land on the post-sign-in router or a secure page
  await page.waitForURL(/.*(\/post-sign-in|\/clinic|\/portal|\/ops).*/, { timeout: 20000 }).catch(() => {
    console.log('Did not detect typical post-auth URL. Continuing anyway to save state.');
  });
  
  // Wait for the network to be idle to ensure cookies are persisted
  await page.waitForLoadState('networkidle');

  await page.context().storageState({ path: authFile });
});
