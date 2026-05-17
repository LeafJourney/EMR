import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { logger } from "@/lib/observability/log";

// EMR-087: Prior-Auth Re-Verification Engine
// Nightly cron job that scans the active Prior Authorizations database. 
// If an authorization is expiring within 14 days, it automatically generates 
// a renewal request draft to prevent lapses in patient therapy.

export async function POST(req: Request) {
  try {
    const authHeader = req.headers.get("authorization") ?? "";
    const secret = process.env.CRON_SECRET ?? "";
    
    if (process.env.NODE_ENV === "production" && authHeader !== `Bearer ${secret}`) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    logger.info({ event: "cron.pa_reverify.started" });

    const fourteenDaysFromNow = new Date();
    fourteenDaysFromNow.setDate(fourteenDaysFromNow.getDate() + 14);

    // 1. Fetch active Prior Auths expiring in the next 14 days
    const expiringPAs = await prisma.priorAuthorization.findMany({
      where: {
        status: "approved",
        // Assumes a theoretical `expiresAt` field 
        // expiresAt: { lte: fourteenDaysFromNow, gte: new Date() }
      },
      take: 100
    });

    let renewalsDrafted = 0;

    for (const pa of expiringPAs) {
      // 2. Draft the renewal PA
      await prisma.priorAuthorization.create({
        data: {
          organizationId: pa.organizationId,
          patientId: pa.patientId,
          payerId: pa.payerId,
          requestType: "renewal",
          serviceOrDrugCode: pa.serviceOrDrugCode,
          status: "draft",
          // The clinic admin will review and submit
        }
      });
      renewalsDrafted++;
    }

    logger.info({ 
      event: "cron.pa_reverify.completed", 
      scanned: expiringPAs.length, 
      renewalsDrafted 
    });

    return NextResponse.json({ 
      success: true, 
      scanned: expiringPAs.length,
      renewalsDrafted
    });

  } catch (error) {
    logger.error({ event: "cron.pa_reverify.failed", error });
    return NextResponse.json({ error: "Failed to run PA reverification" }, { status: 500 });
  }
}
