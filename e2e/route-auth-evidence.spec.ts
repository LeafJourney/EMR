// Find-and-fix loop, pass 4 — unauthed-access audit.
//
// Hits each route flagged `needs_review` in docs/security/route-auth.yaml
// from a clean (no-cookies, no-auth-header) HTTP context. Records the
// actual response. Routes that return 200 / 400-validation are the worst
// case — they processed an anonymous request, possibly mutating state or
// burning LLM tokens. Routes that return 401 / 403 are correctly gated.
//
// Output: docs/audit/ROUTE_AUTH_EVIDENCE_<date>.md
//
// This pass produces the hard evidence the manifest's review-due
// tickets need to close. After triage:
//   - 401/403 responses → confirm + flip manifest entry to `required`
//   - 200/2xx responses → file a P0 ticket; the route IS unauthed
//   - validation errors (400) → still need auth — file a P1 ticket
//
// Why a spec instead of curl? Each probe captures method + status +
// truncated body + redirect target + content-type. Curl loses that
// structure. Plus this is regression-testable.

import { test } from "@playwright/test";
import { writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";

interface Probe {
  /** Route path including method placeholder values where needed. */
  path: string;
  /** HTTP methods to test against this route. */
  methods: Array<"GET" | "POST" | "PUT" | "PATCH" | "DELETE">;
  /** Optional JSON body for non-GET methods. Use the smallest payload
   *  that will satisfy any pre-auth validation. */
  body?: Record<string, unknown>;
  /** Reason this route is on the audit. */
  manifestNote: string;
}

// All 17 routes flagged needs_review in docs/security/route-auth.yaml.
// Placeholder IDs use the pattern `audit-probe-<n>` so a real row
// match-by-id is impossible — what we're testing is whether the route
// even rejects the request, not whether the IDs exist.
const PROBES: Probe[] = [
  {
    path: "/api/configs/audit-probe-1/apply-specialty",
    methods: ["POST"],
    body: { slug: "internal-medicine" },
    manifestNote: "Onboarding controller. Other config routes use requireImplementationAdmin.",
  },
  {
    path: "/api/specialty-templates",
    methods: ["GET"],
    manifestNote: "Specialty manifest read. Probably safe public; confirm.",
  },
  {
    path: "/api/feedback/whisper",
    methods: ["POST"],
    body: { text: "audit probe", surface: "fab" },
    manifestNote: "Whisper transcription — unmetered cost vector if open.",
  },
  {
    path: "/api/imaging/studies",
    methods: ["GET"],
    manifestNote: "🚨 PHI surface, no auth detected.",
  },
  {
    path: "/api/imaging/studies/audit-probe-1",
    methods: ["GET"],
    manifestNote: "🚨 PHI surface, no auth detected.",
  },
  {
    path: "/api/imaging/studies/audit-probe-1/annotations",
    methods: ["GET", "POST", "DELETE"],
    body: { kind: "audit", payload: {} },
    manifestNote: "🚨 PHI surface, state-changing on POST/DELETE.",
  },
  {
    path: "/api/leafmart/cart/share",
    methods: ["POST"],
    body: { items: [] },
    manifestNote: "Shareable cart link mint — verify rate-limit + opacity.",
  },
  {
    path: "/api/leafmart/account/affirmations",
    methods: ["POST"],
    body: { kind: "audit-probe" },
    manifestNote: "🚨 Patient-bound POST, no auth detected.",
  },
  {
    path: "/api/leafmart/products/audit-probe-1/questions",
    methods: ["POST"],
    body: { question: "audit probe" },
    manifestNote: "Product Q&A — anonymous OK or requires user?",
  },
  {
    path: "/api/leafmart/products/audit-probe-1/reviews",
    methods: ["POST"],
    body: { rating: 5, body: "audit probe" },
    manifestNote: "Product review — likely require auth + verified-purchase.",
  },
  {
    path: "/api/marketplace/tax/calculate",
    methods: ["POST"],
    body: { items: [], destination: { state: "CA" } },
    manifestNote: "Pre-checkout tax calc — public OK if rate-limited.",
  },
  {
    path: "/api/cron/coa-tracker",
    methods: ["POST"],
    body: {},
    manifestNote: "🚨 No secret-header validation detected.",
  },
  {
    path: "/api/cron/reminders",
    methods: ["GET"],
    manifestNote: "🚨 No secret-header validation detected. (Fixed in PR #243 — verify.)",
  },
  {
    path: "/api/share",
    methods: ["POST"],
    body: { kind: "audit-probe" },
    manifestNote: "Share-link mint — verify it requires an authed user.",
  },
  {
    path: "/api/vendor-portal/auth/totp/enroll",
    methods: ["POST"],
    body: {},
    manifestNote: "TOTP enrollment — must require an authenticated session.",
  },
  {
    path: "/api/reports/competitive-analysis",
    methods: ["GET"],
    manifestNote: "🚨 Competitive-analysis report generated without auth.",
  },
  {
    path: "/api/dispensary/ingest",
    methods: ["POST"],
    body: { records: [] },
    manifestNote: "🚨 Ingest endpoint with no auth detected.",
  },
];

interface ProbeResult {
  path: string;
  method: string;
  status: number;
  contentType: string;
  bodyPreview: string;
  verdict: "GATED" | "VALIDATED_BUT_UNGATED" | "OPEN" | "ERROR" | "NOT_FOUND";
  manifestNote: string;
}

const results: ProbeResult[] = [];

test.describe("Route auth evidence — find-and-fix pass 4", () => {
  for (const probe of PROBES) {
    for (const method of probe.methods) {
      test(`${method} ${probe.path}`, async ({ request }) => {
        // Brand-new request context — no cookies, no auth. This is what
        // a stranger from the open internet sees.
        const cleanCtx = await request.storageState();
        // (Playwright's `request` fixture already starts clean if we
        // haven't authed; the storageState above is a sanity probe.)
        void cleanCtx;

        let status = 0;
        let contentType = "";
        let bodyPreview = "";
        let verdict: ProbeResult["verdict"] = "ERROR";

        try {
          const res = await request.fetch(probe.path, {
            method,
            data: probe.body,
            headers: probe.body ? { "Content-Type": "application/json" } : undefined,
            maxRedirects: 0,
            failOnStatusCode: false,
          });
          status = res.status();
          contentType = res.headers()["content-type"] ?? "";
          const text = await res.text();
          bodyPreview = text.slice(0, 240).replace(/\s+/g, " ").trim();

          if (status === 401 || status === 403) {
            verdict = "GATED";
          } else if (status === 404) {
            verdict = "NOT_FOUND";
          } else if (status === 400) {
            // 400 with NO auth check upstream means the route processes
            // the body before checking auth — still ungated for the
            // purpose of this audit.
            verdict = "VALIDATED_BUT_UNGATED";
          } else if (status >= 200 && status < 300) {
            verdict = "OPEN";
          } else if (status === 405) {
            // Method not allowed — different concern, not a verdict
            verdict = "NOT_FOUND";
          } else {
            verdict = "ERROR";
          }
        } catch (err) {
          bodyPreview = `request threw: ${(err as Error).message}`;
        }

        results.push({
          path: probe.path,
          method,
          status,
          contentType,
          bodyPreview,
          verdict,
          manifestNote: probe.manifestNote,
        });
      });
    }
  }

  test.afterAll(async () => {
    const date = new Date().toISOString().slice(0, 10);
    const docDir = join(process.cwd(), "docs", "audit");
    if (!existsSync(docDir)) mkdirSync(docDir, { recursive: true });
    const docPath = join(docDir, `ROUTE_AUTH_EVIDENCE_${date}.md`);

    const byVerdict = {
      GATED: [] as ProbeResult[],
      VALIDATED_BUT_UNGATED: [] as ProbeResult[],
      OPEN: [] as ProbeResult[],
      NOT_FOUND: [] as ProbeResult[],
      ERROR: [] as ProbeResult[],
    };
    for (const r of results) byVerdict[r.verdict].push(r);

    const lines: string[] = [
      `# Route auth evidence — ${date}`,
      "",
      `Pass 4: unauthed POST/GET against each \`needs_review\` route from`,
      `\`docs/security/route-auth.yaml\`. Captured by`,
      `\`e2e/route-auth-evidence.spec.ts\` against the running dev server.`,
      "",
      `Total probes: **${results.length}** across ${PROBES.length} routes.`,
      "",
      `| Verdict | Count | Action |`,
      `|---|---|---|`,
      `| **OPEN** (200/2xx) | ${byVerdict.OPEN.length} | **P0** — flip to \`required\` + add gate now |`,
      `| **VALIDATED_BUT_UNGATED** (400) | ${byVerdict.VALIDATED_BUT_UNGATED.length} | **P0** — route processes body before auth |`,
      `| **GATED** (401/403) | ${byVerdict.GATED.length} | Confirm + flip to \`required\` in manifest |`,
      `| **NOT_FOUND** (404/405) | ${byVerdict.NOT_FOUND.length} | Route or method missing — verify before closing |`,
      `| **ERROR** | ${byVerdict.ERROR.length} | Re-probe; spec failed to capture |`,
      "",
    ];

    for (const v of ["OPEN", "VALIDATED_BUT_UNGATED", "GATED", "NOT_FOUND", "ERROR"] as const) {
      if (byVerdict[v].length === 0) continue;
      lines.push(`## ${v} (${byVerdict[v].length})`, "");
      for (const r of byVerdict[v]) {
        lines.push(`### \`${r.method} ${r.path}\``);
        lines.push(`- **Status:** ${r.status} (${r.contentType || "n/a"})`);
        lines.push(`- **Body preview:** \`${r.bodyPreview || "(empty)"}\``);
        lines.push(`- **Manifest note:** ${r.manifestNote}`);
        lines.push("");
      }
    }

    writeFileSync(docPath, lines.join("\n"));
    console.log(`\n→ ${results.length} probes written to ${docPath}`);
    console.log(
      `   ${byVerdict.OPEN.length} OPEN · ${byVerdict.VALIDATED_BUT_UNGATED.length} VALIDATED-UNGATED · ${byVerdict.GATED.length} GATED · ${byVerdict.NOT_FOUND.length} NOT_FOUND · ${byVerdict.ERROR.length} ERROR`,
    );
  });
});
