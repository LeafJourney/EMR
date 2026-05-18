// Triage classifier for failed staging-pipeline runs.
//
// Reads a structured failure summary (test names, error excerpts, the
// merge commit's touched paths) from stdin and prints a routing decision
// as JSON on stdout. The triage workflow at
// .github/workflows/staging-test-triage.yml calls this via
// `npx tsx scripts/triage-staging-failure.ts` and pipes the failure
// context in.
//
// Why a separate script: keeping classification logic in TypeScript with
// unit tests means we can evolve the heuristics safely. A shell-script
// classifier would have to be exercised end-to-end every time we want
// to change a rule, which is slow and gappy.
//
// Routing contract — there are exactly three outcomes:
//
//   action="rerun"
//     The failure signature looks transient (timeout, network reset,
//     target page closed mid-test). Re-run the failed jobs once. If the
//     next run hits the same signature, the workflow upgrades the
//     classification to "autofix" (no infinite reruns).
//
//   action="autofix"
//     The failure is a real assertion on a low-risk surface (public
//     marketing or storefront route the diff didn't touch, OR a clear
//     code-driven failure outside auth/PHI). Triage opens an
//     `autofix-needed` issue with the full context so a human or a
//     follow-up Claude task can pick it up. Production stays gated.
//
//   action="escalate"
//     The failure is on a sensitive surface (auth, PHI, billing,
//     onboarding controller) OR the diff touched files in those areas.
//     No autofix attempt — open a `pipeline-escalate` issue, ping
//     code-owners. The pipeline never auto-deploys past this.
//
// The "risk" field is purely advisory for the human triager; routing
// is decided by `action`.

import { stdin } from "node:process";

export type Risk = "low" | "medium" | "high";
export type Signal = "flake" | "regression" | "unknown";
export type Action = "rerun" | "autofix" | "escalate";

export interface FailureContext {
  /** Identifier of the run we're triaging — for the issue body. */
  workflowRunId: number;
  /** Merge commit SHA the pipeline ran against. */
  headSha: string;
  /** Whichever job failed inside the pipeline (e.g. "Automated Tests (Staging)"). */
  failedJobName: string;
  /** Failed Playwright tests as reported by the run. */
  failedTests: FailedTest[];
  /** Paths touched by the merge commit (used to weigh blast radius). */
  changedPaths: string[];
  /** How many times this signature has already been re-run. Defaults to 0. */
  rerunCount?: number;
}

export interface FailedTest {
  /** Spec file relative path, e.g. "e2e/link-integrity.spec.ts". */
  file: string;
  /** Full test title incl. describe chain. */
  title: string;
  /** First line(s) of the captured error — used for flake heuristics. */
  error: string;
}

export interface TriageDecision {
  risk: Risk;
  signal: Signal;
  action: Action;
  reason: string;
  /** Stable per-failure hash for issue dedupe + iteration tracking. */
  failureSignature: string;
}

// ---------------------------------------------------------------------------
// Heuristics
// ---------------------------------------------------------------------------

/** Transient-failure signatures. These are network/timing artifacts, not bugs. */
const FLAKE_PATTERNS = [
  /Test timeout of \d+ms exceeded/i,
  /Target page, context or browser has been closed/i,
  /net::ERR_(?:CONNECTION_RESET|NETWORK_CHANGED|TIMED_OUT|EMPTY_RESPONSE)/i,
  /ECONNRESET/i,
  /EAI_AGAIN/i,
  /socket hang up/i,
  /ETIMEDOUT/i,
  /Navigation timeout of \d+ms exceeded/i,
];

/** Route prefixes considered high-risk: auth, PHI, billing, controller. */
const HIGH_RISK_TEST_PREFIXES = [
  "/portal",
  "/clinic",
  "/ops",
  "/admin",
  "/onboarding",
  "/sign-in",
  "/sign-up",
];

/** API paths whose failure means PHI / money / privileged access is broken. */
const HIGH_RISK_API_SUBSTRINGS = [
  "/api/auth",
  "/api/imaging",
  "/api/billing",
  "/api/configs",
  "/api/webhooks",
  "/api/admin",
  "/api/leafmart/checkout",
];

/** Source paths whose modification widens blast radius regardless of test surface. */
const HIGH_RISK_PATH_PATTERNS = [
  /^src\/lib\/auth\//,
  /^src\/lib\/rbac\//,
  /^src\/lib\/db\//,
  /^src\/middleware\.ts$/,
  /^prisma\/schema\.prisma$/,
  /^prisma\/migrations\//,
  /^src\/app\/api\/(auth|admin|configs|webhooks|imaging|billing)\//,
  /^src\/app\/\(clinician\)\//,
  /^src\/app\/\(operator\)\//,
  /^src\/app\/\(patient\)\//,
  /^src\/app\/\(super-admin\)\//,
];

/** Max times we'll auto-rerun the same failure before escalating. */
export const RERUN_BUDGET = 2;

// ---------------------------------------------------------------------------
// Classifier
// ---------------------------------------------------------------------------

