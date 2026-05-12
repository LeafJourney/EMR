# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: form-submit-paths.spec.ts >> Public form submit paths — find-and-fix pass 5 >> /contact → POST /api/contact
- Location: e2e/form-submit-paths.spec.ts:106:9

# Error details

```
Test timeout of 30000ms exceeded.
```

```
Error: locator.fill: Test timeout of 30000ms exceeded.
Call log:
  - waiting for locator('input[name="name"]')

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
            - generic [ref=e12]: Leafjourneyhealth
        - navigation "Main" [ref=e13]:
          - link "About" [ref=e14] [cursor=pointer]:
            - /url: /about
          - link "Security" [ref=e15] [cursor=pointer]:
            - /url: /security
          - link "Education" [ref=e16] [cursor=pointer]:
            - /url: /education
          - link "LeafMart" [ref=e17] [cursor=pointer]:
            - /url: https://www.theleafmart.com/
          - link "Marketplace" [ref=e18] [cursor=pointer]:
            - /url: https://www.theleafmart.com/
          - link "Developer" [ref=e19] [cursor=pointer]:
            - /url: /developer
          - link "Sign in" [ref=e20] [cursor=pointer]:
            - /url: /sign-in
        - link "Demo" [ref=e21] [cursor=pointer]:
          - /url: /sign-up
          - button "Demo" [ref=e22]
      - navigation "Site navigation" [ref=e23]:
        - generic [ref=e24]:
          - button "Explore" [pressed] [ref=e25]
          - button "Learn" [ref=e26]
          - button "Shop" [ref=e27]
          - button "Account" [ref=e28]
        - generic [ref=e29]:
          - region "Explore" [ref=e30]:
            - list [ref=e31]:
              - listitem [ref=e32]:
                - link "Home" [ref=e33] [cursor=pointer]:
                  - /url: /
                  - text: ⌂Home
              - listitem [ref=e34]:
                - link "About" [ref=e35] [cursor=pointer]:
                  - /url: /about
                  - text: ✎About
              - listitem [ref=e36]:
                - link "Team" [ref=e37] [cursor=pointer]:
                  - /url: /about/team
                  - text: ☺Team
              - listitem [ref=e38]:
                - link "Business" [ref=e39] [cursor=pointer]:
                  - /url: /about/business
                  - text: ⧉Business
          - region "Learn" [ref=e40]:
            - list [ref=e41]:
              - listitem [ref=e42]:
                - link "ChatCB" [ref=e43] [cursor=pointer]:
                  - /url: /education
                  - text: ❦ChatCB
              - listitem [ref=e44]:
                - link "Research" [ref=e45] [cursor=pointer]:
                  - /url: /education#research
                  - text: ⚘Research
              - listitem [ref=e46]:
                - link "Wheel" [ref=e47] [cursor=pointer]:
                  - /url: /education#wheel
              - listitem [ref=e48]:
                - link "Drug Mix" [ref=e49] [cursor=pointer]:
                  - /url: /education#drugmix
                  - text: ⚗Drug Mix
          - region "Shop" [ref=e50]:
            - list [ref=e51]:
              - listitem [ref=e52]:
                - link "LeafMart" [ref=e53] [cursor=pointer]:
                  - /url: https://www.theleafmart.com/
                  - text: ✿LeafMart
              - listitem [ref=e54]:
                - link "Marketplace" [ref=e55] [cursor=pointer]:
                  - /url: https://www.theleafmart.com/
                  - text: ☖Marketplace
              - listitem [ref=e56]:
                - link "Store" [ref=e57] [cursor=pointer]:
                  - /url: /store
                  - text: ☲Store
              - listitem [ref=e58]:
                - link "Vendors" [ref=e59] [cursor=pointer]:
                  - /url: /leafmart/vendors
                  - text: ⚘Vendors
          - region "Account" [ref=e60]:
            - list [ref=e61]:
              - listitem [ref=e62]:
                - link "Sign in" [ref=e63] [cursor=pointer]:
                  - /url: /sign-in
                  - text: ➜Sign in
              - listitem [ref=e64]:
                - link "Demo" [ref=e65] [cursor=pointer]:
                  - /url: /sign-up
                  - text: ☆Demo
              - listitem [ref=e66]:
                - link "Security" [ref=e67] [cursor=pointer]:
                  - /url: /security
                  - text: ☢Security
              - listitem [ref=e68]:
                - link "Developer" [ref=e69] [cursor=pointer]:
                  - /url: /developer
                  - text: ⚙Developer
        - generic [ref=e70]:
          - button "Show Explore" [ref=e71]
          - button "Show Learn" [ref=e72]
          - button "Show Shop" [ref=e73]
          - button "Show Account" [ref=e74]
    - main [ref=e75]:
      - generic [ref=e76]:
        - generic [ref=e77]:
          - paragraph [ref=e78]:
            - img [ref=e79]
            - text: Contact us
          - heading "Tell us what you're working on." [level=1] [ref=e82]
          - paragraph [ref=e83]: Whether you're applying for a role, exploring a partnership, or asking a developer question — your message lands directly with Neal and Scott.
        - generic [ref=e84]:
          - generic [ref=e85]:
            - generic [ref=e86]:
              - text: Your name
              - textbox [ref=e87]
            - generic [ref=e88]:
              - text: Email
              - textbox [ref=e89]
          - generic [ref=e90]:
            - text: Subject
            - textbox "What's this about?" [ref=e91]
          - generic [ref=e92]:
            - text: Message
            - textbox "Tell us about yourself, the role, and how you'd contribute…" [ref=e93]
          - generic [ref=e94]:
            - button "Send" [ref=e95]
            - link "Or open in your mail app" [ref=e96] [cursor=pointer]:
              - /url: mailto:neal@leafjourney.com,scott@leafjourney.com?subject=Leafjourney%20inquiry&body=
              - img [ref=e97]
              - text: Or open in your mail app
          - paragraph [ref=e100]: Sent directly to neal@leafjourney.com and scott@leafjourney.com. We don't share your message.
    - contentinfo [ref=e101]:
      - generic [ref=e102]:
        - generic [ref=e103]:
          - generic [ref=e104]:
            - generic [ref=e105]:
              - img [ref=e106]
              - generic [ref=e110]: Leafjourneyhealth
            - paragraph [ref=e111]: An AI-native cannabis care platform. Patient portal, clinician workspace, and practice operations — unified.
          - generic [ref=e112]:
            - heading "Stay in the loop" [level=3] [ref=e113]
            - paragraph [ref=e114]: New features, research highlights, and the occasional field note from the team. No filler.
            - generic [ref=e115]:
              - text: Email address
              - textbox "Email address" [ref=e116]:
                - /placeholder: you@email.com
              - button "Join" [ref=e117]
        - generic [ref=e118]:
          - button "Product" [ref=e120]: Product+
          - button "Company" [ref=e122]: Company+
          - button "Resources" [ref=e124]: Resources+
          - button "Legal" [ref=e126]: Legal+
        - paragraph [ref=e127]: Cannabis should be considered a medicine — please use it carefully and judiciously. Do not abuse cannabis, and respect the plant and its healing properties. Leafjourney is a demonstration product and is not a substitute for medical advice. All educational material on this website is strictly for that — education. Any and all changes to medications or treatment plans must be discussed with your healthcare provider first.
        - generic [ref=e128]:
          - generic [ref=e129]:
            - generic [ref=e130]: © 2026 Leafjourney Health.
            - button "Back to top" [ref=e131]: ↑ Back to top
          - generic [ref=e132]: Hemp-derived products ship nationally where permitted.Licensed cannabis available intrastate only.
  - button "Send feedback" [ref=e133]: 💬
```

