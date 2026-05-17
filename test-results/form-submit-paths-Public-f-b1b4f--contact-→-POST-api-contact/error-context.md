# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: form-submit-paths.spec.ts >> Public form submit paths — find-and-fix pass 5 >> /contact → POST /api/contact
- Location: e2e/form-submit-paths.spec.ts:123:9

# Error details

```
Error: /contact: expected POST to /api/contact on submit. Posts observed: https://relaxing-slug-74.clerk.accounts.dev/v1/dev_browser?__clerk_api_version=2025-11-10&_clerk_js_version=6.11.1, https://relaxing-slug-74.clerk.accounts.dev/v1/environment?__clerk_api_version=2025-11-10&_clerk_js_version=6.11.1&_method=PATCH&__clerk_db_jwt=dvb_3DrkbUY1mhSYe82FgDbD6flhikO

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
            - text: Contact us
          - heading "Tell us what you're working on." [level=1] [ref=e32]
          - paragraph [ref=e33]: Whether you're applying for a role, exploring a partnership, or asking a developer question — your message lands directly with Neal and Scott.
        - generic [ref=e34]:
          - generic [ref=e35]:
            - generic [ref=e36]:
              - generic [ref=e37]: Your name
              - textbox "Your name" [ref=e38]
            - generic [ref=e39]:
              - generic [ref=e40]: Email
              - textbox "Email" [ref=e41]
          - generic [ref=e42]:
            - generic [ref=e43]: Subject
            - textbox "Subject" [ref=e44]:
              - /placeholder: What's this about?
          - generic [ref=e45]:
            - generic [ref=e46]: Message
            - textbox "Message" [ref=e47]:
              - /placeholder: Tell us about yourself, the role, and how you'd contribute…
          - generic [ref=e48]:
            - button "Send" [ref=e49] [cursor=pointer]
            - link "Or open in your mail app" [ref=e50] [cursor=pointer]:
              - /url: mailto:neal@leafjourney.com,scott@leafjourney.com?subject=Leafjourney%20inquiry&body=
              - img [ref=e51]
              - text: Or open in your mail app
          - paragraph [ref=e54]: Sent directly to neal@leafjourney.com and scott@leafjourney.com. We don't share your message.
    - contentinfo [ref=e55]:
      - generic [ref=e56]:
        - generic [ref=e57]:
          - generic [ref=e58]:
            - generic [ref=e59]:
              - img [ref=e60]
              - generic [ref=e64]:
                - generic [ref=e65]: Leafjourney
                - generic [ref=e66]: health
            - paragraph [ref=e67]: An AI-native cannabis care platform. Patient portal, clinician workspace, and practice operations — unified.
          - generic [ref=e68]:
            - heading "Stay in the loop" [level=3] [ref=e69]
            - paragraph [ref=e70]: New features, research highlights, and the occasional field note from the team. No filler.
            - generic [ref=e71]:
              - generic [ref=e72]: Email address
              - textbox "Email address" [ref=e73]:
                - /placeholder: you@email.com
              - button "Join" [ref=e74] [cursor=pointer]
        - generic [ref=e75]:
          - generic [ref=e76]:
            - button "Product":
              - generic: Product
            - list [ref=e77]:
              - listitem [ref=e78]:
                - link "Patient Portal" [ref=e79] [cursor=pointer]:
                  - /url: /sign-up
              - listitem [ref=e80]:
                - link "Clinician Portal" [ref=e81] [cursor=pointer]:
                  - /url: /sign-up
              - listitem [ref=e82]: Operator Dashboard
              - listitem [ref=e83]:
                - link "The LeafMart" [ref=e84] [cursor=pointer]:
                  - /url: https://www.theleafmart.com/
          - generic [ref=e85]:
            - button "Company":
              - generic: Company
            - list [ref=e86]:
              - listitem [ref=e87]:
                - link "About" [ref=e88] [cursor=pointer]:
                  - /url: /about
              - listitem [ref=e89]:
                - link "Security" [ref=e90] [cursor=pointer]:
                  - /url: /security
              - listitem [ref=e91]:
                - link "Careers" [ref=e92] [cursor=pointer]:
                  - /url: /contact
              - listitem [ref=e93]: Press
          - generic [ref=e94]:
            - button "Resources":
              - generic: Resources
            - list [ref=e95]:
              - listitem [ref=e96]:
                - link "Education" [ref=e97] [cursor=pointer]:
                  - /url: /education
              - listitem [ref=e98]:
                - link "Developer" [ref=e99] [cursor=pointer]:
                  - /url: /developer
              - listitem [ref=e100]:
                - link "Status" [ref=e101] [cursor=pointer]:
                  - /url: /status
              - listitem [ref=e102]: Blog
          - generic [ref=e103]:
            - button "Legal":
              - generic: Legal
            - list [ref=e104]:
              - listitem [ref=e105]:
                - link "Privacy" [ref=e106] [cursor=pointer]:
                  - /url: /security#privacy
              - listitem [ref=e107]:
                - link "Terms" [ref=e108] [cursor=pointer]:
                  - /url: /legal/terms
              - listitem [ref=e109]:
                - link "HIPAA" [ref=e110] [cursor=pointer]:
                  - /url: /security#hipaa
        - paragraph [ref=e111]: Cannabis should be considered a medicine — please use it carefully and judiciously. Do not abuse cannabis, and respect the plant and its healing properties. Leafjourney is a demonstration product and is not a substitute for medical advice. All educational material on this website is strictly for that — education. Any and all changes to medications or treatment plans must be discussed with your healthcare provider first.
        - generic [ref=e112]:
          - generic [ref=e113]:
            - generic [ref=e114]: © 2026 Leafjourney Health.
            - button "Back to top" [ref=e115] [cursor=pointer]:
              - generic [ref=e116]: ↑
              - text: Back to top
          - generic [ref=e117]:
            - generic [ref=e118]: Hemp-derived products ship nationally where permitted.
            - generic [ref=e119]: Licensed cannabis available intrastate only.
  - button "Send feedback" [ref=e120] [cursor=pointer]:
    - generic [ref=e121]: 🌱
```

