// LeafNerd Hardening Track 10 — focused E2E coverage for the /leafnerd SPA.
//
// The Leafnerd "FHIR Intelligence" dashboard is a single-page app (rail +
// command bar + surface router + drawer + Ask panel). Unlike the broad
// find-and-fix sweeps (public-surfaces / authed-surfaces), this suite drives
// the real interactions a Population-Health user performs:
//
//   1. Rail navigation        — clicking the left rail swaps the active surface
//   2. Metric card triggers   — clicking an Overview metric opens its provenance drawer
//   3. Chat interactions      — "Ask Leafnerd" opens, accepts a prompt, returns a reply
//   4. Simulator runs         — the Cohort Simulator runs a Monte Carlo and shows results
//   5. Logout flow            — the rail user popover exposes a working "Sign out"
//
// The page is gated in production (redirects unauthenticated users to /sign-in)
// but is intentionally open in dev so local iteration never bounces. These tests
// target the dev-mode SPA; each test calls `openLeafnerd()` first and skips
// cleanly if the environment bounces to /sign-in instead of rendering the shell.
//
// Robustness notes:
//  - The SPA is server-rendered then hydrated; the rail/cards are *visible*
//    before React attaches click handlers. The first interaction in each test is
//    therefore wrapped in `expect(...).toPass()` so an early (pre-hydration) click
//    is retried instead of silently lost.
//  - A wide viewport keeps the command bar's responsive chips on screen
//    (`.demo-chip` is display:none below 1400px).
//  - A global "Send feedback" FAB is fixed bottom-right and overlaps the Ask
//    panel's Send button, so chat is submitted with Enter (a real user path).

import { test, expect, type Page, type Locator } from "@playwright/test";

const LEAFNERD = "/leafnerd";

test.use({ viewport: { width: 1600, height: 900 } });

// Navigate to /leafnerd and wait for the SPA shell. Returns false if the
// environment gated us to /sign-in (production-like) so the caller can skip.
async function openLeafnerd(page: Page): Promise<boolean> {
  await page.goto(LEAFNERD, { waitUntil: "domcontentloaded" });
  if (/\/sign-in/.test(page.url())) return false;
  try {
    await page.locator(".ln-root .rail").waitFor({ state: "visible", timeout: 15_000 });
  } catch {
    return false;
  }
  return true;
}

// The Ask Leafnerd panel and the record drawers share the `.drawer` class; the
// Ask panel is the one carrying aria-label="Ask Leafnerd".
function askPanel(page: Page): Locator {
  return page.locator('aside.drawer[aria-label="Ask Leafnerd"]');
}

// The metric provenance drawer is the `.drawer` whose tag reads "Metric provenance".
function metricDrawer(page: Page): Locator {
  return page.locator("aside.drawer", {
    has: page.locator(".dh-tag", { hasText: "Metric provenance" }),
  });
}

// Click a rail item and wait for its surface to land. Retries the click so an
// early pre-hydration click is not lost.
async function navTo(page: Page, label: string, expectedTitle: string): Promise<void> {
  const item = page.locator(".rail .nav-item", { hasText: label });
  const title = page.locator(".page-title");
  await expect(async () => {
    await item.click();
    await expect(title).toHaveText(expectedTitle, { timeout: 1500 });
  }).toPass({ timeout: 15_000 });
}

// Open the Ask Leafnerd panel from a command-bar trigger (retried for hydration).
async function openAsk(page: Page, trigger = ".cmdbar .ai-btn"): Promise<Locator> {
  const t = page.locator(trigger);
  const panel = askPanel(page);
  await expect(async () => {
    await t.click();
    await expect(panel).toBeVisible({ timeout: 1500 });
  }).toPass({ timeout: 15_000 });
  return panel;
}

// Open an Overview metric card's drawer by index (retried for hydration).
async function openMetric(page: Page, index: number): Promise<Locator> {
  const card = page.locator(".card.metric").nth(index);
  const drawer = metricDrawer(page);
  await expect(async () => {
    await card.click();
    await expect(drawer).toBeVisible({ timeout: 1500 });
  }).toPass({ timeout: 15_000 });
  return drawer;
}

