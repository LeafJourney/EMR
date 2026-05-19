// Find-and-fix loop, pass 11 — mobile viewport + edge-of-the-site
// coverage.
//
// What this catches that the other passes miss:
//
// 1. Mobile portrait nav (`MobilePortraitNav`, used on viewports < md)
//    is hidden on desktop, so passes 7/8/9 never touch it. The
//    duplicate-key bug fixed in PR #353 lived there for weeks before
//    pass 8 surfaced it.
//
// 2. /sitemap.xml + /robots.txt — silent failures here hurt SEO and
//    are easy to regress when middleware grows.
//
// 3. 404 page renders branded UI, not a Next.js default error. A
//    bad 404 page is the last thing a visitor sees before bouncing.
//
// 4. Trailing-slash behavior — common URL-handling regression.
//
// 5. /api/health — the canonical "is the platform up" probe; passes
//    1-10 use it as a smoke gate so it must answer quickly + correctly.

import { test, expect } from "@playwright/test";

// iPhone 13 portrait. Use setViewportSize in beforeEach rather than
// `test.use({ ...devices })` inside the describe — Playwright forbids
// `test.use` of worker-affecting properties inside `test.describe`.
// Layout breakpoints are the only thing we need for this pass; the
// browser engine doesn't have to change.
const MOBILE_VIEWPORT = { width: 390, height: 844 };

test.describe("Mobile viewport — pass 11", () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize(MOBILE_VIEWPORT);
  });

  test("MobilePortraitNav renders nav buttons on landing", async ({ page }) => {
    await page.goto("/", { waitUntil: "networkidle", timeout: 30_000 });
    const buttons = page.locator(
      'nav[aria-label="Site navigation"] button',
    );
    const count = await buttons.count();
    expect(
      count,
      "expected ≥4 nav buttons in MobilePortraitNav",
    ).toBeGreaterThanOrEqual(4);
  });

  test("MobilePortraitNav LeafMart tile links to /leafmart (regression PR #353)", async ({
    page,
  }) => {
    // Both LeafMart and Marketplace mobile-nav tiles previously pointed
    // at `https://www.theleafmart.com/`, duplicating the React key and
    // routing visitors off the in-app surface. PR #353 fixed it; this
    // test prevents the regression.
    await page.goto("/", { waitUntil: "networkidle" });
    const leafmartTile = page
      .locator('nav[aria-label="Site navigation"] a[href="/leafmart"]')
      .first();
    await expect(leafmartTile).toBeVisible();
  });

  test("MobilePortraitNav Marketplace tile links to /marketplace", async ({
    page,
  }) => {
    await page.goto("/", { waitUntil: "networkidle" });
    const marketplaceTile = page
      .locator('nav[aria-label="Site navigation"] a[href="/marketplace"]')
      .first();
    await expect(marketplaceTile).toBeVisible();
  });
});

test.describe("Edge surfaces — pass 11", () => {
  test("/api/health returns { ok, db, service }", async ({ request }) => {
    const res = await request.get("/api/health");
    expect(res.status(), "/api/health must always be 200").toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.db).toBeDefined();
    expect(body.service).toBeDefined();
  });

  test("/sitemap.xml returns 200 with non-empty XML", async ({ request }) => {
    const res = await request.get("/sitemap.xml");
    expect(res.status()).toBe(200);
    const xml = await res.text();
    expect(xml.length).toBeGreaterThan(50);
    const locs = Array.from(xml.matchAll(/<loc>([^<]+)<\/loc>/g));
    expect(
      locs.length,
      "sitemap should reference at least one URL",
    ).toBeGreaterThan(0);
  });

  test("/robots.txt returns 200 with text", async ({ request }) => {
    const res = await request.get("/robots.txt");
    expect(res.status()).toBe(200);
    const body = await res.text();
    expect(body.length).toBeGreaterThan(0);
  });

  test("404 page renders branded UI for unknown route", async ({ page }) => {
    const res = await page.goto("/this-url-does-not-exist", {
      waitUntil: "networkidle",
    });
    expect(res?.status() ?? 0, "unknown route should return 404").toBe(404);
    await expect(page.locator("h1, h2").first()).toBeVisible();
    const text = await page.locator("body").innerText();
    expect(
      /doesn'?t lead|not found|404/i.test(text),
      "404 page should display a recognizable branded message",
    ).toBe(true);
  });

  test("trailing slash on /about does not 404 or loop", async ({ request }) => {
    const res = await request.get("/about/", {
      maxRedirects: 0,
      failOnStatusCode: false,
    });
    expect(res.status(), `unexpected status ${res.status()} on /about/`).toBeLessThan(400);
  });
});
