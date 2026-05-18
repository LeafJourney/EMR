// Find-and-fix loop, pass 10 — authed surfaces.
//
// Walks every URL a signed-in user might land on and records:
//   - HTTP status (5xx is always a fail)
//   - <title> present and non-empty
//   - JavaScript console errors during page load
//   - Failed network requests issued by the page (4xx/5xx)
//   - Any "undefined" / "NaN" / "[object Object]" rendered as text
//
// Findings get written to docs/audit/PLAYWRIGHT_AUTHED_FINDINGS_<date>.md

import { test, type Request } from "@playwright/test";
import { writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";

const AUTHED_ROUTES = [
  "/clinic",
  "/portal",
  "/ops",
  "/practice-admin",
  "/onboarding",
];

interface Finding {
  url: string;
  kind:
    | "5xx"
    | "401_403"
    | "missing_title"
    | "console_error"
    | "failed_subresource"
    | "rendered_undefined"
    | "rendered_nan";
  severity: "high" | "med" | "low";
  evidence: string;
}

const findings: Finding[] = [];

function record(f: Finding) {
  findings.push(f);
}

test.describe("Auth-gated surfaces — find-and-fix pass 10", () => {
  for (const route of AUTHED_ROUTES) {
    test(`scan ${route}`, async ({ page, request }) => {
      const consoleErrors: string[] = [];
      const failedRequests: { url: string; status: number; method: string }[] = [];

      page.on("console", (msg) => {
        if (msg.type() === "error") {
          const text = msg.text();
          if (text.includes("Failed to load resource")) return;
          if (text.includes("[Fast Refresh]")) return;
          consoleErrors.push(text);
        }
      });

      page.on("requestfailed", (req: Request) => {
        if (req.url().includes("/_next/")) return;
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
          if (res.url().startsWith(page.url())) return;
          failedRequests.push({
            url: res.url(),
            status: res.status(),
            method: res.request().method(),
          });
        }
      });

      // Probe raw request
      const res = await request.get(route, { maxRedirects: 0 });
      const status = res.status();
      if (status >= 500) {
        record({
          url: route,
          kind: "5xx",
          severity: "high",
          evidence: `HTTP ${status}`,
        });
        return;
      }
      if (status === 401 || status === 403) {
        record({
          url: route,
          kind: "401_403",
          severity: "high",
          evidence: `HTTP ${status} despite being authenticated`,
        });
        return;
      }

      // Full page load
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
      if (response && (response.status() === 401 || response.status() === 403)) {
        record({
          url: route,
          kind: "401_403",
          severity: "high",
          evidence: `HTTP ${response.status()} despite being authenticated`,
        });
        return;
      }

      const title = await page.title();
      if (!title || title.trim().length === 0) {
        record({
          url: route,
          kind: "missing_title",
          severity: "med",
          evidence: "document.title is empty",
        });
      }

      const bodyText = await page.locator("body").innerText();
      if (/\$\s*NaN|\bNaN\s*%|\bNaN\s+(items|days|mg|ml)/i.test(bodyText)) {
        record({
          url: route,
          kind: "rendered_nan",
          severity: "high",
          evidence: bodyText.split("\n").find((l) => /NaN/i.test(l))?.trim().slice(0, 200) ?? "",
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
      if (/\b(?:Dr\.|Mr\.|Ms\.)\s+undefined\b/.test(bodyText)) {
        record({
          url: route,
          kind: "rendered_undefined",
          severity: "high",
          evidence: bodyText.split("\n").find((l) => /\bundefined\b/.test(l))?.trim().slice(0, 200) ?? "",
        });
      }

      for (const err of consoleErrors) {
        record({ url: route, kind: "console_error", severity: "med", evidence: err.slice(0, 300) });
      }
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
      console.log("\n✓ no findings across", AUTHED_ROUTES.length, "routes");
      return;
    }

    const date = new Date().toISOString().slice(0, 10);
    const docDir = join(process.cwd(), "docs", "audit");
    if (!existsSync(docDir)) mkdirSync(docDir, { recursive: true });
    const docPath = join(docDir, `PLAYWRIGHT_AUTHED_FINDINGS_${date}.md`);

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
      `# Playwright Authed findings — ${date}`,
      "",
      `Pass 10: authed surfaces. Captured by \`e2e/authed-surfaces.spec.ts\`.`,
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
