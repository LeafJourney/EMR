// ux/mobile-portrait-ios-polish — verify Apple HIG tap targets, safe-area
// insets, and viewport-fit:cover behavior across three real-world iPhone
// + iPad viewports. Each test runs against the public landing page (no
// auth required) so it stays in the chromium-public project.
//
// The spec is intentionally tolerant: it only fails if a meaningful
// regression occurs (e.g. a navigation chip shrinks below 44px or the
// viewport meta loses viewport-fit:cover). It does NOT assert exact
// pixel widths because those depend on theme overrides.

import { test, expect, type Page } from "@playwright/test";

const VIEWPORTS = [
  { name: "iPhone 13 (375x812)", width: 375, height: 812 },
  { name: "iPhone 15 Pro Max (430x932)", width: 430, height: 932 },
  { name: "iPad mini portrait (744x1133)", width: 744, height: 1133 },
] as const;

// Apple Human Interface Guidelines minimum tap target — 44pt × 44pt.
const MIN_TAP_TARGET_PX = 44;

async function gotoLanding(page: Page) {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  // Give MobilePortraitNav's IntersectionObserver / scroll listener a
  // tick to attach before we probe geometry.
  await page.waitForTimeout(150);
}

test.describe("mobile portrait iOS polish", () => {
  test("viewport meta declares viewport-fit:cover for safe-area-inset", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await gotoLanding(page);
    const content = await page
      .locator('meta[name="viewport"]')
      .first()
      .getAttribute("content");
    expect(content, "viewport meta tag must be emitted").toBeTruthy();
    // Next ships the meta tag from the Viewport export; we assert both
    // device-width (any modern PWA) and viewport-fit (iOS-specific).
    expect(content).toMatch(/width=device-width/);
    expect(content).toMatch(/viewport-fit=cover/);
  });

  for (const vp of VIEWPORTS) {
    test(`MobilePortraitNav chips hit the 44pt minimum at ${vp.name}`, async ({ page }) => {
      // iPad mini portrait actually still hits the `md:hidden` breakpoint
      // (Tailwind's md = 768px) on the 744px wide iPad mini, so the
      // MobilePortraitNav renders. iPhone-class viewports trivially do.
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await gotoLanding(page);

      // The nav lives in the landing-page hero region. We locate it by
      // aria-label which is stable across redesigns.
      const nav = page.locator('nav[aria-label="Site navigation"]');
      if ((await nav.count()) === 0) {
        test.skip(true, "MobilePortraitNav not mounted on this surface");
        return;
      }

      const chips = nav.locator("button[aria-pressed]");
      const count = await chips.count();
      expect(count, "group selector chips render").toBeGreaterThan(0);

      for (let i = 0; i < count; i++) {
        const box = await chips.nth(i).boundingBox();
        expect(box, `chip ${i} has bounding box`).not.toBeNull();
        if (!box) continue;
        expect(box.height, `chip ${i} height ≥ 44pt`).toBeGreaterThanOrEqual(
          MIN_TAP_TARGET_PX - 1, // sub-pixel tolerance for fractional rounding
        );
      }
    });

    test(`MobilePortraitNav dot indicators have 44pt hit area at ${vp.name}`, async ({ page }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await gotoLanding(page);

      const dots = page.locator(
        'nav[aria-label="Site navigation"] button[aria-label^="Show "]',
      );
      const count = await dots.count();
      if (count === 0) {
        test.skip(true, "dots not present");
        return;
      }
      for (let i = 0; i < count; i++) {
        const box = await dots.nth(i).boundingBox();
        if (!box) continue;
        expect(
          box.width,
          `dot ${i} width is a 44pt thumb target`,
        ).toBeGreaterThanOrEqual(MIN_TAP_TARGET_PX - 1);
        expect(
          box.height,
          `dot ${i} height is a 44pt thumb target`,
        ).toBeGreaterThanOrEqual(MIN_TAP_TARGET_PX - 1);
      }
    });
  }

  test("feedback FAB respects safe-area-inset on iPhone viewports", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await gotoLanding(page);
    const fab = page.locator('button[aria-label="Send feedback"]');
    await expect(fab).toBeVisible();
    const styles = await fab.evaluate((el) => ({
      bottom: getComputedStyle(el).bottom,
      right: getComputedStyle(el).right,
      width: el.getBoundingClientRect().width,
      height: el.getBoundingClientRect().height,
    }));
    // Chrome resolves env(safe-area-inset-*) to 0 in standard tabs so
    // the calc() falls back to 1.25rem (20px). The bottom should at
    // least be > 0 (visible above the viewport bottom).
    expect(parseFloat(styles.bottom)).toBeGreaterThan(0);
    // Apple HIG 44pt minimum on phone breakpoint.
    expect(styles.width).toBeGreaterThanOrEqual(MIN_TAP_TARGET_PX);
    expect(styles.height).toBeGreaterThanOrEqual(MIN_TAP_TARGET_PX);
  });

  test("input font-size ≥ 16px on phone viewport (prevents iOS auto-zoom)", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto("/sign-in", { waitUntil: "domcontentloaded" });
    // Find the first text-like input that's not a checkbox/radio.
    const input = page
      .locator(
        'input:not([type="checkbox"]):not([type="radio"]):not([type="range"]):not([type="color"]):not([type="hidden"])',
      )
      .first();
    if ((await input.count()) === 0) {
      test.skip(true, "no plain input on sign-in form (Clerk might own it)");
      return;
    }
    const size = await input.evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
    // iOS Safari zooms when a focused input has fontSize < 16. Our
    // media-query override forces 16. Allow tiny rounding margin.
    expect(size).toBeGreaterThanOrEqual(15.9);
  });
});
