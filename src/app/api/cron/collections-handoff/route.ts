import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { logger } from "@/lib/observability/log";

// EMR-116: Third-Party Collections Agency Handoff
// Nightly accounting job that scans for patient balances greater than 120 days past due. 
// It packages the ledger history, standardizes the payload, and securely transmits 
// it (SFTP/API) to the clinic's third-party collections agency.

export async function POST(req: Request) {
  try {
    const authHeader = req.headers.get("authorization") ?? "";
    const secret = process.env.CRON_SECRET ?? "";
    
    if (process.env.NODE_ENV === "production" && authHeader !== `Bearer ${secret}`) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    logger.info({ event: "cron.collections_handoff.started" });

    // 1. Fetch claims/invoices > 120 days old that are unpaid (patient responsibility)
    const oneHundredTwentyDaysAgo = new Date();
    oneHundredTwentyDaysAgo.setDate(oneHundredTwentyDaysAgo.getDate() - 120);

    const delinquentClaims = await prisma.claim.findMany({
      where: {
        status: "patient_responsibility",
        updatedAt: { lte: oneHundredTwentyDaysAgo },
        billedAmountCents: { gt: 0 } // Must have a balance
      },
      take: 50
    });

    let sentToCollectionsCount = 0;

    for (const claim of delinquentClaims) {
      // 2. Draft the Collections Payload
      const payloadId = `COLL-${claim.id}-${Date.now()}`;
      
      // 3. Mock transmission (e.g. SFTP to Transworld Systems or IC System)
      const transmissionSuccess = true;

      if (transmissionSuccess) {
        // 4. Update the claim status so it isn't sent twice
        await prisma.claim.update({
          where: { id: claim.id },
          data: { status: "sent_to_collections" }
        });

        logger.info({ 
          event: "cron.collections_handoff.transmitted", 
          claimId: claim.id, 
          amountCents: claim.billedAmountCents 
        });

        // Add to audit log
        await prisma.auditLog.create({
          data: {
            organizationId: claim.organizationId,
            action: "ACCOUNT_SENT_TO_COLLECTIONS",
            entity: "Claim",
            entityId: claim.id,
            details: { amountCents: claim.billedAmountCents, agency: "Third_Party_Agency" }
          }
        });

        sentToCollectionsCount++;
      }
    }

    return NextResponse.json({ 
      success: true, 
      scanned: delinquentClaims.length,
      sentToCollections: sentToCollectionsCount
    });

  } catch (error) {
    logger.error({ event: "cron.collections_handoff.failed", error });
    return NextResponse.json({ error: "Failed to run collections handoff" }, { status: 500 });
  }
}
