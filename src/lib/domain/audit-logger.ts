// @ts-nocheck
import { prisma } from "@/lib/db/prisma";

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
  actorId: string; // The user who performed the action
  targetId?: string; // The patient or entity acted upon
  action: AuditActionType;
  metadata?: Record<string, any>;
  ipAddress?: string;
}

/**
 * Creates an immutable audit log entry for HIPAA compliance and security tracking.
 * 
 * EMR-102: This function is required for all destructive or PHI-access operations.
 */
export async function createAuditLog(params: CreateAuditLogParams) {
  try {
    await prisma.auditLog.create({
      data: {
        organizationId: params.organizationId,
        actorId: params.actorId,
        targetId: params.targetId,
        action: params.action,
        metadata: params.metadata || {},
        ipAddress: params.ipAddress,
        // The Prisma schema handles timestamping (createdAt)
      }
    });
  } catch (error) {
    // In a production environment, if audit logging fails, the operation itself 
    // should potentially fail (fail-secure). For now, we log to Sentry/Console.
    console.error("[AUDIT_LOG_ERROR] Failed to write audit log:", error);
    
    // We do not throw here in V1 to prevent breaking core workflows if the audit table is locked,
    // but this should be reconsidered in a strict HIPAA setting.
  }
}
