// EMR-625/627/628/629 — provider credentialing API.
//
// GET  /api/credentialing   → credential roster for the caller's org, the live
//                             expiration/recredential alert set, and active
//                             OIG/SAM/license exclusion hits.
// POST /api/credentialing   → create/update one provider's credential profile.
//
// Org-scoped compliance surface (see src/lib/rbac/ops-governance).

import { NextResponse } from "next/server";
import { z } from "zod";
import {
  listActiveExclusions,
  listOrgCredentials,
  scanCredentialAlerts,
  upsertProviderCredential,
} from "@/lib/db/credentialing";
import { canManageCredentialing } from "@/lib/rbac/ops-governance";
import { logOpsAction, requireOrgGovernance } from "../_shared/ops-auth";

export const runtime = "nodejs";

export async function GET() {
  const gate = await requireOrgGovernance(canManageCredentialing);
  if (!gate.ok) return gate.response;

  const [credentials, alerts, exclusions] = await Promise.all([
    listOrgCredentials(gate.organizationId),
    scanCredentialAlerts({ organizationId: gate.organizationId, now: new Date() }),
    listActiveExclusions(gate.organizationId),
  ]);

  return NextResponse.json({ credentials, alerts, exclusions });
}

/** ISO date string → Date, with empty/absent → null and an explicit validity check. */
const isoDate = z
  .string()
  .nullish()
  .transform((v, ctx) => {
    if (v === undefined || v === null || v === "") return null;
    const d = new Date(v);
    if (Number.isNaN(d.getTime())) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "invalid date" });
      return z.NEVER;
    }
    return d;
  });

const upsertInput = z.object({
  providerId: z.string().min(1),
  npi: z.string().max(20).nullish(),
  deaNumber: z.string().max(40).nullish(),
  deaExpiresAt: isoDate,
  licenseNumber: z.string().max(80).nullish(),
  licenseState: z.string().max(8).nullish(),
  licenseExpiresAt: isoDate,
  malpracticeCarrier: z.string().max(160).nullish(),
  malpracticeExpiresAt: isoDate,
  boardCertification: z.string().max(160).nullish(),
  boardCertExpiresAt: isoDate,
  caqhId: z.string().max(40).nullish(),
  credentialedAt: isoDate,
  nextRecredentialAt: isoDate,
  notes: z.string().max(2000).nullish(),
});

export async function POST(req: Request) {
  const gate = await requireOrgGovernance(canManageCredentialing);
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

  const { providerId, ...rest } = parsed.data;
  const row = await upsertProviderCredential({
    organizationId: gate.organizationId,
    providerId,
    npi: rest.npi ?? null,
    deaNumber: rest.deaNumber ?? null,
    deaExpiresAt: rest.deaExpiresAt,
    licenseNumber: rest.licenseNumber ?? null,
    licenseState: rest.licenseState ?? null,
    licenseExpiresAt: rest.licenseExpiresAt,
    malpracticeCarrier: rest.malpracticeCarrier ?? null,
    malpracticeExpiresAt: rest.malpracticeExpiresAt,
    boardCertification: rest.boardCertification ?? null,
    boardCertExpiresAt: rest.boardCertExpiresAt,
    caqhId: rest.caqhId ?? null,
    credentialedAt: rest.credentialedAt,
    nextRecredentialAt: rest.nextRecredentialAt,
    notes: rest.notes ?? null,
  });

  await logOpsAction({
    organizationId: gate.organizationId,
    actorUserId: gate.user.id,
    action: "credentialing.profile_upserted",
    subjectType: "ProviderCredential",
    subjectId: row.id,
    metadata: { providerId: row.providerId, status: row.status },
  });

  return NextResponse.json(row);
}
