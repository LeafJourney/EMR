# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: form-submit-paths.spec.ts >> Public form submit paths — find-and-fix pass 5 >> /book-demo → POST /api/contact
- Location: e2e/form-submit-paths.spec.ts:106:9

# Error details

```
Error: /book-demo: expected POST to /api/contact on submit. Posts observed: https://relaxing-slug-74.clerk.accounts.dev/v1/dev_browser?__clerk_api_version=2025-11-10&_clerk_js_version=6.11.1, https://relaxing-slug-74.clerk.accounts.dev/v1/environment?__clerk_api_version=2025-11-10&_clerk_js_version=6.11.1&_method=PATCH&__clerk_db_jwt=dvb_3DrP1neX8a72cn9BLBqgaZnwj7V

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
          - paragraph [ref=e28]:
            - img [ref=e29]
            - text: Enterprise Sales
          - heading "See Leafjourney in action." [level=1] [ref=e32]
          - paragraph [ref=e33]: Discover how our AI-native platform can streamline your clinical operations, automate charting, and unlock new revenue streams through Leafmart.
          - generic [ref=e34]:
            - generic [ref=e35]:
              - img [ref=e37]
              - generic [ref=e40]:
                - heading "Tailored Walkthrough" [level=3] [ref=e41]
                - paragraph [ref=e42]: A live, 30-minute demonstration customized for your specific practice specialty.
            - generic [ref=e43]:
              - img [ref=e45]
              - generic [ref=e48]:
                - heading "Integration Roadmap" [level=3] [ref=e49]
                - paragraph [ref=e50]: Learn how to seamlessly migrate your existing patient data and connect your current billing systems.
            - generic [ref=e51]:
              - img [ref=e53]
              - generic [ref=e56]:
                - heading "Pricing & ROI Analysis" [level=3] [ref=e57]
                - paragraph [ref=e58]: Transparent enterprise pricing options and projected time-savings via our autonomous charting agents.
          - generic [ref=e59]:
            - paragraph [ref=e60]: “Leafjourney completely transformed our clinic. The autonomous subagents handle the documentation while we focus on the patient. It's the first time in ten years I'm leaving the office at 5 PM.”
            - generic [ref=e61]:
              - generic [ref=e62]: SJ
              - generic [ref=e63]:
                - paragraph [ref=e64]: Dr. Sarah Jenkins
                - paragraph [ref=e65]: Medical Director, Horizon Health
        - generic [ref=e68]:
          - heading "Schedule your demo" [level=2] [ref=e69]
          - generic [ref=e70]:
            - generic [ref=e71]:
              - generic [ref=e72]:
                - text: First Name
                - generic [ref=e73]:
                  - img [ref=e74]
                  - textbox "First Name" [ref=e77]:
                    - /placeholder: Jane
              - generic [ref=e78]:
                - text: Last Name
                - textbox "Last Name" [ref=e79]:
                  - /placeholder: Doe
            - generic [ref=e80]:
              - text: Work Email
              - generic [ref=e81]:
                - img [ref=e82]
                - textbox "Work Email" [ref=e85]:
                  - /placeholder: jane@clinic.com
            - generic [ref=e86]:
              - text: Organization Name
              - generic [ref=e87]:
                - img [ref=e88]
                - textbox "Organization Name" [ref=e91]:
                  - /placeholder: Horizon Health Partners
            - generic [ref=e92]:
              - generic [ref=e93]:
                - text: Phone Number
                - generic [ref=e94]:
                  - img [ref=e95]
                  - textbox "Phone Number" [ref=e97]:
                    - /placeholder: (555) 123-4567
              - generic [ref=e98]:
                - text: Team Size
                - combobox "Team Size" [ref=e99]:
                  - option "Select size..." [disabled] [selected]
                  - option "1-5 Providers"
                  - option "6-20 Providers"
                  - option "21-50 Providers"
                  - option "50+ Providers"
            - generic [ref=e100]:
              - text: What are you hoping to solve?
              - textbox "What are you hoping to solve?" [ref=e101]:
                - /placeholder: Briefly describe your current challenges...
            - button "Request Demo" [ref=e102] [cursor=pointer]
            - paragraph [ref=e103]:
              - text: By submitting this form, you agree to our
              - link "Privacy Policy" [ref=e104] [cursor=pointer]:
                - /url: /security
              - text: .
    - contentinfo [ref=e105]:
      - generic [ref=e106]:
        - generic [ref=e107]:
          - generic [ref=e108]:
            - generic [ref=e109]:
              - img [ref=e110]
              - generic [ref=e114]:
                - generic [ref=e115]: Leafjourney
                - generic [ref=e116]: health
            - paragraph [ref=e117]: An AI-native cannabis care platform. Patient portal, clinician workspace, and practice operations — unified.
          - generic [ref=e118]:
            - heading "Stay in the loop" [level=3] [ref=e119]
            - paragraph [ref=e120]: New features, research highlights, and the occasional field note from the team. No filler.
            - generic [ref=e121]:
              - generic [ref=e122]: Email address
              - textbox "Email address" [ref=e123]:
                - /placeholder: you@email.com
              - button "Join" [ref=e124] [cursor=pointer]
        - generic [ref=e125]:
          - generic [ref=e126]:
            - button "Product":
              - generic: Product
            - list [ref=e127]:
              - listitem [ref=e128]:
                - link "Patient Portal" [ref=e129] [cursor=pointer]:
                  - /url: /sign-up
              - listitem [ref=e130]:
                - link "Clinician Portal" [ref=e131] [cursor=pointer]:
                  - /url: /sign-up
              - listitem [ref=e132]: Operator Dashboard
              - listitem [ref=e133]:
                - link "The LeafMart" [ref=e134] [cursor=pointer]:
                  - /url: https://www.theleafmart.com/
          - generic [ref=e135]:
            - button "Company":
              - generic: Company
            - list [ref=e136]:
              - listitem [ref=e137]:
                - link "About" [ref=e138] [cursor=pointer]:
                  - /url: /about
              - listitem [ref=e139]:
                - link "Security" [ref=e140] [cursor=pointer]:
                  - /url: /security
              - listitem [ref=e141]:
                - link "Careers" [ref=e142] [cursor=pointer]:
                  - /url: /contact
              - listitem [ref=e143]: Press
          - generic [ref=e144]:
            - button "Resources":
              - generic: Resources
            - list [ref=e145]:
              - listitem [ref=e146]:
                - link "Education" [ref=e147] [cursor=pointer]:
                  - /url: /education
              - listitem [ref=e148]:
                - link "Developer" [ref=e149] [cursor=pointer]:
                  - /url: /developer
              - listitem [ref=e150]:
                - link "Status" [ref=e151] [cursor=pointer]:
                  - /url: /status
              - listitem [ref=e152]: Blog
          - generic [ref=e153]:
            - button "Legal":
              - generic: Legal
            - list [ref=e154]:
              - listitem [ref=e155]:
                - link "Privacy" [ref=e156] [cursor=pointer]:
                  - /url: /security#privacy
              - listitem [ref=e157]:
                - link "Terms" [ref=e158] [cursor=pointer]:
                  - /url: /legal/terms
              - listitem [ref=e159]:
                - link "HIPAA" [ref=e160] [cursor=pointer]:
                  - /url: /security#hipaa
        - paragraph [ref=e161]: Cannabis should be considered a medicine — please use it carefully and judiciously. Do not abuse cannabis, and respect the plant and its healing properties. Leafjourney is a demonstration product and is not a substitute for medical advice. All educational material on this website is strictly for that — education. Any and all changes to medications or treatment plans must be discussed with your healthcare provider first.
        - generic [ref=e162]:
          - generic [ref=e163]:
            - generic [ref=e164]: © 2026 Leafjourney Health.
            - button "Back to top" [ref=e165] [cursor=pointer]:
              - generic [ref=e166]: ↑
              - text: Back to top
          - generic [ref=e167]:
            - generic [ref=e168]: Hemp-derived products ship nationally where permitted.
            - generic [ref=e169]: Licensed cannabis available intrastate only.
  - button "Send feedback" [ref=e170] [cursor=pointer]:
    - generic [ref=e171]: 🌱
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
      |         ^ Error: /book-demo: expected POST to /api/contact on submit. Posts observed: https://relaxing-slug-74.clerk.accounts.dev/v1/dev_browser?__clerk_api_version=2025-11-10&_clerk_js_version=6.11.1, https://relaxing-slug-74.clerk.accounts.dev/v1/environment?__clerk_api_version=2025-11-10&_clerk_js_version=6.11.1&_method=PATCH&__clerk_db_jwt=dvb_3DrP1neX8a72cn9BLBqgaZnwj7V
  148 |       expect(postedTo).toContain(probe.expectedPostMatch);
  149 |     });
  150 |   }
  151 | });
  152 | 
```