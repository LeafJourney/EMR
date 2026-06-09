// EMR-940 / EMR-969 — Agent Fleet metrics API.
//
// GET /api/agents/metrics → { metrics } for the caller's org:
//   - EMR-940: status-count tiles (byStatus) for dashboard filtering.
//   - EMR-969: per-agent running counts + jobs-handled summary for hover cards.
//
// Org-scoped operator surface (see src/lib/rbac/ops-governance). Read-only, so
// it shares the Agent Fleet management predicate.

import { NextResponse } from "next/server";
import { getFleetMetrics } from "@/lib/db/agent-fleet-metrics";
import { canManageAgentFleet } from "@/lib/rbac/ops-governance";
import { requireOrgGovernance } from "../../_shared/ops-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const gate = await requireOrgGovernance(canManageAgentFleet);
  if (!gate.ok) return gate.response;

  const metrics = await getFleetMetrics(gate.organizationId);
  return NextResponse.json({ metrics });
}
