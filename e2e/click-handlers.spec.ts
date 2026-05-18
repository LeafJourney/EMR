// Find-and-fix loop, pass 8 — interactive element click crawler.
//
// Walks every public route, enumerates every interactive element
// (button, a[href], [role=button], [role=link], [role=menuitem],
// input[type=submit|button|reset], elements with explicit onclick),
// and synthetically clicks each one in a fresh page context. Records:
//
//   - Console errors fired during the click
//   - Network requests that failed (4xx/5xx) within 2s of the click
//   - Unhandled `dialog` events (alerts/confirms left hanging)
//   - Page crashes / navigation to error pages
//   - Elements that announce themselves as buttons but do nothing
//     (no navigation, no fetch, no state change observable on the page)
//   - Elements with empty accessible names (likely a11y bug)
//
// Output: docs/audit/CLICK_HANDLERS_<date>.md
//
// Why a fresh page per click?  A click can mutate page state (open a
// modal, add to cart, navigate). Subsequent clicks on stale selectors
// would be flaky and findings would cascade. One page = one click,
// captured cleanly.
//
// Why public-only?  Auth bypass isn't wired up for E2E (see
// scripts/capture-auth.mjs for the storage-state replay approach).
// A future pass 9 should run the same crawler against an authed
// session for the (clinician)/(patient)/(operator) surfaces.

