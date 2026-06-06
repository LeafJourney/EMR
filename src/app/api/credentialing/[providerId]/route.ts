// EMR-625 — single provider credential profile.
//
// GET /api/credentialing/:providerId → the profile + its verification history
//                                      + the provider's payer enrollments.
//
// Org-scoped compliance surface. We re-check that the fetched credential belongs
// to the caller's org before returning it (defense against a cross-tenant id).

import { NextResponse } from "next/server";
import {
  getProviderCredential,
  listPayerEnrollments,
} from "@/lib/db/credentialing";
import { canManageCredentialing } from "@/lib/rbac/ops-governance";
import { requireOrgGovernance } from "../../_shared/ops-auth";

export const runtime = "nodejs";

interface Ctx {
  params: { providerId: string };
}

export async function GET(_req: Request, { params }: Ctx) {
  const gate = await requireOrgGovernance(canManageCredentialing);
  if (!gate.ok) return gate.response;

  const credential = await getProviderCredential(params.providerId);
  if (!credential || credential.organizationId !== gate.organizationId) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const enrollments = await listPayerEnrollments(
    gate.organizationId,
    params.providerId,
  );

  return NextResponse.json({ credential, enrollments });
}
