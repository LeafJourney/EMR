// EMR-960 — owner default approve/reject decisions API.
//
// GET    /api/approval-defaults                 → all rules for the caller's org
// POST   /api/approval-defaults                 → upsert one rule
// DELETE /api/approval-defaults?id=<id>         → remove one rule (org-scoped)
//
// Owner-level surface (see src/lib/rbac/ops-governance). The orchestration
// approval gate consumes these via resolveDefaultDecisionForOrg().

import { NextResponse } from "next/server";
import { z } from "zod";
import {
  deleteApprovalDefault,
  listApprovalDefaults,
  upsertApprovalDefault,
} from "@/lib/db/approval-defaults";
import { canManageApprovalDefaults } from "@/lib/rbac/ops-governance";
import { logOpsAction, requireOrgGovernance } from "../_shared/ops-auth";

export const runtime = "nodejs";

export async function GET() {
  const gate = await requireOrgGovernance(canManageApprovalDefaults);
  if (!gate.ok) return gate.response;

  const rules = await listApprovalDefaults(gate.organizationId);
  return NextResponse.json({ rules });
}

const upsertInput = z.object({
  scopeType: z.enum(["agent", "workflow"]),
  scopeKey: z.string().min(1).max(160),
  decision: z.enum(["approve", "reject"]),
  enabled: z.boolean().optional(),
  note: z.string().max(500).nullish(),
});

export async function POST(req: Request) {
  const gate = await requireOrgGovernance(canManageApprovalDefaults);
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

  const row = await upsertApprovalDefault({
    organizationId: gate.organizationId,
    scopeType: parsed.data.scopeType,
    scopeKey: parsed.data.scopeKey,
    decision: parsed.data.decision,
    enabled: parsed.data.enabled,
    note: parsed.data.note ?? null,
    createdById: gate.user.id,
  });

  await logOpsAction({
    organizationId: gate.organizationId,
    actorUserId: gate.user.id,
    action: "approval_default.upserted",
    subjectType: "DefaultApprovalDecision",
    subjectId: row.id,
    metadata: {
      scopeType: row.scopeType,
      scopeKey: row.scopeKey,
      decision: row.decision,
      enabled: row.enabled,
    },
  });

  return NextResponse.json(row);
}

export async function DELETE(req: Request) {
  const gate = await requireOrgGovernance(canManageApprovalDefaults);
  if (!gate.ok) return gate.response;

  const id = new URL(req.url).searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "invalid_input" }, { status: 400 });
  }

  const result = await deleteApprovalDefault(gate.organizationId, id);
  if (result.count === 0) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  await logOpsAction({
    organizationId: gate.organizationId,
    actorUserId: gate.user.id,
    action: "approval_default.deleted",
    subjectType: "DefaultApprovalDecision",
    subjectId: id,
  });

  return NextResponse.json({ deleted: result.count });
}