import { test, type Page, type BrowserContext } from "@playwright/test";
import { writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";

// Public routes the crawler should visit. Keep in sync with
// public-surfaces.spec.ts:PUBLIC_ROUTES — duplicating here so this
// spec can run in isolation. New commercially-significant public
// surfaces should be added here too.
const ROUTES = [
  "/",
  "/about",
  "/about/team",
  "/about/business",
  "/features",
  "/pricing",
  "/security",
  "/legal/terms",
  "/contact",
  "/book-demo",
  "/education",
  "/leafmart",
  "/leafmart/shop",
  "/store",
  "/marketplace",
  "/foundation",
  "/status",
  "/licensing",
  "/clinicians",
];

// Elements that, if clicked unattended, would either nav off the SPA
// (good — but skip to keep the test bounded) or trigger destructive
// state changes. Match by text or by a stable selector pattern. Be
// generous: false-positives here just mean less coverage, false-
// negatives can break the suite.
const SKIP_TEXT_PATTERNS: RegExp[] = [
  /^sign\s*(in|out|up)$/i,
  /^log\s*(in|out)$/i,
  /\bcheckout\b/i,
  /\bbuy\s*now\b/i,
  /\bdelete\b/i,
  /\bremove\b/i,
  /\bdownload\b/i, // file downloads stall the test
  /\bschedule\s+demo\b/i, // would post to /api/contact each click
  /\bsubmit\b/i, // form submits covered by pass 5
];

// Cap clicks per route — some hub pages have 100+ links and
// commercially we care more about coverage breadth than depth.
// Tune up once we know the baseline finding rate.
const MAX_CLICKS_PER_ROUTE = 25;

// Per-click budget. A handler that takes longer than this is a finding
// in its own right.
const CLICK_OBSERVE_MS = 2000;

type Severity = "high" | "med" | "low";
type Kind =
  | "click_threw"
  | "console_error_on_click"
  | "failed_request_on_click"
  | "unhandled_dialog"
  | "navigated_to_5xx"
  | "empty_accessible_name"
  | "navigated_to_404"
  | "page_crash"
  | "no_observable_effect"; // future — disabled by default (too noisy)

interface Finding {
  url: string;
  selector: string;
  text: string;
  kind: Kind;
  severity: Severity;
  evidence: string;
}

interface ElementProbe {
  /** Selector resolvable from page (CSS), stable enough for a single click */
  selector: string;
  /** Trimmed visible text (or accessible name) for human triage */
  text: string;
  /** Tag name + role for context */
  tagRole: string;
}

const findings: Finding[] = [];
const stats = {
  routesScanned: 0,
  elementsFound: 0,
  clicksAttempted: 0,
  clicksSkipped: 0,
};

function record(f: Finding) {
  findings.push(f);
}

function shouldSkipText(text: string): boolean {
  return SKIP_TEXT_PATTERNS.some((re) => re.test(text));
}

/**
 * Build a CSS selector that can re-target this element in a fresh
 * page load. We can't use the DOM node itself across page contexts;
 * we need a string descriptor we can re-query against.
 *
 * Priority: id > data-testid > role+accessible-name > nth-of-type-path.
 */
async function probeElements(page: Page): Promise<ElementProbe[]> {
  return page.evaluate(() => {
    const interactive: HTMLElement[] = [];
    const seen = new Set<HTMLElement>();

    // Buttons / inputs / explicit role
    const selectors = [
      "button:not([disabled])",
      'a[href]:not([href=""])',
      '[role="button"]:not([aria-disabled="true"])',
      '[role="link"]',
      '[role="menuitem"]',
      'input[type="submit"]:not([disabled])',
      'input[type="button"]:not([disabled])',
      "[onclick]",
    ];
    for (const sel of selectors) {
      document.querySelectorAll(sel).forEach((el) => {
        if (!(el instanceof HTMLElement)) return;
        if (seen.has(el)) return;
        // Skip elements hidden via CSS — Playwright can't click them
        // anyway and findings would be misleading.
        const rect = el.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) return;
        const style = window.getComputedStyle(el);
        if (style.visibility === "hidden" || style.display === "none") return;
        seen.add(el);
        interactive.push(el);
      });
    }

    function cssPath(el: HTMLElement): string {
      // Prefer ids / data-testid
      if (el.id) return `#${CSS.escape(el.id)}`;
      const tid = el.getAttribute("data-testid");
      if (tid) return `[data-testid="${CSS.escape(tid)}"]`;
      // Walk up building nth-of-type
      const parts: string[] = [];
      let node: HTMLElement | null = el;
      while (node && node.tagName !== "HTML") {
        const parent: HTMLElement | null = node.parentElement;
        if (!parent) break;
        const currentTag: string = node.tagName;
        const tag = currentTag.toLowerCase();
        const sibs: Element[] = Array.from(parent.children).filter(
          (c: Element) => c.tagName === currentTag,
        );
        const idx = sibs.indexOf(node) + 1;
        parts.unshift(sibs.length > 1 ? `${tag}:nth-of-type(${idx})` : tag);
        node = parent;
        if (parts.length > 6) break; // selectors longer than this become brittle
      }
      return parts.join(" > ");
    }

    function accessibleName(el: HTMLElement): string {
      const aria = el.getAttribute("aria-label");
      if (aria && aria.trim()) return aria.trim();
      const labelledBy = el.getAttribute("aria-labelledby");
      if (labelledBy) {
        const t = labelledBy
          .split(/\s+/)
          .map((id) => document.getElementById(id)?.textContent ?? "")
          .join(" ")
          .trim();
        if (t) return t;
      }
      const title = el.getAttribute("title");
      if (title && title.trim()) return title.trim();
      const txt = (el.textContent ?? "").replace(/\s+/g, " ").trim();
      if (txt) return txt;
      // Icon buttons sometimes only have an <img alt>
      const img = el.querySelector("img[alt]");
      if (img) return img.getAttribute("alt")!.trim();
      return "";
    }

    return interactive.map((el) => ({
      selector: cssPath(el),
      text: accessibleName(el).slice(0, 80),
      tagRole: `${el.tagName.toLowerCase()}${
        el.getAttribute("role") ? `[role=${el.getAttribute("role")}]` : ""
      }`,
    }));
  });
}

