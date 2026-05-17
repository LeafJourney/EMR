# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: form-submit-paths.spec.ts >> Public form submit paths — find-and-fix pass 5 >> /status → POST /api/contact
- Location: e2e/form-submit-paths.spec.ts:106:9

# Error details

```
Error: /status: expected POST to /api/contact on submit. Posts observed: https://relaxing-slug-74.clerk.accounts.dev/v1/dev_browser?__clerk_api_version=2025-11-10&_clerk_js_version=6.11.1, https://relaxing-slug-74.clerk.accounts.dev/v1/environment?__clerk_api_version=2025-11-10&_clerk_js_version=6.11.1&_method=PATCH&__clerk_db_jwt=dvb_3DrP3EqNeFvCFvqJsD1zjg1r2Qz

expect(received).toBe(expected) // Object.is equality

Expected: true
Received: false
```

# Page snapshot

```yaml
- generic [active] [ref=e1]:
  - link "Skip to content" [ref=e2] [cursor=pointer]:
    - /url: "#main-content"
  - generic [ref=e3]:
    - banner [ref=e4]:
      - generic [ref=e5]:
        - link "Leafjourney home" [ref=e6] [cursor=pointer]:
          - /url: /
          - generic [ref=e7]:
            - img [ref=e8]
            - generic [ref=e12]:
              - generic [ref=e13]: Leafjourney
              - generic [ref=e14]: health
        - navigation "Main" [ref=e15]:
          - link "About" [ref=e16] [cursor=pointer]:
            - /url: /about
          - link "Security" [ref=e17] [cursor=pointer]:
            - /url: /security
          - link "Education" [ref=e18] [cursor=pointer]:
            - /url: /education
          - link "LeafMart" [ref=e19] [cursor=pointer]:
            - /url: https://www.theleafmart.com/
          - link "Marketplace" [ref=e20] [cursor=pointer]:
            - /url: https://www.theleafmart.com/
          - link "Developer" [ref=e21] [cursor=pointer]:
            - /url: /developer
          - link "Sign in" [ref=e22] [cursor=pointer]:
            - /url: /sign-in
        - link "Demo" [ref=e23] [cursor=pointer]:
          - /url: /sign-up
          - button "Demo" [ref=e24]
    - main [ref=e25]:
      - generic [ref=e26]:
        - generic [ref=e27]:
          - generic [ref=e28]: ✓
          - generic [ref=e29]:
            - heading "All systems operational" [level=1] [ref=e30]
            - paragraph [ref=e31]: Last updated 9:56:56 AM
        - generic [ref=e32]:
          - generic [ref=e33]:
            - heading "Services" [level=3] [ref=e34]
            - paragraph [ref=e35]: Live status for each component
          - generic [ref=e37]:
            - generic [ref=e38]:
              - generic [ref=e41]:
                - generic [ref=e42]: Web app
                - generic [ref=e43]: Patient portal, clinician workspace, operator console
              - generic [ref=e44]:
                - generic [ref=e45]: 99.98% · 30d
                - generic [ref=e46]: Operational
            - generic [ref=e47]:
              - generic [ref=e50]:
                - generic [ref=e51]: Database
                - generic [ref=e52]: PostgreSQL primary + read replicas
              - generic [ref=e53]:
                - generic [ref=e54]: 99.99% · 30d
                - generic [ref=e55]: Operational
            - generic [ref=e56]:
              - generic [ref=e59]:
                - generic [ref=e60]: AI agents
                - generic [ref=e61]: Agent fleet (charge integrity, denial triage, patient Q&A)
              - generic [ref=e62]:
                - generic [ref=e63]: 99.95% · 30d
                - generic [ref=e64]: Operational
            - generic [ref=e65]:
              - generic [ref=e68]:
                - generic [ref=e69]: Payments
                - generic [ref=e70]: Payabli gateway integration
              - generic [ref=e71]:
                - generic [ref=e72]: 99.91% · 30d
                - generic [ref=e73]: Operational
            - generic [ref=e74]:
              - generic [ref=e77]:
                - generic [ref=e78]: Email
                - generic [ref=e79]: Transactional email (Resend)
              - generic [ref=e80]:
                - generic [ref=e81]: 99.93% · 30d
                - generic [ref=e82]: Operational
        - generic [ref=e83]:
          - generic [ref=e84]:
            - heading "Incident history" [level=3] [ref=e85]
            - paragraph [ref=e86]: Last 30 days
          - generic [ref=e88]:
            - generic [ref=e90]:
              - generic [ref=e91]:
                - generic [ref=e92]:
                  - generic [ref=e93]: Elevated latency on analytics queries
                  - generic [ref=e94]: minor
                - paragraph [ref=e95]: A long-running analytics query saturated read replicas for ~18 minutes. Affected users saw slower dashboards. Query killed and optimized.
              - generic [ref=e96]:
                - generic [ref=e97]: 2026-04-12
                - generic [ref=e98]: Resolved
            - generic [ref=e100]:
              - generic [ref=e101]:
                - generic [ref=e102]:
                  - generic [ref=e103]: Payabli webhook delivery delays
                  - generic [ref=e104]: minor
                - paragraph [ref=e105]: Payabli's upstream queue backed up; webhook delivery delayed ~45m. No data loss.
              - generic [ref=e106]:
                - generic [ref=e107]: 2026-03-31
                - generic [ref=e108]: Resolved
            - generic [ref=e110]:
              - generic [ref=e111]:
                - generic [ref=e112]:
                  - generic [ref=e113]: AI agent timeouts
                  - generic [ref=e114]: major
                - paragraph [ref=e115]: Model provider upstream had a partial outage. Agents fell back to queued mode; all jobs completed once service resumed.
              - generic [ref=e116]:
                - generic [ref=e117]: 2026-03-18
                - generic [ref=e118]: Resolved
        - generic [ref=e119]:
          - generic [ref=e120]:
            - heading "Scheduled maintenance" [level=3] [ref=e121]
            - paragraph [ref=e122]: Upcoming planned work
          - generic [ref=e124]:
            - generic [ref=e125]:
              - generic [ref=e126]: Database minor version upgrade
              - generic [ref=e127]: Read-only mode for ~5 minutes during cutover
              - generic [ref=e128]: 2026-04-20 03:00 UTC — 2026-04-20 03:30 UTC
            - generic [ref=e129]:
              - generic [ref=e130]: Scheduled retrospective reindex
              - generic [ref=e131]: No user-visible impact expected
              - generic [ref=e132]: 2026-05-02 02:00 UTC — 2026-05-02 04:00 UTC
        - generic [ref=e133]:
          - generic [ref=e134]:
            - heading "Subscribe to updates" [level=3] [ref=e135]
            - paragraph [ref=e136]: Get an email whenever we open or resolve an incident
          - generic [ref=e138]:
            - textbox "you@company.com" [ref=e139]
            - button "Subscribe" [ref=e140] [cursor=pointer]
    - contentinfo [ref=e141]:
      - generic [ref=e142]:
        - generic [ref=e143]:
          - generic [ref=e144]:
            - generic [ref=e145]:
              - img [ref=e146]
              - generic [ref=e150]:
                - generic [ref=e151]: Leafjourney
                - generic [ref=e152]: health
            - paragraph [ref=e153]: An AI-native cannabis care platform. Patient portal, clinician workspace, and practice operations — unified.
          - generic [ref=e154]:
            - heading "Stay in the loop" [level=3] [ref=e155]
            - paragraph [ref=e156]: New features, research highlights, and the occasional field note from the team. No filler.
            - generic [ref=e157]:
              - generic [ref=e158]: Email address
              - textbox "Email address" [ref=e159]:
                - /placeholder: you@email.com
              - button "Join" [ref=e160] [cursor=pointer]
        - generic [ref=e161]:
          - generic [ref=e162]:
            - button "Product":
              - generic: Product
            - list [ref=e163]:
              - listitem [ref=e164]:
                - link "Patient Portal" [ref=e165] [cursor=pointer]:
                  - /url: /sign-up
              - listitem [ref=e166]:
                - link "Clinician Portal" [ref=e167] [cursor=pointer]:
                  - /url: /sign-up
              - listitem [ref=e168]: Operator Dashboard
              - listitem [ref=e169]:
                - link "The LeafMart" [ref=e170] [cursor=pointer]:
                  - /url: https://www.theleafmart.com/
          - generic [ref=e171]:
            - button "Company":
              - generic: Company
            - list [ref=e172]:
              - listitem [ref=e173]:
                - link "About" [ref=e174] [cursor=pointer]:
                  - /url: /about
              - listitem [ref=e175]:
                - link "Security" [ref=e176] [cursor=pointer]:
                  - /url: /security
              - listitem [ref=e177]:
                - link "Careers" [ref=e178] [cursor=pointer]:
                  - /url: /contact
              - listitem [ref=e179]: Press
          - generic [ref=e180]:
            - button "Resources":
              - generic: Resources
            - list [ref=e181]:
              - listitem [ref=e182]:
                - link "Education" [ref=e183] [cursor=pointer]:
                  - /url: /education
              - listitem [ref=e184]:
                - link "Developer" [ref=e185] [cursor=pointer]:
                  - /url: /developer
              - listitem [ref=e186]:
                - link "Status" [ref=e187] [cursor=pointer]:
                  - /url: /status
              - listitem [ref=e188]: Blog
          - generic [ref=e189]:
            - button "Legal":
              - generic: Legal
            - list [ref=e190]:
              - listitem [ref=e191]:
                - link "Privacy" [ref=e192] [cursor=pointer]:
                  - /url: /security#privacy
              - listitem [ref=e193]:
                - link "Terms" [ref=e194] [cursor=pointer]:
                  - /url: /legal/terms
              - listitem [ref=e195]:
                - link "HIPAA" [ref=e196] [cursor=pointer]:
                  - /url: /security#hipaa
        - paragraph [ref=e197]: Cannabis should be considered a medicine — please use it carefully and judiciously. Do not abuse cannabis, and respect the plant and its healing properties. Leafjourney is a demonstration product and is not a substitute for medical advice. All educational material on this website is strictly for that — education. Any and all changes to medications or treatment plans must be discussed with your healthcare provider first.
        - generic [ref=e198]:
          - generic [ref=e199]:
            - generic [ref=e200]: © 2026 Leafjourney Health.
            - button "Back to top" [ref=e201] [cursor=pointer]:
              - generic [ref=e202]: ↑
              - text: Back to top
          - generic [ref=e203]:
            - generic [ref=e204]: Hemp-derived products ship nationally where permitted.
            - generic [ref=e205]: Licensed cannabis available intrastate only.
  - button "Send feedback" [ref=e206] [cursor=pointer]:
    - generic [ref=e207]: 🌱
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
      |         ^ Error: /status: expected POST to /api/contact on submit. Posts observed: https://relaxing-slug-74.clerk.accounts.dev/v1/dev_browser?__clerk_api_version=2025-11-10&_clerk_js_version=6.11.1, https://relaxing-slug-74.clerk.accounts.dev/v1/environment?__clerk_api_version=2025-11-10&_clerk_js_version=6.11.1&_method=PATCH&__clerk_db_jwt=dvb_3DrP3EqNeFvCFvqJsD1zjg1r2Qz
  148 |       expect(postedTo).toContain(probe.expectedPostMatch);
  149 |     });
  150 |   }
  151 | });
  152 | 
```