// EMR-974 — Agent Fleet enable/disable API.
//
// GET  /api/agent-settings            → explicit settings rows for the caller's org
// POST /api/agent-settings            → upsert one agent's enabled flag
//
// Org-scoped operator surface (see src/lib/rbac/ops-governance). Replaces the
// localStorage-only toggle in the mission-control client with durable per-org
// state the orchestration runner can honor.

import { NextResponse } from "next/server";
import { z } from "zod";
import { listAgentSettings, setAgentEnabled } from "@/lib/db/agent-settings";
import { canManageAgentFleet } from "@/lib/rbac/ops-governance";
import { logOpsAction, requireOrgGovernance } from "../_shared/ops-auth";

export const runtime = "nodejs";

export async function GET() {
  const gate = await requireOrgGovernance(canManageAgentFleet);
  if (!gate.ok) return gate.response;

  const rows = await listAgentSettings(gate.organizationId);
  return NextResponse.json({ settings: rows });
}

const upsertInput = z.object({
  agentName: z.string().min(1).max(120),
  enabled: z.boolean(),
});

export async function POST(req: Request) {
  const gate = await requireOrgGovernance(canManageAgentFleet);
  if (!gate.ok) return gate.response;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const parsed = upsertInput.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_input", issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const row = await setAgentEnabled({
    organizationId: gate.organizationId,
    agentName: parsed.data.agentName,
    enabled: parsed.data.enabled,
    updatedById: gate.user.id,
  });

  await logOpsAction({
    organizationId: gate.organizationId,
    actorUserId: gate.user.id,
    action: parsed.data.enabled ? "agent_fleet.enabled" : "agent_fleet.disabled",
    subjectType: "AgentSetting",
    subjectId: row.id,
    metadata: { agentName: row.agentName, enabled: row.enabled },
  });

  return NextResponse.json(row);
}