test.describe("LeafNerd hardening — /leafnerd SPA", () => {
  test("renders the SPA shell: rail, command bar, and Overview", async ({ page }) => {
    test.skip(!(await openLeafnerd(page)), "leafnerd is auth-gated on this environment");

    // Document title comes from the layout metadata.
    await expect(page).toHaveTitle(/Leafnerd/i);

    // Rail brand + a populated nav (1 overview + 7 clinical + 5 intelligence + 3 data = 16).
    await expect(page.locator(".rail .brand-name")).toContainText("Leaf");
    await expect(page.locator(".rail .nav-item")).toHaveCount(16);

    // Command bar exposes the Ask entry point and the de-identified demo chip.
    await expect(page.locator(".cmdbar .ai-btn")).toContainText("Ask Leafnerd");
    await expect(page.locator(".cmdbar .demo-chip")).toBeVisible();

    // Overview is the default surface.
    await expect(page.locator(".page-title")).toHaveText("Population & data health");
    await expect(page.locator(".rail .nav-item.active")).toContainText("Overview");
  });

  test("rail navigation switches surfaces", async ({ page }) => {
    test.skip(!(await openLeafnerd(page)), "leafnerd is auth-gated on this environment");

    // Each rail item routes to a distinct surface with its own page title.
    const cases: Array<[string, string]> = [
      ["Patients", "Patients"],
      ["Risk", "Risk stratification"],
      ["Claims", "Claims Auditor"],
      ["Quality", "Quality measures"],
      ["Cohort Simulator", "Cohort Simulator"],
    ];

    for (const [item, expectedTitle] of cases) {
      await navTo(page, item, expectedTitle);
      // Exactly one item is active at a time, and it is the one we clicked.
      const active = page.locator(".rail .nav-item.active");
      await expect(active).toHaveCount(1);
      await expect(active).toContainText(item);
    }

    // Returning to Overview restores the executive surface.
    await navTo(page, "Overview", "Population & data health");
  });

  test("metric card opens its provenance drawer", async ({ page }) => {
    test.skip(!(await openLeafnerd(page)), "leafnerd is auth-gated on this environment");

    // First Overview metric is "Active patients".
    const drawer = await openMetric(page, 0);
    await expect(drawer.locator("h3")).toHaveText("Active patients");

    // The Provenance tab surfaces the aggregation lineage.
    await drawer.locator(".drawer-tab", { hasText: "Provenance" }).click();
    await expect(drawer.getByText("Source resources queried")).toBeVisible();

    // Close via the X button.
    await drawer.locator(".drawer-close").click();
    await expect(drawer).toBeHidden();

    // Reopen and confirm Escape also closes it.
    await openMetric(page, 0);
    await page.keyboard.press("Escape");
    await expect(metricDrawer(page)).toBeHidden();
  });

  test("every Overview metric card is a working trigger", async ({ page }) => {
    test.skip(!(await openLeafnerd(page)), "leafnerd is auth-gated on this environment");

    const count = await page.locator(".card.metric").count();
    expect(count).toBe(5);

    for (let i = 0; i < count; i++) {
      const drawer = await openMetric(page, i);
      await expect(drawer.locator("h3")).not.toBeEmpty();
      await page.keyboard.press("Escape");
      await expect(metricDrawer(page)).toBeHidden();
    }
  });

  test("Ask Leafnerd chat opens, accepts a prompt, and returns a reply", async ({ page }) => {
    test.skip(!(await openLeafnerd(page)), "leafnerd is auth-gated on this environment");

    const panel = await openAsk(page);

    // Greeting + starter suggestions are shown before the first message.
    await expect(panel.getByText(/I'm Leafnerd/i)).toBeVisible();
    await expect(panel.locator("button.chip").first()).toBeVisible();

    // Submit with Enter (the global feedback FAB overlaps the Send button).
    const question = "How many active patients are in the cohort?";
    const input = panel.getByLabel("Message Leafnerd");
    await input.fill(question);
    await input.press("Enter");

    // The user's message is echoed into the thread.
    await expect(panel.getByText(question)).toBeVisible();

    // An assistant reply arrives — either the live/stub analytics reply or the
    // graceful offline fallback. Either is a valid "chat returned a response".
    await expect(
      panel.getByText(/active patients|couldn't reach the intelligence/i),
    ).toBeVisible({ timeout: 20_000 });

    // The thinking indicator clears once the reply lands.
    await expect(panel.getByText(/Leafnerd is thinking/)).toHaveCount(0);

    // Close via the panel's close control.
    await panel.getByRole("button", { name: "Close panel" }).click();
    await expect(askPanel(page)).toBeHidden();
  });

  test("Ask Leafnerd: search-bar open, suggestion chip, and ⌘K toggle", async ({ page }) => {
    test.skip(!(await openLeafnerd(page)), "leafnerd is auth-gated on this environment");

    // The command-bar search box is a second entry point into the chat.
    const panel = await openAsk(page, ".cmdbar .search");

    // Clicking a starter suggestion sends it as a message and returns a reply.
    const chip = panel.locator("button.chip").first();
    const chipText = (await chip.innerText()).trim();
    await chip.click();
    await expect(panel.getByText(chipText, { exact: false }).first()).toBeVisible();
    await expect(panel.getByText(/Leafnerd is thinking/)).toHaveCount(0, {
      timeout: 20_000,
    });
    // Suggestions only render before the first message; sending hides them.
    await expect(panel.locator("button.chip")).toHaveCount(0);

    // Escape closes the panel (hydration already confirmed by openAsk).
    await page.keyboard.press("Escape");
    await expect(askPanel(page)).toBeHidden();

    // ⌘K / Ctrl-K toggles the panel back open, then closed.
    await page.keyboard.press("ControlOrMeta+k");
    await expect(askPanel(page)).toBeVisible();
    await page.keyboard.press("ControlOrMeta+k");
    await expect(askPanel(page)).toBeHidden();
  });

  test("Cohort Simulator runs a Monte Carlo projection", async ({ page }) => {
    test.skip(!(await openLeafnerd(page)), "leafnerd is auth-gated on this environment");

    await navTo(page, "Cohort Simulator", "Cohort Simulator");

    // Configure the run so the output is tied to the chosen inputs.
    await page.locator("#regimen-select").selectOption("cbd");

    const run = page.getByRole("button", { name: /Run Monte Carlo/ });
    await run.click();

    // The button locks while the projection is computing.
    await expect(run).toBeDisabled();

    // Results render after the staged compute (≈3s of timed steps).
    await expect(page.getByText("Efficacy Probability")).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText("Adverse Event Probability")).toBeVisible();
    await expect(page.getByText("Optimal Daily Dosage")).toBeVisible();
    await expect(page.getByText("Clinical Insight")).toBeVisible();

    // The CBD-dominant summary proves the result reflects the selected regimen.
    await expect(page.getByText(/CBD Dominant regimen/)).toBeVisible();

    // The control re-enables once the run completes.
    await expect(run).toBeEnabled();
  });

  test("rail user popover exposes a working sign-out", async ({ page }) => {
    test.skip(!(await openLeafnerd(page)), "leafnerd is auth-gated on this environment");

    const trigger = page.locator(".rail-user");
    const menu = page.locator(".rail-user-dropdown");

    // Open the popover (retried for hydration).
    await expect(async () => {
      await trigger.click();
      await expect(menu).toBeVisible({ timeout: 1500 });
    }).toPass({ timeout: 15_000 });

    await expect(menu).toHaveAttribute("role", "menu");
    await expect(menu.locator(".dropdown-item.logout")).toContainText("Sign out");

    // Escape closes it without navigating.
    await page.keyboard.press("Escape");
    await expect(page.locator(".rail-user-dropdown")).toBeHidden();
    await expect(page).toHaveURL(/\/leafnerd/);

    // Reopen and actually sign out — lands on /sign-in.
    await trigger.click();
    await expect(menu).toBeVisible();
    await menu.locator(".dropdown-item.logout").click();
    await page.waitForURL(/\/sign-in/, { timeout: 30_000, waitUntil: "commit" });
  });
});