async function clickAndObserve(
  context: BrowserContext,
  routeUrl: string,
  probe: ElementProbe,
): Promise<Finding[]> {
  const local: Finding[] = [];
  const page = await context.newPage();
  const consoleErrors: string[] = [];
  const failed: { url: string; status: number; method: string }[] = [];
  let dialogText: string | null = null;
  let threw: Error | null = null;
  let crashed = false;

  page.on("console", (msg) => {
    if (msg.type() === "error") {
      const t = msg.text();
      if (t.includes("Failed to load resource")) return;
      if (t.includes("[Fast Refresh]")) return;
      consoleErrors.push(t);
    }
  });
  page.on("requestfailed", (req) => {
    if (req.url().includes("/_next/")) return;
    const u = new URL(req.url());
    let host: string;
    try {
      host = new URL(page.url()).host;
    } catch {
      host = "localhost:3000";
    }
    if (u.host !== host) return;
    failed.push({ url: req.url(), status: 0, method: req.method() });
  });
  page.on("response", (res) => {
    if (res.status() >= 400 && res.status() !== 404) {
      if (res.url().startsWith(page.url())) return;
      failed.push({
        url: res.url(),
        status: res.status(),
        method: res.request().method(),
      });
    }
  });
  page.on("dialog", (dialog) => {
    dialogText = `${dialog.type()}: ${dialog.message()}`.slice(0, 200);
    dialog.dismiss().catch(() => {});
  });
  page.on("crash", () => {
    crashed = true;
  });

  try {
    await page.goto(routeUrl, { waitUntil: "domcontentloaded", timeout: 15_000 });
    const locator = page.locator(probe.selector).first();
    // Some elements register but become non-visible after hydration —
    // probe-vs-click race. Skip silently.
    const isVisible = await locator.isVisible({ timeout: 1500 }).catch(() => false);
    if (!isVisible) {
      await page.close();
      return local;
    }
    // Click; capture if it throws. Use `force: false` so we honor real
    // pointer rules. trial:false (default) — actually dispatch.
    await locator.click({ timeout: 5_000, noWaitAfter: true });
  } catch (err) {
    threw = err as Error;
  }

  // Give handlers a beat to fire — fetch calls, dialogs, route changes
  await page.waitForTimeout(CLICK_OBSERVE_MS);

  const landed = page.url();
  let landedStatus: number | null = null;
  if (landed !== routeUrl && landed.startsWith("http")) {
    // We navigated. Use HEAD-equivalent fetch to capture the landed URL's
    // status. (Page.goto already followed redirects, so we re-fetch raw.)
    try {
      const u = new URL(landed);
      const res = await page.request.get(u.pathname + u.search, {
        maxRedirects: 0,
        failOnStatusCode: false,
        timeout: 5_000,
      });
      landedStatus = res.status();
    } catch {
      // ignore — page-level findings will catch crashes
    }
  }

  if (crashed) {
    local.push({
      url: routeUrl,
      selector: probe.selector,
      text: probe.text,
      kind: "page_crash",
      severity: "high",
      evidence: `Click crashed renderer. Target: ${landed}`,
    });
  }

  if (threw) {
    local.push({
      url: routeUrl,
      selector: probe.selector,
      text: probe.text,
      kind: "click_threw",
      severity: "med",
      evidence: threw.message.slice(0, 200),
    });
  }

  if (!probe.text || probe.text.length === 0) {
    local.push({
      url: routeUrl,
      selector: probe.selector,
      text: "(empty)",
      kind: "empty_accessible_name",
      severity: "med",
      evidence: `${probe.tagRole} has no aria-label / title / text — screen readers will announce it as just its tag`,
    });
  }

  for (const ce of consoleErrors) {
    local.push({
      url: routeUrl,
      selector: probe.selector,
      text: probe.text,
      kind: "console_error_on_click",
      severity: "med",
      evidence: ce.slice(0, 300),
    });
  }

  for (const fr of failed) {
    local.push({
      url: routeUrl,
      selector: probe.selector,
      text: probe.text,
      kind: "failed_request_on_click",
      severity: fr.status >= 500 ? "high" : "med",
      evidence: `${fr.method} ${fr.url} → ${fr.status || "network failure"}`,
    });
  }

  if (dialogText) {
    local.push({
      url: routeUrl,
      selector: probe.selector,
      text: probe.text,
      kind: "unhandled_dialog",
      severity: "low",
      evidence: dialogText,
    });
  }

  if (landedStatus !== null) {
    if (landedStatus >= 500) {
      local.push({
        url: routeUrl,
        selector: probe.selector,
        text: probe.text,
        kind: "navigated_to_5xx",
        severity: "high",
        evidence: `click navigated to ${landed} (HTTP ${landedStatus})`,
      });
    } else if (landedStatus === 404) {
      local.push({
        url: routeUrl,
        selector: probe.selector,
        text: probe.text,
        kind: "navigated_to_404",
        severity: "high",
        evidence: `click navigated to ${landed} (HTTP 404)`,
      });
    }
  }

  await page.close();
  return local;
}

