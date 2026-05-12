// Find-and-fix loop, pass 7 — axe-core a11y deep-dive.
//
// Runs axe-core against every public route. Captures violations grouped
// by impact (critical / serious / moderate / minor) and dumps to
// docs/audit/A11Y_AXE_<date>.md.
//
// What this catches beyond pass 1's missing-<main> check:
//   - Color-contrast failures (text too light against backgrounds)
//   - Missing alt text on <img> elements
//   - Buttons without accessible names (icon-only without aria-label)
//   - Form labels not linked to inputs
//   - Heading order violations
//   - Empty interactive elements (<a> with no text/aria)
//   - Skip-link target missing
//   - Color used as only signal
//   - Focus-trap escape failures (within modals)
//   - 100+ other a11y rules from the axe ruleset
//
// Rule scope: WCAG 2.1 A + AA + best-practice. Triagers can override
// per-page via `axe.disableRules()` if a finding is intentional
// (e.g., a Storybook-style component sandbox).
//
// Pass 1 already added <main> landmarks via PRs #265 + AI/#273. This
// pass picks up everything else.

import { test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";

const ROUTES = [
  "/",
  "/about",
  "/about/team",
  "/about/business",
  "/features",
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
  "/sign-in",
  "/sign-up",
];

interface AxeFinding {
  url: string;
  ruleId: string;
  impact: "critical" | "serious" | "moderate" | "minor" | "(unknown)";
  description: string;
  helpUrl: string;
  /** Selectors of the failing nodes — first 3, comma-joined. */
  nodes: string;
  /** First failure summary from the first node. */
  failureSummary: string;
}

const findings: AxeFinding[] = [];

test.describe("a11y axe — find-and-fix pass 7", () => {
  for (const route of ROUTES) {
    test(`scan ${route}`, async ({ page }) => {
      try {
        await page.goto(route, { waitUntil: "domcontentloaded", timeout: 15_000 });
      } catch (err) {
        findings.push({
          url: route,
          ruleId: "navigation-failed",
          impact: "critical",
          description: `Failed to load page: ${(err as Error).message.slice(0, 200)}`,
          helpUrl: "",
          nodes: "",
          failureSummary: "",
        });
        return;
      }

      // Give client-side hydration a beat so React renders the full tree
      // before axe scans. 500ms is conservative; bump if findings vary
      // run-to-run.
      await page.waitForTimeout(500);

      const results = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "best-practice"])
        .analyze();

      for (const v of results.violations) {
        const nodes = v.nodes.slice(0, 3).map((n) => n.target.join(" ")).join(" · ");
        findings.push({
          url: route,
          ruleId: v.id,
          impact: (v.impact ?? "(unknown)") as AxeFinding["impact"],
          description: v.description,
          helpUrl: v.helpUrl,
          nodes,
          failureSummary: v.nodes[0]?.failureSummary?.slice(0, 200) ?? "",
        });
      }
    });
  }

  test.afterAll(async () => {
    const date = new Date().toISOString().slice(0, 10);
    const docDir = join(process.cwd(), "docs", "audit");
    if (!existsSync(docDir)) mkdirSync(docDir, { recursive: true });
    const docPath = join(docDir, `A11Y_AXE_${date}.md`);

    const byImpact = {
      critical: [] as AxeFinding[],
      serious: [] as AxeFinding[],
      moderate: [] as AxeFinding[],
      minor: [] as AxeFinding[],
      "(unknown)": [] as AxeFinding[],
    };
    for (const f of findings) byImpact[f.impact].push(f);

    const byRule = new Map<string, AxeFinding[]>();
    for (const f of findings) {
      const list = byRule.get(f.ruleId) ?? [];
      list.push(f);
      byRule.set(f.ruleId, list);
    }

    const lines: string[] = [
      `# A11y axe-core scan — ${date}`,
      "",
      `Pass 7: ran axe-core (WCAG 2.1 A + AA + best-practice rules) against`,
      `${ROUTES.length} public routes. Captured by \`e2e/a11y-axe.spec.ts\`.`,
      "",
      `**${findings.length} violations** across ${byRule.size} distinct rules.`,
      "",
      `| Impact | Count |`,
      `|---|---|`,
      `| critical | ${byImpact.critical.length} |`,
      `| serious  | ${byImpact.serious.length} |`,
      `| moderate | ${byImpact.moderate.length} |`,
      `| minor    | ${byImpact.minor.length} |`,
      "",
      "## By rule (highest signal — one row per rule with all affected URLs)",
      "",
    ];

    // Order rules by impact-weighted count, then by raw count
    const impactWeight = { critical: 4, serious: 3, moderate: 2, minor: 1, "(unknown)": 0 };
    const sortedRules = Array.from(byRule.entries()).sort(([, a], [, b]) => {
      const weightA = a.reduce((sum, x) => sum + (impactWeight[x.impact] ?? 0), 0);
      const weightB = b.reduce((sum, x) => sum + (impactWeight[x.impact] ?? 0), 0);
      return weightB - weightA || b.length - a.length;
    });

    for (const [ruleId, items] of sortedRules) {
      const sample = items[0];
      const impactCounts = items.reduce<Record<string, number>>(
        (acc, x) => ({ ...acc, [x.impact]: (acc[x.impact] ?? 0) + 1 }),
        {},
      );
      const impactLabel = Object.entries(impactCounts)
        .map(([k, v]) => `${v}×${k}`)
        .join(", ");
      lines.push(`### \`${ruleId}\` — ${items.length} total (${impactLabel})`);
      lines.push(`- **Description:** ${sample.description}`);
      lines.push(`- **Help:** ${sample.helpUrl}`);
      lines.push(`- **Affected URLs:** ${items.map((x) => `\`${x.url}\``).join(", ")}`);
      lines.push(`- **Sample failing node:** \`${sample.nodes}\``);
      if (sample.failureSummary) {
        lines.push(`- **Sample summary:** ${sample.failureSummary.replace(/\n/g, " ")}`);
      }
      lines.push("");
    }

    writeFileSync(docPath, lines.join("\n"));
    console.log(`\n→ ${findings.length} a11y violations across ${byRule.size} rules → ${docPath}`);
    console.log(
      `   ${byImpact.critical.length} critical · ${byImpact.serious.length} serious · ${byImpact.moderate.length} moderate · ${byImpact.minor.length} minor`,
    );
  });
});
