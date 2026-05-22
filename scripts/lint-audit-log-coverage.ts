#!/usr/bin/env tsx
/**
 * EMR-779 — Mutation audit-log coverage linter (informational).
 *
 * Walks every `src/app/api/** /route.ts` and flags any file that exports a
 * state-changing handler (`POST`, `PATCH`, `PUT`, `DELETE`) without calling
 * `prisma.auditLog.create` (or carrying an explicit `// audit:skip` marker).
 *
 * Today's reality: ~10/86 mutation routes write audit rows. That's a known
 * gap (see EMR-779 #20). This script makes the gap visible on every PR so
 * the count can only go down, and so any reviewer can see at a glance which
 * mutating handler is missing an audit hook.
 *
 * Modes:
 *   informational (default) — prints the violation list + count, exits 0
 *   --strict                 — exits 1 if any new violations are introduced
 *                              (we don't ship --strict yet; flip when the
 *                              backlog is paid down)
 *
 * Opt-out: add `// audit:skip:<reason>` anywhere in the file. The reason
 * field is required so reviewers can grep for skip rationales later.
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";

const ROOT = resolve(process.cwd(), "src/app/api");

const MUTATING_HANDLER_RE =
  /^export\s+(?:async\s+function|const)\s+(POST|PATCH|PUT|DELETE)\b/m;
const AUDIT_CALL_RE = /\bauditLog\.create\s*\(/;
const SKIP_MARKER_RE = /\/\/\s*audit:skip:[^\n]+/;

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      out.push(...walk(full));
    } else if (entry === "route.ts" || entry === "route.tsx") {
      out.push(full);
    }
  }
  return out;
}

type Violation = { file: string; handlers: string[] };

function inspect(file: string): Violation | null {
  const src = readFileSync(file, "utf8");

  const handlers = new Set<string>();
  const lines = src.split(/\r?\n/);
  for (const line of lines) {
    const m = MUTATING_HANDLER_RE.exec(line);
    if (m) handlers.add(m[1]);
  }
  if (handlers.size === 0) return null;

  if (AUDIT_CALL_RE.test(src)) return null;
  if (SKIP_MARKER_RE.test(src)) return null;

  return { file, handlers: Array.from(handlers).sort() };
}

function main(): void {
  let files: string[];
  try {
    files = walk(ROOT);
  } catch (err) {
    console.error(`[lint:audit-log] Could not walk ${ROOT}: ${(err as Error).message}`);
    process.exit(2);
  }

  const violations: Violation[] = [];
  for (const file of files) {
    const v = inspect(file);
    if (v) violations.push(v);
  }

  const strict = process.argv.includes("--strict");
  const total = files.filter((f) => {
    const src = readFileSync(f, "utf8");
    return MUTATING_HANDLER_RE.test(src);
  }).length;

  console.log(
    `[lint:audit-log] ${violations.length}/${total} mutating route files do not call auditLog.create.`,
  );
  console.log(
    "[lint:audit-log] Target: 0. Opt-out marker (for routes that genuinely don't audit): `// audit:skip:<reason>`.",
  );

  if (violations.length > 0) {
    console.log("");
    for (const v of violations.slice(0, 200)) {
      const rel = relative(process.cwd(), v.file);
      console.log(`  ${rel}  [${v.handlers.join(",")}]`);
    }
    if (violations.length > 200) {
      console.log(`  …and ${violations.length - 200} more.`);
    }
  }

  if (strict && violations.length > 0) {
    process.exit(1);
  }
  process.exit(0);
}

main();