// Each route fires up to MAX_CLICKS_PER_ROUTE per-click pages; with
// CLICK_OBSERVE_MS=2s plus nav+probe time this easily breaches the
// 30s default test timeout. The previous attempt called
// `test.setTimeout(180_000)` inside the describe body — that's a no-op
// in Playwright (the static helper only takes effect inside a test or
// hook callback). `test.describe.configure({ timeout })` is the
// supported API for raising the budget for every test in a describe
// group, and it actually works.
test.describe.configure({ timeout: 180_000 });

test.describe("Click handlers — find-and-fix pass 8", () => {
  for (const route of ROUTES) {
    test(`crawl ${route}`, async ({ page, context }) => {
      stats.routesScanned += 1;

      try {
        await page.goto(route, {
          waitUntil: "domcontentloaded",
          timeout: 20_000,
        });
      } catch (err) {
        record({
          url: route,
          selector: "(navigation)",
          text: "(seed page)",
          kind: "click_threw",
          severity: "high",
          evidence: `failed to load route: ${(err as Error).message.slice(0, 200)}`,
        });
        return;
      }

      const probes = await probeElements(page);
      stats.elementsFound += probes.length;

      // Dedupe by selector — accidental duplicate descriptors waste
      // budget. (cssPath should already be unique within a doc, but
      // be defensive.)
      const seen = new Set<string>();
      const queue: ElementProbe[] = [];
      for (const p of probes) {
        if (seen.has(p.selector)) continue;
        seen.add(p.selector);
        queue.push(p);
      }

      let budget = MAX_CLICKS_PER_ROUTE;
      for (const probe of queue) {
        if (budget <= 0) break;
        if (probe.text && shouldSkipText(probe.text)) {
          stats.clicksSkipped += 1;
          continue;
        }
        budget -= 1;
        stats.clicksAttempted += 1;
        const local = await clickAndObserve(context, route, probe);
        for (const f of local) record(f);
      }
    });
  }

  test.afterAll(async () => {
    const date = new Date().toISOString().slice(0, 10);
    const docDir = join(process.cwd(), "docs", "audit");
    if (!existsSync(docDir)) mkdirSync(docDir, { recursive: true });
    const docPath = join(docDir, `CLICK_HANDLERS_${date}.md`);

    const byKind = new Map<Kind, Finding[]>();
    for (const f of findings) {
      const list = byKind.get(f.kind) ?? [];
      list.push(f);
      byKind.set(f.kind, list);
    }

    const byUrl = new Map<string, Finding[]>();
    for (const f of findings) {
      const list = byUrl.get(f.url) ?? [];
      list.push(f);
      byUrl.set(f.url, list);
    }

    const high = findings.filter((f) => f.severity === "high").length;
    const med = findings.filter((f) => f.severity === "med").length;
    const low = findings.filter((f) => f.severity === "low").length;

    const lines: string[] = [
      `# Click-handler findings — ${date}`,
      "",
      `Pass 8: walked ${stats.routesScanned} public routes, found`,
      `**${stats.elementsFound}** interactive elements, attempted`,
      `**${stats.clicksAttempted}** clicks (${stats.clicksSkipped} skipped by safety filter).`,
      "Captured by `e2e/click-handlers.spec.ts`.",
      "",
      `**${findings.length} findings** — ${high} high, ${med} medium, ${low} low.`,
      "",
      `| Kind | Count |`,
      `|---|---|`,
    ];
    for (const [kind, items] of byKind) {
      lines.push(`| ${kind} | ${items.length} |`);
    }
    lines.push("");
    lines.push("## By URL", "");
    for (const [url, fs] of byUrl) {
      lines.push(`### \`${url}\` (${fs.length})`);
      for (const f of fs) {
        lines.push(
          `- **${f.severity.toUpperCase()}** ${f.kind} — \`${f.text}\` (\`${f.selector}\`) — ${f.evidence}`,
        );
      }
      lines.push("");
    }

    writeFileSync(docPath, lines.join("\n"));
    console.log(
      `\n→ pass 8: ${findings.length} findings (${high}H ${med}M ${low}L) across ${byUrl.size} URLs → ${docPath}`,
    );
  });
});