# Test source

```ts
  1   | // Find-and-fix loop, pass 5 — public form submit paths.
  2   | //
  3   | // Every public form on the marketing site, filled with valid data,
  4   | // submit clicked. We assert the API actually receives the payload — not
  5   | // just that the UI says "Success".
  6   | //
  7   | // History of silent-drop bugs this catches:
  8   | //   PR #258  /book-demo  setTimeout fake-success on submit
  9   | //   This PR  /foundation form posting to a non-existent route (404 + lost)
  10  | //   This PR  /status subscribe doing setTimeout fake-success
  11  | //
  12  | // Selectors use `name=` attributes (deterministic) rather than getByLabel
  13  | // (brittle when labels aren't htmlFor-linked).
  14  | //
  15  | // Test data uses an obvious "audit-probe-<stamp>" prefix so triagers can
  16  | // distinguish suite traffic from real user submissions in logs.
  17  | 
  18  | import { test, expect, type Page } from "@playwright/test";
  19  | 
  20  | const STAMP = `audit-probe-${Date.now().toString(36)}`;
  21  | 
  22  | interface SubmitProbe {
  23  |   url: string;
  24  |   /** Substring the target POST URL must contain. */
  25  |   expectedPostMatch: string;
  26  |   /** Fill in the form. Receives the page. */
  27  |   fill: (page: Page) => Promise<void>;
  28  |   /** Submit selector — usually a button. */
  29  |   submitSelector: string;
  30  | }
  31  | 
  32  | const PROBES: SubmitProbe[] = [
  33  |   {
  34  |     url: "/contact",
  35  |     expectedPostMatch: "/api/contact",
  36  |     fill: async (page) => {
> 37  |       await page.locator('input[name="name"]').fill(`${STAMP} contact`);
      |                                                ^ Error: locator.fill: Test timeout of 30000ms exceeded.
  38  |       await page.locator('input[name="email"]').fill(`${STAMP}@example.com`);
  39  |       await page
  40  |         .locator('textarea[name="message"]')
  41  |         .fill(`find-and-fix pass 5 probe ${STAMP}`);
  42  |     },
  43  |     submitSelector: 'button[type="submit"]',
  44  |   },
  45  |   {
  46  |     url: "/book-demo",
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
```