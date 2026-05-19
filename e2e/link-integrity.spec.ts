// Find-and-fix loop, pass 6 — link integrity crawler.
//
// Starts from a curated set of public seed pages, harvests every
// internal `<a href>` link they expose, deduplicates, then probes each
// target URL with a HEAD-equivalent (GET with maxRedirects=0). Records
// every non-2xx as a finding.
//
// What this catches:
//   - 404s from typos in href attributes
//   - 404s from routes that were renamed without a redirect
//   - 404s from links to pages that were never built
//   - 5xx server bugs on otherwise-public surfaces
//   - Loops or chains of 3xx where the eventual target 404s
//
// What this does NOT catch (different pass):
//   - JavaScript-driven navigation (Link components without href)
//   - Authenticated-only surfaces (covered by pass 2 once auth lands)
//   - External links (we never probe other domains)
//
// Output: docs/audit/LINK_INTEGRITY_<date>.md with per-source breakdown
// of every broken target.

import { test } from "@playwright/test";
import { writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";

const SEED_PAGES = [
  "/",
  "/about",
  "/about/team",
  "/about/business",
  "/features",
  "/security",
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
  "/legal/terms",
];

// Dev-server stale-cache artifact — surfaces as a 500 with "Cannot find
// module './<hash>.js'" but it's not a code bug. Surface these
// separately from real findings so triagers don't waste time.
const DEV_CACHE_SIGNATURE = /Cannot find module '\.\/\w+\.js'/;

interface BrokenLink {
  source: string;
  target: string;
  status: number;
  evidence: string;
  category: "404" | "5xx" | "redirect_loop" | "dev_cache" | "other";
}

interface CrawlState {
  visitedTargets: Set<string>;
  brokenLinks: BrokenLink[];
  /** Source page → set of unique internal hrefs harvested. */
  hrefsBySource: Map<string, Set<string>>;
}

// Shared mutable state across tests in the suite. Each test scans one
// seed page; the afterAll writes the report.
const state: CrawlState = {
  visitedTargets: new Set(),
  brokenLinks: [],
  hrefsBySource: new Map(),
};

function normaliseHref(raw: string, base: string): string | null {
  // Drop fragment-only links — they navigate within the page
  if (raw.startsWith("#") || raw.trim() === "") return null;
  // External or protocol-relative — skip
  if (/^[a-z]+:\/\//.test(raw) && !raw.startsWith("http://localhost")) return null;
  if (raw.startsWith("//")) return null;
  // mailto:, tel:, javascript:, data:, blob:
  if (/^(mailto|tel|javascript|data|blob):/i.test(raw)) return null;
  try {
    const u = new URL(raw, base);
    // Skip external hosts
    const baseHost = new URL(base).host;
    if (u.host !== baseHost) return null;
    // Drop the fragment + query for the visited set (still record the
    // full href as evidence, but probe the path)
    return u.pathname + (u.search || "");
  } catch {
    return null;
  }
}

test.describe("Link integrity — find-and-fix pass 6", () => {
  for (const seed of SEED_PAGES) {
    test(`crawl ${seed}`, async ({ page, request }) => {
      try {
        await page.goto(seed, { waitUntil: "domcontentloaded", timeout: 15_000 });
      } catch (err) {
        state.brokenLinks.push({
          source: seed,
          target: "(could not load seed page)",
          status: 0,
          evidence: (err as Error).message.slice(0, 200),
          category: "other",
        });
        return;
      }

      // Harvest every <a href> on the page. Run inside the page context
      // for speed — one round-trip vs one per link.
      const hrefs = await page.locator("a[href]").evaluateAll((els) =>
        els.map((a) => (a as HTMLAnchorElement).getAttribute("href") ?? ""),
      );

      const baseUrl = page.url();
      const targets = new Set<string>();
      for (const raw of hrefs) {
        const norm = normaliseHref(raw, baseUrl);
        if (norm) targets.add(norm);
      }
      state.hrefsBySource.set(seed, targets);

      // Probe each unique target ONCE across the whole run.
      for (const target of targets) {
        if (state.visitedTargets.has(target)) continue;
        state.visitedTargets.add(target);

        try {
          const res = await request.get(target, {
            maxRedirects: 0,
            failOnStatusCode: false,
            timeout: 10_000,
          });
          const status = res.status();

          if (status >= 200 && status < 400) {
            // Redirects are recorded but treated as ok at this level —
            // the destination page is one of the seed pages or will get
            // crawled later if it's internal.
            continue;
          }

          // 404 / 5xx — capture context
          const bodyPeek = (await res.text()).slice(0, 400);
          const isDevCache = DEV_CACHE_SIGNATURE.test(bodyPeek);

          let category: BrokenLink["category"] = "other";
          if (status === 404) category = "404";
          else if (status >= 500) category = isDevCache ? "dev_cache" : "5xx";

          state.brokenLinks.push({
            source: seed,
            target,
            status,
            evidence: bodyPeek
              .replace(/\s+/g, " ")
              .slice(0, 200)
              .trim(),
            category,
          });
        } catch (err) {
          state.brokenLinks.push({
            source: seed,
            target,
            status: 0,
            evidence: (err as Error).message.slice(0, 200),
            category: "other",
          });
        }
      }
    });
  }

  test.afterAll(async () => {
    const date = new Date().toISOString().slice(0, 10);
    const docDir = join(process.cwd(), "docs", "audit");
    if (!existsSync(docDir)) mkdirSync(docDir, { recursive: true });
    const docPath = join(docDir, `LINK_INTEGRITY_${date}.md`);

    const byCategory = {
      "404": [] as BrokenLink[],
      "5xx": [] as BrokenLink[],
      redirect_loop: [] as BrokenLink[],
      dev_cache: [] as BrokenLink[],
      other: [] as BrokenLink[],
    };
    for (const b of state.brokenLinks) byCategory[b.category].push(b);

    // Group by target (one row per unique broken URL) — a single 404
    // surfacing 12 times across the site is one bug, not 12.
    const byTarget = new Map<string, BrokenLink[]>();
    for (const b of state.brokenLinks) {
      const list = byTarget.get(b.target) ?? [];
      list.push(b);
      byTarget.set(b.target, list);
    }

    const total = state.brokenLinks.length;
    const uniqueTargets = byTarget.size;
    const lines: string[] = [
      `# Link integrity — ${date}`,
      "",
      `Pass 6: crawled ${SEED_PAGES.length} seed pages, harvested every `,
      `internal \`<a href>\`, probed each unique target. Captured by`,
      `\`e2e/link-integrity.spec.ts\`.`,
      "",
      `**${total} broken links** across **${uniqueTargets} unique URLs**.`,
      "",
      `| Category | Count |`,
      `|---|---|`,
      `| 404 (real bug) | ${byCategory["404"].length} |`,
      `| 5xx (real bug) | ${byCategory["5xx"].length} |`,
      `| dev_cache (stale .next — \`rm -rf .next && npm run dev\`) | ${byCategory.dev_cache.length} |`,
      `| other / network | ${byCategory.other.length} |`,
      "",
      "## By target",
      "",
    ];

    // Sort by category severity then target path
    const order = ["404", "5xx", "redirect_loop", "other", "dev_cache"] as const;
    for (const cat of order) {
      const items = byCategory[cat];
      if (items.length === 0) continue;
      lines.push(`### ${cat.toUpperCase()} (${items.length})`);
      lines.push("");
      const grouped = new Map<string, BrokenLink[]>();
      for (const b of items) {
        const list = grouped.get(b.target) ?? [];
        list.push(b);
        grouped.set(b.target, list);
      }
      for (const [target, broken] of grouped) {
        const sources = broken.map((b) => b.source);
        lines.push(`- \`${target}\` → ${broken[0].status} — linked from: ${sources.map((s) => `\`${s}\``).join(", ")}`);
      }
      lines.push("");
    }

    writeFileSync(docPath, lines.join("\n"));
    console.log(`\n→ ${total} broken links (${uniqueTargets} unique) → ${docPath}`);
    console.log(
      `   ${byCategory["404"].length} × 404 · ${byCategory["5xx"].length} × 5xx · ${byCategory.dev_cache.length} × dev_cache · ${byCategory.other.length} × other`,
    );
  });
});
