// EMR-724 — SaaS billing & AI brokering: per-org token-consumption API.
//
// GET /api/saas/usage[?days=N] → { since, days, usage } for the caller's org:
//   token totals + per-bucket + per-model roll-up over a trailing window
//   (default 30 days, clamped to 1..365). Reads the LlmUsage ledger the AI
//   broker writes on every model call.
//
// Org-scoped operator surface (see src/lib/rbac/ops-governance). Read-only.

import { NextResponse } from "next/server";
import { getOrgUsageSummary } from "@/lib/db/llm-usage";
import { canManageAgentFleet } from "@/lib/rbac/ops-governance";
import { requireOrgGovernance } from "../../_shared/ops-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DAY_MS = 86_400_000;
const DEFAULT_DAYS = 30;

function parseDays(raw: string | null): number {
  const n = raw == null ? DEFAULT_DAYS : Number(raw);
  if (!Number.isFinite(n)) return DEFAULT_DAYS;
  return Math.min(365, Math.max(1, Math.trunc(n)));
}

export async function GET(req: Request) {
  const gate = await requireOrgGovernance(canManageAgentFleet);
  if (!gate.ok) return gate.response;

  const days = parseDays(new URL(req.url).searchParams.get("days"));
  const since = new Date(Date.now() - days * DAY_MS);

  const usage = await getOrgUsageSummary(gate.organizationId, since);
  return NextResponse.json({ since: since.toISOString(), days, usage });
}
