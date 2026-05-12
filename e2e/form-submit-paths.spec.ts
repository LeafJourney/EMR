// Find-and-fix loop, pass 5 — public form submit paths.
//
// Every public form on the marketing site, filled with valid data,
// submit clicked. We assert the API actually receives the payload —
// not just that the UI says "Success".
//
// Silent-drop bugs caught:
//   PR #258   /book-demo                      setTimeout fake-success
//   This PR   /foundation                     posting to a 404 route
//   This PR   /status subscribe               setTimeout fake-success
//   This PR   SiteFooter "Join" newsletter    setTimeout fake-success
//
// Dev-cache caveat: on a fresh `.next` build the spec passes 5/5.
// Against a stale cache where framework chunks 404, React hydration
// fails on /contact /book-demo /status and the form falls back to a
// native HTML GET (visible as `GET /contact?name=...` in the trace).
// Run `rm -rf .next && npm run dev` before triaging failures.

import { test, expect, type Page } from "@playwright/test";

const STAMP = `audit-probe-${Date.now().toString(36)}`;

interface SubmitProbe {
  name: string;
  url: string;
  expectedPostMatch: string;
  fill: (page: Page) => Promise<void>;
  submitButton: { name: RegExp | string; exact?: boolean };
}

const PROBES: SubmitProbe[] = [
  {
    name: "/contact form",
    url: "/contact",
    expectedPostMatch: "/api/contact",
    fill: async (page) => {
      await page.locator('input[name="name"]').fill(`${STAMP} contact`);
      await page.locator('input[name="email"]').fill(`${STAMP}@example.com`);
      await page
        .locator('textarea[name="message"]')
        .fill(`find-and-fix pass 5 probe ${STAMP}`);
    },
    submitButton: { name: "Send", exact: true },
  },
  {
    name: "/book-demo form (regression for PR #258)",
    url: "/book-demo",
    expectedPostMatch: "/api/contact",
    fill: async (page) => {
      await page.locator('input[name="firstName"]').fill(STAMP);
      await page.locator('input[name="lastName"]').fill("Probe");
      await page.locator('input[name="email"]').fill(`${STAMP}@example.com`);
      await page.locator('input[name="organization"]').fill("Audit Probe Health");
      await page.locator('input[name="phone"]').fill("555-555-5555");
      await page.locator('select[name="teamSize"]').selectOption({ index: 1 });
      await page.locator('textarea[name="message"]').fill(`pass 5 probe ${STAMP}`);
    },
    submitButton: { name: /request demo/i },
  },
  {
    name: "/status subscribe",
    url: "/status",
    expectedPostMatch: "/api/contact",
    fill: async (page) => {
      await page
        .locator("form")
        .filter({ hasText: /Subscribe to updates/i })
        .locator('input[type="email"]')
        .fill(`${STAMP}@example.com`);
    },
    submitButton: { name: "Subscribe", exact: true },
  },
  {
    name: "/foundation grant application",
    url: "/foundation",
    expectedPostMatch: "/api/foundation/grants",
    fill: async (page) => {
      await page.locator('input[name="organizationName"]').fill(`${STAMP} Org`);
      await page.locator('input[name="ein"]').fill("12-3456789");
      await page.locator('input[name="contactName"]').fill(`${STAMP} Contact`);
      await page
        .locator('input[name="contactEmail"]')
        .fill(`${STAMP}@example.org`);
      await page.locator('input[name="yearsActive"]').fill("3");
      await page.locator('input[name="requestedDollars"]').fill("5000");
      await page
        .locator('input[name="populationServed"]')
        .fill("audit probe demographic");
      await page
        .locator('textarea[name="programDescription"]')
        .fill(`pass 5 probe ${STAMP} ${"x".repeat(110)}`);
      await page.locator('input[name="ein501c3Verified"]').check();
      await page
        .locator('input[name="conflictOfInterestDeclared"]')
        .check();
    },
    submitButton: { name: /submit|apply|send/i },
  },
  {
    name: "SiteFooter 'Join' newsletter (site-wide)",
    url: "/",
    expectedPostMatch: "/api/contact",
    fill: async (page) => {
      await page
        .locator("#leafjourney-newsletter-email")
        .fill(`${STAMP}+newsletter@example.com`);
    },
    submitButton: { name: "Join", exact: true },
  },
];

test.describe("Public form submit paths — find-and-fix pass 5", () => {
  for (const probe of PROBES) {
    test(probe.name, async ({ page }) => {
      let posted = false;
      let postedTo: string | null = null;
      const allPosts: string[] = [];

      page.on("request", (req) => {
        if (req.method() === "POST") {
          allPosts.push(req.url());
          if (req.url().includes(probe.expectedPostMatch)) {
            posted = true;
            postedTo = req.url();
          }
        }
      });

      await page.route(`**${probe.expectedPostMatch}**`, async (route) => {
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ ok: true, stubbed: true }),
        });
      });

      await page.goto(probe.url, { waitUntil: "domcontentloaded" });
      await probe.fill(page);
      await page
        .getByRole("button", probe.submitButton)
        .first()
        .click();

      await page.waitForTimeout(2500);

      expect(
        posted,
        `${probe.url}: expected POST to ${probe.expectedPostMatch} on submit. ` +
          `Posts observed: ${allPosts.join(", ") || "(none)"}`,
      ).toBe(true);
      expect(postedTo).toContain(probe.expectedPostMatch);
    });
  }
});
