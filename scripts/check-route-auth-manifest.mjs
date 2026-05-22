#!/usr/bin/env node
// Validates docs/security/route-auth.yaml against src/app/api/**/route.ts.
//
// Fails (exit 1) when:
//   - A route exists on disk but has no manifest entry.
//   - A manifest entry refers to a route that doesn't exist.
//   - A manifest entry has auth=needs_review with review_due in the past.
//
// Prints a structured diff so PR reviewers can see exactly what's missing.
//
// Wire this into CI by adding a step:
//   - run: node scripts/check-route-auth-manifest.mjs
// in the verify job. (See .github/workflows/security-scan.yml for the
// pattern — co-located here on purpose; this is a security gate.)

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const ROUTES_DIR = join(ROOT, "src", "app", "api");
const MANIFEST_PATH = join(ROOT, "docs", "security", "route-auth.yaml");

const VALID_AUTH_KINDS = new Set([
  "required",
  "public",
  "webhook",
  "cron",
  "token_url",
  "establishes_auth",
  "needs_review",
]);

// ── Tiny YAML reader ────────────────────────────────────────
//
// We only need to read this one file, and the manifest is regular
// (top-level + `routes:` map of route → { methods, auth, owner, notes,
// review_due }). Pulling in a YAML dep for one file would be silly.
//
// Limitations of this reader (intentional — fix the manifest if you hit one):
//   - No anchors / aliases.
//   - String values are taken verbatim, no quote-stripping beyond outer "/'.
//   - Only top-level + 1-level-nested route map are parsed; the
//     per-route fields are simple `key: value` pairs (no nested maps).

function parseManifest(text) {
  const lines = text.split("\n");
  const routes = {};
  let inRoutes = false;
  let currentKey = null;
  let currentEntry = null;

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    // Strip comments after the first `#` that follows whitespace, but
    // not inside quotes — the manifest doesn't quote multi-word values
    // with `#` in them, so this naive strip is safe.
    const noComment = raw.replace(/\s+#.*$/, "");
    const stripped = noComment.replace(/\s+$/, "");
    if (!stripped) continue;
    if (/^\s*#/.test(stripped)) continue;

    if (/^routes:\s*$/.test(stripped)) {
      inRoutes = true;
      continue;
    }
    if (!inRoutes) continue;

    // Route key: 2-space indent, ends with ":"
    const routeMatch = stripped.match(/^  ([^:]+):\s*$/);
    if (routeMatch) {
      currentKey = routeMatch[1].trim();
      currentEntry = {
        methods: [],
        auth: null,
        owner: null,
        notes: null,
        review_due: null,
        // EMR-728 — bucket label that pairs the route with its
        // adminMutationLimiter bucket via withAdminMutation. Optional at
        // the schema level; admin-mutation coverage is enforced by
        // scripts/check-admin-mutation-coverage.mjs (which walks the
        // source, not the manifest).
        rate_limit_bucket: null,
        _line: i + 1,
      };
      routes[currentKey] = currentEntry;
      continue;
    }

    // Field on a route: 4-space indent, "key: value"
    const fieldMatch = stripped.match(/^    ([a-z_]+):\s*(.*)$/);
    if (fieldMatch && currentEntry) {
      const [, key, rawValue] = fieldMatch;
      let value = rawValue.trim();
      // Inline arrays: [a, b, c]
      if (value.startsWith("[") && value.endsWith("]")) {
        value = value
          .slice(1, -1)
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean);
      } else if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      if (key in currentEntry) currentEntry[key] = value;
      continue;
    }
  }

  return routes;
}

// ── Walk the routes dir ─────────────────────────────────────

function walkRoutes(dir, prefix = "") {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      out.push(...walkRoutes(full, prefix ? `${prefix}/${entry}` : entry));
    } else if (entry === "route.ts") {
      out.push(prefix);
    }
  }
  return out;
}

// ── Run ────────────────────────────────────────────────────

const manifest = parseManifest(readFileSync(MANIFEST_PATH, "utf8"));
const onDisk = new Set(walkRoutes(ROUTES_DIR));
const inManifest = new Set(Object.keys(manifest));

const missingFromManifest = [...onDisk].filter((r) => !inManifest.has(r)).sort();
const orphanedInManifest = [...inManifest].filter((r) => !onDisk.has(r)).sort();

const today = new Date();
const overdueReviews = Object.entries(manifest)
  .filter(([, entry]) => {
    if (entry.auth !== "needs_review") return false;
    if (!entry.review_due) return true;
    const due = new Date(String(entry.review_due));
    if (Number.isNaN(due.getTime())) return true;
    return due < today;
  })
  .map(([route, entry]) => ({ route, due: entry.review_due ?? "(missing)" }));

const invalidAuth = Object.entries(manifest)
  .filter(([, entry]) => entry.auth && !VALID_AUTH_KINDS.has(entry.auth))
  .map(([route, entry]) => ({ route, auth: entry.auth }));

let failed = false;

if (missingFromManifest.length) {
  failed = true;
  console.error(
    `\n✗ ${missingFromManifest.length} routes exist on disk with no manifest entry:`,
  );
  for (const r of missingFromManifest) console.error(`    /api/${r}`);
  console.error(`\n  Add an entry under "routes:" in ${relative(ROOT, MANIFEST_PATH)}.`);
}

if (orphanedInManifest.length) {
  failed = true;
  console.error(
    `\n✗ ${orphanedInManifest.length} manifest entries refer to routes that don't exist:`,
  );
  for (const r of orphanedInManifest) console.error(`    ${r}`);
  console.error(`\n  Either restore the route or remove the entry from the manifest.`);
}

if (overdueReviews.length) {
  failed = true;
  console.error(`\n✗ ${overdueReviews.length} needs_review entries are past review_due:`);
  for (const { route, due } of overdueReviews) {
    console.error(`    ${route} (due: ${due})`);
  }
  console.error(`\n  Resolve the classification, or extend review_due with a justification in PR review.`);
}

if (invalidAuth.length) {
  failed = true;
  console.error(`\n✗ ${invalidAuth.length} entries have unknown auth kind:`);
  for (const { route, auth } of invalidAuth) {
    console.error(`    ${route}: auth="${auth}"`);
  }
  console.error(`\n  Valid kinds: ${[...VALID_AUTH_KINDS].join(", ")}`);
}

if (failed) {
  process.exit(1);
}

console.log(
  `✓ route-auth manifest in sync (${onDisk.size} routes, ${
    Object.values(manifest).filter((e) => e.auth === "needs_review").length
  } pending review)`,
);