# Test source

```ts
  64  |     fill: async (page) => {
  65  |       await page
  66  |         .locator('input[type="email"]')
  67  |         .first()
  68  |         .fill(`${STAMP}@example.com`);
  69  |     },
  70  |     submitSelector: 'button[type="submit"]',
  71  |   },
  72  |   {
  73  |     // SiteFooter newsletter is rendered on every public page. Probing it
  74  |     // from the homepage is enough — the same component is mounted
  75  |     // site-wide and a regression in one place is a regression in all.
  76  |     // (EMR-716 — silent setTimeout fake-success caught by pass 8.)
  77  |     url: "/",
  78  |     expectedPostMatch: "/api/contact",
  79  |     fill: async (page) => {
  80  |       // Scope to the footer to avoid matching any hero-section email
  81  |       // capture that might exist on the homepage.
  82  |       await page
  83  |         .locator("footer")
  84  |         .locator('input[type="email"]')
  85  |         .fill(`${STAMP}@example.com`);
  86  |     },
  87  |     submitSelector: 'footer form button[type="submit"]',
  88  |   },
  89  |   {
  90  |     url: "/foundation",
  91  |     expectedPostMatch: "/api/foundation/grants",
  92  |     fill: async (page) => {
  93  |       await page
  94  |         .locator('input[name="organizationName"]')
  95  |         .fill(`${STAMP} Org`);
  96  |       await page.locator('input[name="ein"]').fill("12-3456789");
  97  |       await page.locator('input[name="contactName"]').fill(`${STAMP} Contact`);
  98  |       await page
  99  |         .locator('input[name="contactEmail"]')
  100 |         .fill(`${STAMP}@example.org`);
  101 |       await page.locator('input[name="yearsActive"]').fill("3");
  102 |       await page.locator('input[name="requestedDollars"]').fill("5000");
  103 |       await page
  104 |         .locator('input[name="populationServed"]')
  105 |         .fill("audit probe demographic");
  106 |       await page
  107 |         .locator('textarea[name="programDescription"]')
  108 |         .fill(
  109 |           `pass 5 probe ${STAMP} ${"x".repeat(110)}`, // schema requires minLength:100
  110 |         );
  111 |       // Both compliance checkboxes
  112 |       await page.locator('input[name="ein501c3Verified"]').check();
  113 |       await page
  114 |         .locator('input[name="conflictOfInterestDeclared"]')
  115 |         .check();
  116 |     },
  117 |     submitSelector: 'button[type="submit"]',
  118 |   },
  119 | ];
  120 | 
  121 | test.describe("Public form submit paths — find-and-fix pass 5", () => {
  122 |   for (const probe of PROBES) {
  123 |     test(`${probe.url} → POST ${probe.expectedPostMatch}`, async ({ page }) => {
  124 |       let posted = false;
  125 |       let postedTo: string | null = null;
  126 |       const allPosts: string[] = [];
  127 | 
  128 |       page.on("request", (req) => {
  129 |         if (req.method() === "POST") {
  130 |           allPosts.push(req.url());
  131 |           if (req.url().includes(probe.expectedPostMatch)) {
  132 |             posted = true;
  133 |             postedTo = req.url();
  134 |           }
  135 |         }
  136 |       });
  137 | 
  138 |       // Native form submits navigate — we want to intercept BEFORE the
  139 |       // navigation aborts the listener. Route the matching URL to a stub
  140 |       // so we can confirm it was called without depending on what the
  141 |       // route does on the server.
  142 |       await page.route(`**${probe.expectedPostMatch}**`, async (route) => {
  143 |         // Return a successful response so any client-side UI transition
  144 |         // proceeds, but the request still fires through our listener.
  145 |         await route.fulfill({
  146 |           status: 200,
  147 |           contentType: "application/json",
  148 |           body: JSON.stringify({ ok: true, stubbed: true }),
  149 |         });
  150 |       });
  151 | 
  152 |       await page.goto(probe.url, { waitUntil: "domcontentloaded" });
  153 |       await probe.fill(page);
  154 |       await page.locator(probe.submitSelector).first().click();
  155 | 
  156 |       // Some forms navigate (HTML form submit); some stay in place (fetch).
  157 |       // Wait for either the network call to happen or a timeout.
  158 |       await page.waitForTimeout(2500);
  159 | 
  160 |       expect(
  161 |         posted,
  162 |         `${probe.url}: expected POST to ${probe.expectedPostMatch} on submit. ` +
  163 |           `Posts observed: ${allPosts.join(", ") || "(none)"}`,
> 164 |       ).toBe(true);
      |         ^ Error: /contact: expected POST to /api/contact on submit. Posts observed: https://relaxing-slug-74.clerk.accounts.dev/v1/dev_browser?__clerk_api_version=2025-11-10&_clerk_js_version=6.11.1, https://relaxing-slug-74.clerk.accounts.dev/v1/environment?__clerk_api_version=2025-11-10&_clerk_js_version=6.11.1&_method=PATCH&__clerk_db_jwt=dvb_3DrkbUY1mhSYe82FgDbD6flhikO
  165 |       expect(postedTo).toContain(probe.expectedPostMatch);
  166 |     });
  167 |   }
  168 | });
  169 | 
```