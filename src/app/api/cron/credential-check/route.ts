// EMR-068 / EMR-627 / EMR-629 — Provider Credentialing monitor.
//
// Background cron that scans persisted ProviderCredential profiles for expiring
// or expired documents (DEA, license, malpractice, board cert) and due
// re-credentialing cycles, and surfaces active OIG/SAM/license exclusion hits.
// Each finding becomes a deduplicated inbox Task for compliance staff.
//
// This replaces the prior mock-only version (which hard-coded
// `isVerified = true`): the expiration/recredential logic is now real and runs
// off the credentialing schema added in EMR-625. External primary-source
// verification (NPPES/OIG/SAM API calls that POPULATE ProviderExclusion /
// CredentialVerification) remains a separate integration; this cron is the
// alerting layer over whatever those sources have already written.

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { logger } from "@/lib/observability/log";
import {
  type CredentialAlert,
  scanCredentialAlerts,
} from "@/lib/db/credentialing";

const DAY_MS = 86_400_000;

/** Create an open Task unless an identical one was already opened in the last 24h. */
async function ensureTask(
  organizationId: string,
  title: string,
  description: string,
): Promise<boolean> {
  const since = new Date(Date.now() - DAY_MS);
  const existing = await prisma.task.findFirst({
    where: { organizationId, title, status: "open", createdAt: { gte: since } },
    select: { id: true },
  });
  if (existing) return false;
  await prisma.task.create({
    data: {
      organizationId,
      title,
      description,
      status: "open",
      assigneeRole: "practice_admin",
    },
  });
  return true;
}

function alertLabel(alert: CredentialAlert): string {
  const noun =
    alert.type === "dea"
      ? "DEA registration"
      : alert.type === "license"
        ? "State license"
        : alert.type === "malpractice"
          ? "Malpractice insurance"
          : alert.type === "board_cert"
            ? "Board certification"
            : "Re-credentialing";
  if (alert.state === "due") return `${noun} due`;
  if (alert.state === "expired") return `${noun} expired`;
  return `${noun} expiring`;
}

export async function POST(req: Request) {
  try {
    const authHeader = req.headers.get("authorization") ?? "";
    const secret = process.env.CRON_SECRET ?? "";
    if (process.env.NODE_ENV === "production" && authHeader !== `Bearer ${secret}`) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    logger.info({ event: "cron.credential_check.started" });

    const now = new Date();
    const groups = await scanCredentialAlerts({ now });

    let tasksCreated = 0;
    for (const group of groups) {
      try {
        for (const alert of group.alerts) {
          const label = alertLabel(alert);
          const title = `[Credentialing] ${label} — provider ${group.providerId}`;
          const when = alert.at.toISOString().slice(0, 10);
          const description =
            `${label} for provider ${group.providerId} (${when}, ` +
            `${alert.daysUntil} day(s)). Review in the credentialing dashboard.`;
          if (await ensureTask(group.organizationId, title, description)) {
            tasksCreated++;
          }
        }
      } catch (err) {
        // One provider's task write failing must not abort the whole run.
        logger.error({
          event: "cron.credential_check.provider_failed",
          providerId: group.providerId,
          error: err instanceof Error ? err.message : String(err),
        });
        continue;
      }
    }

    // EMR-629 — active exclusion hits become lockout tasks.
    const exclusions = await prisma.providerExclusion.findMany({
      where: { status: "active" },
      select: { id: true, organizationId: true, providerId: true, source: true },
    });
    let exclusionTasks = 0;
    for (const ex of exclusions) {
      try {
        const title = `[Credentialing] EXCLUSION HIT (${ex.source}) — provider ${ex.providerId}`;
        const description =
          `Provider ${ex.providerId} matched the ${ex.source} exclusion list. ` +
          `Verify and, if confirmed, suspend billing/scheduling for this provider.`;
        if (await ensureTask(ex.organizationId, title, description)) {
          exclusionTasks++;
        }
      } catch (err) {
        logger.error({
          event: "cron.credential_check.exclusion_failed",
          exclusionId: ex.id,
          error: err instanceof Error ? err.message : String(err),
        });
        continue;
      }
    }

    logger.info({
      event: "cron.credential_check.completed",
      providersWithAlerts: groups.length,
      tasksCreated,
      activeExclusions: exclusions.length,
      exclusionTasks,
    });

    return NextResponse.json({
      success: true,
      providersWithAlerts: groups.length,
      tasksCreated,
      activeExclusions: exclusions.length,
      exclusionTasks,
    });
  } catch (error) {
    logger.error({ event: "cron.credential_check.failed", error });
    return NextResponse.json(
      { error: "Failed to run credential verification" },
      { status: 500 },
    );
  }
}
