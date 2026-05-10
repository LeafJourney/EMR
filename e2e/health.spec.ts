import { test, expect } from '@playwright/test';

test.describe('Platform Smoke Tests', () => {
  test('API health check passes', async ({ request }) => {
    const response = await request.get('/api/health');
    expect(response.status()).toBe(200);
    
    const body = await response.json();
    expect(body.ok).toBe(true);
    expect(body.db).toBe('ok');
    expect(body.service).toBe('web');
  });

  test('Homepage loads correctly', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveTitle(/Leafjourney|Verdant/i);
    await expect(page.locator('main')).toBeVisible();
  });

  test('Sign-in route is accessible', async ({ page }) => {
    await page.goto('/sign-in');
    await expect(page.locator('body')).toBeVisible();
    const title = await page.title();
    expect(title.length).toBeGreaterThan(0);
  });
});