export function classify(ctx: FailureContext): TriageDecision {
  const sig = computeSignature(ctx);
  const rerunCount = ctx.rerunCount ?? 0;

  if (ctx.failedTests.length === 0) {
    // Pipeline failed but we couldn't parse which tests. Be conservative.
    return {
      risk: "high",
      signal: "unknown",
      action: "escalate",
      reason:
        "Job failed but no failed tests were parsed from the report. " +
        "Could be infra/setup failure; safer to escalate.",
      failureSignature: sig,
    };
  }

  // 1) Diff touches a high-risk path → escalate regardless of which test failed.
  const sensitiveChange = ctx.changedPaths.find((p) =>
    HIGH_RISK_PATH_PATTERNS.some((re) => re.test(p)),
  );
  if (sensitiveChange) {
    return {
      risk: "high",
      signal: "regression",
      action: "escalate",
      reason:
        `Diff touches sensitive path: ${sensitiveChange}. ` +
        `No autofix attempted on auth/PHI/billing surfaces.`,
      failureSignature: sig,
    };
  }

  // 2) Any failing test runs against a high-risk surface → escalate.
  const sensitiveTest = ctx.failedTests.find((t) =>
    testTouchesSensitiveSurface(t),
  );
  if (sensitiveTest) {
    return {
      risk: "high",
      signal: "regression",
      action: "escalate",
      reason:
        `Failed test exercises a sensitive surface: "${sensitiveTest.title}". ` +
        `No autofix attempted on auth/PHI/billing surfaces.`,
      failureSignature: sig,
    };
  }

  // 3) Pure flake — every failed test matches a known transient pattern.
  const allFlaky = ctx.failedTests.every((t) => isFlakyError(t.error));
  if (allFlaky) {
    if (rerunCount >= RERUN_BUDGET) {
      // We've already re-run twice. Stop calling it a flake and start
      // investigating — but keep risk low because surface is non-sensitive.
      return {
        risk: "medium",
        signal: "regression",
        action: "autofix",
        reason:
          `Same transient signature failed ${rerunCount + 1} times in a row — ` +
          `treating as a real bug. Opening autofix issue.`,
        failureSignature: sig,
      };
    }
    return {
      risk: "low",
      signal: "flake",
      action: "rerun",
      reason:
        `All ${ctx.failedTests.length} failures match known transient patterns ` +
        `(timeout / network / page-closed). Re-running ` +
        `(attempt ${rerunCount + 1}/${RERUN_BUDGET}).`,
      failureSignature: sig,
    };
  }

  // 4) Real failure on a low-risk public surface → autofix.
  return {
    risk: "medium",
    signal: "regression",
    action: "autofix",
    reason:
      `${ctx.failedTests.length} test(s) failed on public/non-sensitive surfaces ` +
      `with non-flake errors. Suitable for autofix workflow.`,
    failureSignature: sig,
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isFlakyError(error: string): boolean {
  return FLAKE_PATTERNS.some((re) => re.test(error));
}

/**
 * Does this test exercise a sensitive surface? Two ways to qualify:
 *   1. The test title mentions a high-risk route prefix.
 *   2. The error mentions a high-risk API path (e.g. a fetch to /api/auth/...).
 */
function testTouchesSensitiveSurface(t: FailedTest): boolean {
  const haystack = `${t.title}\n${t.error}`;
  for (const prefix of HIGH_RISK_TEST_PREFIXES) {
    // Look for the prefix as a path token (next char is "/", ")", or space)
    // so "/portal" doesn't match "/portal-marketing".
    const re = new RegExp(
      `${escapeRegex(prefix)}(?=[/)\\s"'\\\\]|$)`,
      "i",
    );
    if (re.test(haystack)) return true;
  }
  for (const api of HIGH_RISK_API_SUBSTRINGS) {
    if (haystack.includes(api)) return true;
  }
  return false;
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Stable hash of (sorted test titles + first 80 chars of each error).
 * Same failure across multiple runs yields the same signature, so the
 * triage workflow can find the existing issue and comment on it instead
 * of opening a duplicate.
 */
function computeSignature(ctx: FailureContext): string {
  const parts = [...ctx.failedTests]
    .sort((a, b) => a.title.localeCompare(b.title))
    .map((t) => `${t.title}::${t.error.slice(0, 80)}`);
  return fnv1a(parts.join("|")).toString(16).padStart(8, "0");
}

/** FNV-1a 32-bit. Deterministic, no crypto dep — good enough for dedupe. */
function fnv1a(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

// ---------------------------------------------------------------------------
// CLI entrypoint — only runs when invoked directly, not when imported by tests.
// ---------------------------------------------------------------------------

async function readAllStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of stdin) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString("utf8");
}

async function main(): Promise<void> {
  const raw = await readAllStdin();
  if (!raw.trim()) {
    process.stderr.write(
      "triage-staging-failure: expected FailureContext JSON on stdin\n",
    );
    process.exit(2);
  }
  const ctx = JSON.parse(raw) as FailureContext;
  const decision = classify(ctx);
  process.stdout.write(JSON.stringify(decision, null, 2));
  process.stdout.write("\n");
}

// `import.meta.url` would be cleaner, but the project's tsx config makes
// the simple "are we the entrypoint?" check via process.argv[1] more
// reliable across module systems.
if (process.argv[1]?.endsWith("triage-staging-failure.ts")) {
  void main();
}
