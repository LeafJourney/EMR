import { test, expect, type Page } from "@playwright/test";
import { existsSync } from "node:fs";

const AUTH_FILE = ".auth/clerk.json";
const PUBLIC_ROUTES = ["/kiosk"];
const AUTHED_ROUTES = ["/portal", "/ops/queue", "/clinic"];

async function assertNoServerCrash(page: Page) {
  const body = await page.locator("body").innerText();
  expect(body).not.toContain("Something went wrong");
  expect(body).not.toContain("We couldn't load that");
  expect(body).not.toContain("An error occurred in the Server Components render");
  expect(body).not.toContain("[object Object]");
}

test.describe("Golden Visit route smoke", () => {
  for (const route of PUBLIC_ROUTES) {
    test(`public surface loads: ${route}`, async ({ page, request }) => {
      const res = await request.get(route, { maxRedirects: 0 });
      expect(res.status()).toBeLessThan(500);

      const pageRes = await page.goto(route, { waitUntil: "domcontentloaded" });
      expect(pageRes?.status() ?? 200).toBeLessThan(500);
      await assertNoServerCrash(page);
    });
  }

  test.describe("authenticated surfaces", () => {
    test.skip(
      !existsSync(AUTH_FILE) && (!process.env.TEST_USER_EMAIL || !process.env.TEST_USER_PASSWORD),
      "Golden Visit authed smoke requires .auth/clerk.json or TEST_USER_EMAIL/TEST_USER_PASSWORD.",
    );

    for (const route of AUTHED_ROUTES) {
      test(`authed surface loads: ${route}`, async ({ page, request }) => {
        const res = await request.get(route, { maxRedirects: 2 });
        expect(res.status()).toBeLessThan(500);

        const pageRes = await page.goto(route, { waitUntil: "domcontentloaded" });
        expect(pageRes?.status() ?? 200).toBeLessThan(500);
        await assertNoServerCrash(page);
      });
    }
  });
});
