#!/usr/bin/env node
// EMR-728 — Asserts every POST | PATCH | DELETE handler under
//   src/app/api/admin/**  and  src/app/api/configs/**
// is wrapped by withAdminMutation (the helper in
// src/lib/auth/with-admin-mutation.ts).
//
// Why: the helper is the single chokepoint for adminMutationLimiter +
// logControllerAction(). A new mutation route that forgets to wrap is a
// missing rate limit AND a missing audit trail — exactly the failure
// mode this check exists to prevent. As Practice Onboarding Controller
// v1 lands ~15 more routes, "remember to wrap" cannot be a code-review
// game; CI has to enforce it.
//
// Wired into .github/workflows/route-auth-manifest.yml alongside the
// existing check-route-auth-manifest.mjs gate.
//
// Exit codes: 0 on success, 1 if any covered route is unwrapped or any
// helper-import is missing.

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const ROUTES_DIR = join(ROOT, "src", "app", "api");

// Surface areas that MUST be covered. Add new prefixes here when a new
// controller surface lands.
const COVERED_PREFIXES = ["admin/", "configs/"];

// Mutation verbs that must run behind the helper. GET is a read; HEAD
// and OPTIONS are also reads — neither needs rate-limit parity.
const MUTATION_VERBS = ["POST", "PATCH", "DELETE", "PUT"];

const HELPER_IMPORT_RE =
  /from\s+["']@\/lib\/auth\/with-admin-mutation["']/;

/** Recursively collect `route.ts` files under `src/app/api/**`. */
function walkRoutes(dir, prefix = "") {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      out.push(...walkRoutes(full, prefix ? `${prefix}/${entry}` : entry));
    } else if (entry === "route.ts") {
      out.push({ file: full, route: prefix });
    }
  }
  return out;
}

function isCovered(routePath) {
  return COVERED_PREFIXES.some((p) => routePath.startsWith(p));
}

/**
 * Inspect a route.ts source for which mutation verbs it exports and
 * whether each is wrapped by withAdminMutation.
 *
 * The helper is used in two forms — both must be recognised:
 *
 *   export const POST = withAdminMutation({ ... }, async ... );
 *   export const DELETE = withAdminMutation<{...}>({ ... }, async ... );
 *
 * A `function`-style export (e.g. `export async function POST(...)`) is
 * always unwrapped by definition.
 */
function analyseFile(source) {
  const findings = {};
  for (const verb of MUTATION_VERBS) {
    const constRe = new RegExp(
      String.raw`export\s+const\s+${verb}\s*=\s*withAdminMutation\b`,
    );
    const exportConstRe = new RegExp(
      String.raw`export\s+const\s+${verb}\s*=`,
    );
    const exportFnRe = new RegExp(
      String.raw`export\s+async\s+function\s+${verb}\b`,
    );

    const wrapped = constRe.test(source);
    const presentAsConst = exportConstRe.test(source);
    const presentAsFn = exportFnRe.test(source);

    if (wrapped) {
      findings[verb] = "wrapped";
    } else if (presentAsConst || presentAsFn) {
      findings[verb] = "unwrapped";
    }
  }
  return findings;
}

const allRoutes = walkRoutes(ROUTES_DIR);
const violations = [];
const missingHelperImport = [];

for (const { file, route } of allRoutes) {
  if (!isCovered(route)) continue;
  const source = readFileSync(file, "utf8");
  const findings = analyseFile(source);

  const unwrappedVerbs = Object.entries(findings)
    .filter(([, status]) => status === "unwrapped")
    .map(([verb]) => verb);

  if (unwrappedVerbs.length > 0) {
    violations.push({ file, route, verbs: unwrappedVerbs });
  }

  const wrappedVerbs = Object.entries(findings)
    .filter(([, status]) => status === "wrapped")
    .map(([verb]) => verb);
  if (wrappedVerbs.length > 0 && !HELPER_IMPORT_RE.test(source)) {
    missingHelperImport.push({ file, route });
  }
}

let failed = false;

if (violations.length > 0) {
  failed = true;
  console.error(
    `\nx ${violations.length} controller mutation route(s) are not wrapped by withAdminMutation:\n`,
  );
  for (const v of violations) {
    const verbs = v.verbs.join(", ");
    console.error(`    /api/${v.route}  (${verbs})`);
    console.error(`      ${relative(ROOT, v.file)}`);
  }
  console.error(
    `\n  Fix: convert the handler to\n` +
      `    export const POST = withAdminMutation(\n` +
      `      { bucket: "admin.<resource>.<verb>" },\n` +
      `      async (req, { actor, params }) => { ... },\n` +
      `    );\n` +
      `\n  See src/lib/auth/with-admin-mutation.ts for the helper contract.`,
  );
}

if (missingHelperImport.length > 0) {
  failed = true;
  console.error(
    `\nx ${missingHelperImport.length} route(s) reference withAdminMutation but don't import it:`,
  );
  for (const v of missingHelperImport) {
    console.error(`    /api/${v.route}  (${relative(ROOT, v.file)})`);
  }
}

if (failed) {
  process.exit(1);
}

const coveredCount = allRoutes.filter((r) => isCovered(r.route)).length;
console.log(
  `+ admin-mutation coverage: ${coveredCount} route file(s) under ${COVERED_PREFIXES.join(", ")} — all mutation verbs wrapped`,
);
