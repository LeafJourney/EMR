// HIPAA-relevant audit-log writer. Used by destructive and PHI-access
// operations across the platform.
//
// EMR-102: this function is required for the operations enumerated in
// AuditActionType. The `audit-stub.ts` module under src/lib/auth/ is a
// SEPARATE log scoped to the Practice Onboarding Controller — keep them
// separate so each surface's retention/replay tooling can target the
// right table.
//
// History bug fixed in this rewrite: the previous version had
// `// @ts-nocheck` and wrote to fields that don't exist on the AuditLog
// model — `actorId` (schema is `actorUserId`), `targetId` (schema is
// `subjectId`), and `ipAddress` (not in the schema at all). Every call
// failed with a Prisma validation error, the catch block swallowed it
// to console.error, and we have NO audit rows for the past N months.
//
// Going forward we map onto the schema's actual columns and stash
// caller-provided ipAddress under metadata so HIPAA logging gets
// captured even though the column doesn't exist as a first-class field.

import { prisma } from "@/lib/db/prisma";
import { logger } from "@/lib/observability/log";

export type AuditActionType =
  | "organization.settings_updated"
  | "organization.member_invited"
  | "organization.member_removed"
  | "patient.chart_exported"
  | "patient.phi_accessed"
  | "patient.engagement_tracked"
  | "prescription.issued"
  | "prescription.voided";

export interface CreateAuditLogParams {
  organizationId: string;
  /** The user who performed the action. */
  actorId: string;
  /** The patient or entity acted upon. */
  targetId?: string;
  action: AuditActionType;
  /** Free-form context — IP, user-agent, before/after snapshots, etc. */
  metadata?: Record<string, unknown>;
  /** Inbound request IP. Stored under metadata since the AuditLog
   *  model does not have a dedicated column. */
  ipAddress?: string;
}

/**
 * Creates an immutable audit log entry for HIPAA compliance and security
 * tracking.
 *
 * Failure semantics (v1, deliberate trade-off):
 *   We swallow on failure so a transient DB hiccup doesn't take down the
 *   PHI-access path it audits. The structured logger emission below
 *   ensures the failure is visible in log aggregation. A durable queue
 *   for guaranteed delivery is tracked under EPIC 4.3 (alongside the
 *   ControllerAuditLog work).
 */
export async function createAuditLog(params: CreateAuditLogParams): Promise<void> {
  // Coalesce ipAddress into metadata so callers that supply it don't lose
  // it just because the column doesn't exist. Caller-supplied metadata
  // takes precedence over our derived field.
  const metadata: Record<string, unknown> = {
    ...(params.ipAddress ? { ipAddress: params.ipAddress } : {}),
    ...(params.metadata ?? {}),
  };

  try {
    await prisma.auditLog.create({
      data: {
        organizationId: params.organizationId,
        actorUserId: params.actorId,
        // The schema stores subject as a (subjectType, subjectId) pair;
        // we don't get a discriminator from the caller today, so we
        // record the action's noun-prefix as a best-effort subjectType.
        subjectType: params.action.split(".")[0] || null,
        subjectId: params.targetId ?? null,
        action: params.action,
        metadata: metadata as import("@prisma/client").Prisma.InputJsonValue,
      },
    });
  } catch (err) {
    logger.error({
      event: "audit.write_failed",
      action: params.action,
      organizationId: params.organizationId,
      actorId: params.actorId,
      targetId: params.targetId,
      err,
      message:
        "AuditLog write failed. The operation that triggered this audit " +
        "DID complete; the audit row did not. Reconcile from the calling " +
        "site's structured log if compliance review needs a substitute trail.",
    });
  }
}
