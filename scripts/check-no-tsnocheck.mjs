#!/usr/bin/env node
// Fails when any file under src/ starts with `// @ts-nocheck`.
//
// EPIC 3.1 closed when the @ts-nocheck count hit zero (PRs Q, T, W,
// AA, AB, AD, AE, all bundled into the burn-down). Each fix-in-place
// burn-down surfaced a critical bug that the type-check directive
// was hiding:
//
//   - Dr. undefined in every appointment reminder
//   - undefined × $NaN on every order line item
//   - FORBIDDEN on every clinic/members request
//   - silent HIPAA audit-log loss
//   - silent enterprise sales-lead drop
//   - dead Download buttons in the COA viewer
//
// This rule is what prevents the count from going back up. Adding a
// new @ts-nocheck without first fixing the underlying type errors
// is exactly the trade-off that produced those bugs in the first
// place.
//
// If a real exception is needed, add an in-tree allowlist below.
// Each entry must include WHO and WHEN — silent additions are the
// failure mode this rule is trying to block.

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const SRC = join(ROOT, "src");

// Allowlist: each entry is { path, owner, expires }. Empty by design.
// Adding to this list requires explicit PR review on the entry itself
// and must include a concrete plan for removal.
const ALLOWLIST = [
  // Example shape:
  // { path: "src/some/file.ts", owner: "@scott", expires: "2026-06-01" },
];

const HEADER_RE = /^\s*\/\/\s*@ts-nocheck\b/;

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      // Skip node_modules, .next, .git in case they're nested under src/
      if (entry === "node_modules" || entry === ".next" || entry === ".git") continue;
      walk(full, out);
    } else if (/\.(ts|tsx)$/.test(entry)) {
      out.push(full);
    }
  }
  return out;
}

const offenders = [];
for (const file of walk(SRC)) {
  const head = readFileSync(file, "utf8").split("\n").slice(0, 5).join("\n");
  if (HEADER_RE.test(head)) {
    const rel = relative(ROOT, file);
    const allowed = ALLOWLIST.find((e) => e.path === rel);
    if (allowed) {
      // Expired allowlist entries fail anyway.
      const expired = new Date(allowed.expires) < new Date();
      if (expired) {
        offenders.push({ rel, expired: true, allowed });
      }
    } else {
      offenders.push({ rel, expired: false, allowed: null });
    }
  }
}

if (offenders.length === 0) {
  console.log("✓ no @ts-nocheck files in src/");
  process.exit(0);
}

console.error(`\n✗ ${offenders.length} file(s) start with // @ts-nocheck:\n`);
for (const o of offenders) {
  if (o.expired) {
    console.error(
      `    ${o.rel}  (allowlist expired ${o.allowed.expires}, owner: ${o.allowed.owner})`,
    );
  } else {
    console.error(`    ${o.rel}`);
  }
}
console.error(
  `\n  EPIC 3.1 (the @ts-nocheck zero) closed with the count at 0.\n` +
    `  Every previously-burnt-down @ts-nocheck file was hiding a real,\n` +
    `  user-visible bug — see docs/audit/INDEX_AUDIT_*.md and the PR\n` +
    `  histories #243, #247, #251, #254, #258, #259.\n\n` +
    `  Either fix the underlying type errors OR add an entry to\n` +
    `  ALLOWLIST in scripts/check-no-tsnocheck.mjs with a concrete\n` +
    `  removal plan. Silent additions are exactly what produced the\n` +
    `  bugs above.\n`,
);
process.exit(1);
