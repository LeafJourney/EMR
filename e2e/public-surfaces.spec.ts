// Find-and-fix loop, pass 1 — public surfaces.
//
// Walks every URL a signed-out visitor might land on and records:
//   - HTTP status (5xx is always a fail; 3xx tracks the redirect target)
//   - <title> present and non-empty
//   - <main> landmark present (required by the new marketing layout)
//   - JavaScript console errors during page load
//   - Failed network requests issued by the page (4xx/5xx)
//   - Any "undefined" / "NaN" / "[object Object]" rendered as text
//     (these are the specific failure modes the @ts-nocheck burn-down
//     surfaced — Dr. undefined, undefined × $NaN, etc. — and they're
//     mechanical to detect)
//
// Findings get written to docs/audit/PLAYWRIGHT_FINDINGS_<date>.md as
// a side-effect after the run. Each finding includes:
//   { url, kind, severity, evidence }
// so triage is one grep away.
//
// Why a spec instead of an ad-hoc script? Specs run on a CI gate, give
// us deterministic failure reporting, and can be re-invoked individually
// for regression testing once a fix lands. Ad-hoc scripts get deleted.

import { test, expect, type Page, type Request } from "@playwright/test";
import { writeFileSync, mkdirSync, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

// Routes every signed-out visitor can hit. Order doesn't matter; each is
// independent.
const PUBLIC_ROUTES = [
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
  "/licensing",
];

interface Finding {
  url: string;
  kind:
    | "5xx"
    | "unexpected_redirect"
    | "missing_title"
    | "missing_main"
    | "console_error"
    | "failed_subresource"
    | "rendered_undefined"
    | "rendered_nan"
    | "broken_link";
  severity: "high" | "med" | "low";
  evidence: string;
}

// Collected across the test run. Playwright runs tests in parallel; we
// guard the shared array via the test's worker-info hook isn't necessary
// here since each test only push-appends. The final dump happens in
// test.afterAll.
const findings: Finding[] = [];

function record(f: Finding) {
  findings.push(f);
}

test.describe("Public surfaces — find-and-fix pass 1", () => {
  for (const route of PUBLIC_ROUTES) {
    test(`scan ${route}`, async ({ page, request }) => {
      const consoleErrors: string[] = [];
      const failedRequests: { url: string; status: number; method: string }[] = [];

      page.on("console", (msg) => {
        if (msg.type() === "error") {
          const text = msg.text();
          // Skip noisy / known-benign patterns. Add more entries as
          // they get triaged — each entry should reference a
          // ticket or a finding.
          if (text.includes("Failed to load resource")) return; // covered by `requestfailed`
          if (text.includes("[Fast Refresh]")) return; // dev-only
          consoleErrors.push(text);
        }
      });

      page.on("requestfailed", (req: Request) => {
        // Skip /_next/* — those are Next.js dev framework chunks. Failures
        // here indicate a stale .next cache, not a product bug. Run
        // `rm -rf .next && npm run dev` to clear them.
        if (req.url().includes("/_next/")) return;
        // Skip third-party hosts that intermittently fail and aren't
        // ours to fix (Clerk dev assets, font CDNs).
        const u = new URL(req.url());
        if (u.host !== new URL(page.url()).host) return;
        failedRequests.push({
          url: req.url(),
          status: 0,
          method: req.method(),
        });
      });
      page.on("response", (res) => {
        if (res.status() >= 400 && res.status() !== 404) {
          if (res.url().startsWith(page.url())) return; // top-level handled separately
          failedRequests.push({
            url: res.url(),
            status: res.status(),
            method: res.request().method(),
          });
        }
      });

      // Probe the route first so we can record the raw status before
      // Playwright follows redirects.
      const res = await request.get(route, { maxRedirects: 0 });
      const status = res.status();
      if (status >= 500) {
        record({
          url: route,
          kind: "5xx",
          severity: "high",
          evidence: `HTTP ${status}`,
        });
        // Don't try to render — page will error in Playwright too.
        return;
      }
      if (status >= 300 && status < 400) {
        const location = res.headers()["location"] ?? "";
        // We expect /portal → /sign-in. Anything else marketing-side
        // that redirects to / is suspicious.
        const isPortal = route.startsWith("/portal");
        const isHomeRedirect = location === "/" || location.endsWith("//");
        if (!isPortal && isHomeRedirect) {
          record({
            url: route,
            kind: "unexpected_redirect",
            severity: "med",
            evidence: `${status} → ${location} (marketing surface should not redirect home)`,
          });
        }
      }

      // Full page load. Playwright follows redirects by default; that's
      // fine — we recorded the raw redirect above.
      let response;
      try {
        response = await page.goto(route, {
          waitUntil: "domcontentloaded",
          timeout: 15_000,
        });
      } catch (err) {
        record({
          url: route,
          kind: "5xx",
          severity: "high",
          evidence: `navigation threw: ${(err as Error).message}`,
        });
        return;
      }

      if (response && response.status() >= 500) {
        record({
          url: route,
          kind: "5xx",
          severity: "high",
          evidence: `HTTP ${response.status()}`,
        });
        return;
      }

      // <title>
      const title = await page.title();
      if (!title || title.trim().length === 0) {
        record({
          url: route,
          kind: "missing_title",
          severity: "med",
          evidence: "document.title is empty",
        });
      }

      // <main> landmark — required for a11y + the "skip to content" link
      const mainCount = await page.locator("main").count();
      if (mainCount === 0) {
        record({
          url: route,
          kind: "missing_main",
          severity: "med",
          evidence: "no <main> element found",
        });
      }

      // Rendered "undefined" / "NaN" — mechanical bug detection.
      const bodyText = await page.locator("body").innerText();
      // Don't match the LITERAL word in marketing copy ("undefined" can
      // appear in legitimate prose). Match the patterns that indicate
      // template-render bugs: " undefined " surrounded by whitespace
      // adjacent to other dynamic text, "$NaN", "[object Object]".
      if (/\$\s*NaN|\bNaN\s*%|\bNaN\s+(items|days|mg|ml)/i.test(bodyText)) {
        record({
          url: route,
          kind: "rendered_nan",
          severity: "high",
          evidence: bodyText
            .split("\n")
            .find((l) => /NaN/i.test(l))
            ?.trim()
            .slice(0, 200) ?? "(snippet n/a)",
        });
      }
      if (/\[object Object\]/.test(bodyText)) {
        record({
          url: route,
          kind: "rendered_undefined",
          severity: "high",
          evidence: "rendered \"[object Object]\"",
        });
      }
      // "Dr. undefined" or similar concatenations
      if (/\b(?:Dr\.|Mr\.|Ms\.)\s+undefined\b/.test(bodyText)) {
        record({
          url: route,
          kind: "rendered_undefined",
          severity: "high",
          evidence: bodyText
            .split("\n")
            .find((l) => /\bundefined\b/.test(l))
            ?.trim()
            .slice(0, 200) ?? "(snippet n/a)",
        });
      }

      // Console errors
      for (const err of consoleErrors) {
        record({
          url: route,
          kind: "console_error",
          severity: "med",
          evidence: err.slice(0, 300),
        });
      }

      // Failed subresources
      for (const fr of failedRequests) {
        record({
          url: route,
          kind: "failed_subresource",
          severity: fr.status >= 500 ? "high" : "med",
          evidence: `${fr.method} ${fr.url} → ${fr.status || "network failure"}`,
        });
      }
    });
  }

  test.afterAll(async () => {
    if (findings.length === 0) {
      console.log("\n✓ no findings across", PUBLIC_ROUTES.length, "routes");
      return;
    }

    // Dump to a dated findings doc
    const date = new Date().toISOString().slice(0, 10);
    const docDir = join(process.cwd(), "docs", "audit");
    if (!existsSync(docDir)) mkdirSync(docDir, { recursive: true });
    const docPath = join(docDir, `PLAYWRIGHT_FINDINGS_${date}.md`);

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
      `# Playwright findings — ${date}`,
      "",
      `Pass 1: public surfaces. Captured by \`e2e/public-surfaces.spec.ts\`.`,
      "",
      `**${findings.length} findings** across ${byUrl.size} URLs — ${high} high, ${med} medium, ${low} low.`,
      "",
      "## By URL",
      "",
    ];
    for (const [url, fs] of byUrl) {
      lines.push(`### \`${url}\` (${fs.length})`);
      for (const f of fs) {
        lines.push(`- **${f.severity.toUpperCase()}** ${f.kind} — ${f.evidence}`);
      }
      lines.push("");
    }

    writeFileSync(docPath, lines.join("\n"));
    console.log(`\n✗ ${findings.length} findings written to ${docPath}`);
  });
});
