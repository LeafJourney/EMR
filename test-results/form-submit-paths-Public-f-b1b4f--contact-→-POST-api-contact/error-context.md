# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: form-submit-paths.spec.ts >> Public form submit paths — find-and-fix pass 5 >> /contact → POST /api/contact
- Location: e2e/form-submit-paths.spec.ts:106:9

# Error details

```
Error: /contact: expected POST to /api/contact on submit. Posts observed: https://relaxing-slug-74.clerk.accounts.dev/v1/dev_browser?__clerk_api_version=2025-11-10&_clerk_js_version=6.11.1, https://relaxing-slug-74.clerk.accounts.dev/v1/environment?__clerk_api_version=2025-11-10&_clerk_js_version=6.11.1&_method=PATCH&__clerk_db_jwt=dvb_3DrOzzLaMOov2pcOjHkgJYppuYr

expect(received).toBe(expected) // Object.is equality

Expected: true
Received: false
```

# Test source

```ts
  47  |     expectedPostMatch: "/api/contact", // book-demo routes through /api/contact
  48  |     fill: async (page) => {
  49  |       await page.locator('input[name="firstName"]').fill(STAMP);
  50  |       await page.locator('input[name="lastName"]').fill("Probe");
  51  |       await page.locator('input[name="email"]').fill(`${STAMP}@example.com`);
  52  |       await page.locator('input[name="organization"]').fill("Audit Probe Health");
  53  |       await page.locator('input[name="phone"]').fill("555-555-5555");
  54  |       await page.locator('select[name="teamSize"]').selectOption({ index: 1 });
  55  |       await page
  56  |         .locator('textarea[name="message"]')
  57  |         .fill(`pass 5 probe ${STAMP}`);
  58  |     },
  59  |     submitSelector: 'button[type="submit"]',
  60  |   },
  61  |   {
  62  |     url: "/status",
  63  |     expectedPostMatch: "/api/contact", // status routes through /api/contact w/ role
  64  |     fill: async (page) => {
  65  |       await page
  66  |         .locator('input[type="email"]')
  67  |         .first()
  68  |         .fill(`${STAMP}@example.com`);
  69  |     },
  70  |     submitSelector: 'button[type="submit"]',
  71  |   },
  72  |   {
  73  |     url: "/foundation",
  74  |     expectedPostMatch: "/api/foundation/grants",
  75  |     fill: async (page) => {
  76  |       await page
  77  |         .locator('input[name="organizationName"]')
  78  |         .fill(`${STAMP} Org`);
  79  |       await page.locator('input[name="ein"]').fill("12-3456789");
  80  |       await page.locator('input[name="contactName"]').fill(`${STAMP} Contact`);
  81  |       await page
  82  |         .locator('input[name="contactEmail"]')
  83  |         .fill(`${STAMP}@example.org`);
  84  |       await page.locator('input[name="yearsActive"]').fill("3");
  85  |       await page.locator('input[name="requestedDollars"]').fill("5000");
  86  |       await page
  87  |         .locator('input[name="populationServed"]')
  88  |         .fill("audit probe demographic");
  89  |       await page
  90  |         .locator('textarea[name="programDescription"]')
  91  |         .fill(
  92  |           `pass 5 probe ${STAMP} ${"x".repeat(110)}`, // schema requires minLength:100
  93  |         );
  94  |       // Both compliance checkboxes
  95  |       await page.locator('input[name="ein501c3Verified"]').check();
  96  |       await page
  97  |         .locator('input[name="conflictOfInterestDeclared"]')
  98  |         .check();
  99  |     },
  100 |     submitSelector: 'button[type="submit"]',
  101 |   },
  102 | ];
  103 | 
  104 | test.describe("Public form submit paths — find-and-fix pass 5", () => {
  105 |   for (const probe of PROBES) {
  106 |     test(`${probe.url} → POST ${probe.expectedPostMatch}`, async ({ page }) => {
  107 |       let posted = false;
  108 |       let postedTo: string | null = null;
  109 |       const allPosts: string[] = [];
  110 | 
  111 |       page.on("request", (req) => {
  112 |         if (req.method() === "POST") {
  113 |           allPosts.push(req.url());
  114 |           if (req.url().includes(probe.expectedPostMatch)) {
  115 |             posted = true;
  116 |             postedTo = req.url();
  117 |           }
  118 |         }
  119 |       });
  120 | 
  121 |       // Native form submits navigate — we want to intercept BEFORE the
  122 |       // navigation aborts the listener. Route the matching URL to a stub
  123 |       // so we can confirm it was called without depending on what the
  124 |       // route does on the server.
  125 |       await page.route(`**${probe.expectedPostMatch}**`, async (route) => {
  126 |         // Return a successful response so any client-side UI transition
  127 |         // proceeds, but the request still fires through our listener.
  128 |         await route.fulfill({
  129 |           status: 200,
  130 |           contentType: "application/json",
  131 |           body: JSON.stringify({ ok: true, stubbed: true }),
  132 |         });
  133 |       });
  134 | 
  135 |       await page.goto(probe.url, { waitUntil: "domcontentloaded" });
  136 |       await probe.fill(page);
  137 |       await page.locator(probe.submitSelector).first().click();
  138 | 
  139 |       // Some forms navigate (HTML form submit); some stay in place (fetch).
  140 |       // Wait for either the network call to happen or a timeout.
  141 |       await page.waitForTimeout(2500);
  142 | 
  143 |       expect(
  144 |         posted,
  145 |         `${probe.url}: expected POST to ${probe.expectedPostMatch} on submit. ` +
  146 |           `Posts observed: ${allPosts.join(", ") || "(none)"}`,
> 147 |       ).toBe(true);
      |         ^ Error: /contact: expected POST to /api/contact on submit. Posts observed: https://relaxing-slug-74.clerk.accounts.dev/v1/dev_browser?__clerk_api_version=2025-11-10&_clerk_js_version=6.11.1, https://relaxing-slug-74.clerk.accounts.dev/v1/environment?__clerk_api_version=2025-11-10&_clerk_js_version=6.11.1&_method=PATCH&__clerk_db_jwt=dvb_3DrOzzLaMOov2pcOjHkgJYppuYr
  148 |       expect(postedTo).toContain(probe.expectedPostMatch);
  149 |     });
  150 |   }
  151 | });
  152 | 
```