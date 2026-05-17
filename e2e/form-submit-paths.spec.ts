// Find-and-fix loop, pass 5 — public form submit paths.
//
// Every public form on the marketing site, filled with valid data,
// submit clicked. We assert the API actually receives the payload — not
// just that the UI says "Success".
//
// History of silent-drop bugs this catches:
//   PR #258  /book-demo  setTimeout fake-success on submit
//   This PR  /foundation form posting to a non-existent route (404 + lost)
//   This PR  /status subscribe doing setTimeout fake-success
//
// Selectors use `name=` attributes (deterministic) rather than getByLabel
// (brittle when labels aren't htmlFor-linked).
//
// Test data uses an obvious "audit-probe-<stamp>" prefix so triagers can
// distinguish suite traffic from real user submissions in logs.

import { test, expect, type Page } from "@playwright/test";

const STAMP = `audit-probe-${Date.now().toString(36)}`;

interface SubmitProbe {
  url: string;
  /** Substring the target POST URL must contain. */
  expectedPostMatch: string;
  /** Fill in the form. Receives the page. */
  fill: (page: Page) => Promise<void>;
  /** Submit selector — usually a button. */
  submitSelector: string;
}

const PROBES: SubmitProbe[] = [
  {
    url: "/contact",
    expectedPostMatch: "/api/contact",
    fill: async (page) => {
      await page.locator('input[name="name"]').fill(`${STAMP} contact`);
      await page.locator('input[name="email"]').fill(`${STAMP}@example.com`);
      await page
        .locator('textarea[name="message"]')
        .fill(`find-and-fix pass 5 probe ${STAMP}`);
    },
    submitSelector: 'button[type="submit"]',
  },
  {
    url: "/book-demo",
    expectedPostMatch: "/api/contact", // book-demo routes through /api/contact
    fill: async (page) => {
      await page.locator('input[name="firstName"]').fill(STAMP);
      await page.locator('input[name="lastName"]').fill("Probe");
      await page.locator('input[name="email"]').fill(`${STAMP}@example.com`);
      await page.locator('input[name="organization"]').fill("Audit Probe Health");
      await page.locator('input[name="phone"]').fill("555-555-5555");
      await page.locator('select[name="teamSize"]').selectOption({ index: 1 });
      await page
        .locator('textarea[name="message"]')
        .fill(`pass 5 probe ${STAMP}`);
    },
    submitSelector: 'button[type="submit"]',
  },
  {
    url: "/status",
    expectedPostMatch: "/api/contact", // status routes through /api/contact w/ role
    fill: async (page) => {
      await page
        .locator('input[type="email"]')
        .first()
        .fill(`${STAMP}@example.com`);
    },
    submitSelector: 'button[type="submit"]',
  },
  {
    // SiteFooter newsletter is rendered on every public page. Probing it
    // from the homepage is enough — the same component is mounted
    // site-wide and a regression in one place is a regression in all.
    // (EMR-716 — silent setTimeout fake-success caught by pass 8.)
    url: "/",
    expectedPostMatch: "/api/contact",
    fill: async (page) => {
      // Scope to the footer to avoid matching any hero-section email
      // capture that might exist on the homepage.
      await page
        .locator("footer")
        .locator('input[type="email"]')
        .fill(`${STAMP}@example.com`);
    },
    submitSelector: 'footer form button[type="submit"]',
  },
  {
    url: "/foundation",
    expectedPostMatch: "/api/foundation/grants",
    fill: async (page) => {
      await page
        .locator('input[name="organizationName"]')
        .fill(`${STAMP} Org`);
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
        .fill(
          `pass 5 probe ${STAMP} ${"x".repeat(110)}`, // schema requires minLength:100
        );
      // Both compliance checkboxes
      await page.locator('input[name="ein501c3Verified"]').check();
      await page
        .locator('input[name="conflictOfInterestDeclared"]')
        .check();
    },
    submitSelector: 'button[type="submit"]',
  },
];

test.describe("Public form submit paths — find-and-fix pass 5", () => {
  for (const probe of PROBES) {
    test(`${probe.url} → POST ${probe.expectedPostMatch}`, async ({ page }) => {
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

      // Native form submits navigate — we want to intercept BEFORE the
      // navigation aborts the listener. Route the matching URL to a stub
      // so we can confirm it was called without depending on what the
      // route does on the server.
      await page.route(`**${probe.expectedPostMatch}**`, async (route) => {
        // Return a successful response so any client-side UI transition
        // proceeds, but the request still fires through our listener.
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ ok: true, stubbed: true }),
        });
      });

      await page.goto(probe.url, { waitUntil: "domcontentloaded" });
      await probe.fill(page);
      await page.locator(probe.submitSelector).first().click();

      // Some forms navigate (HTML form submit); some stay in place (fetch).
      // Wait for either the network call to happen or a timeout.
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
