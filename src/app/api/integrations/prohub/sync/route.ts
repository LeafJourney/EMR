import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { logger } from "@/lib/observability/log";

// EMR-053: ProHub Integration
// Syncs users, products, and sales data from ProHub dispensaries to Leafjourney DB.

export async function POST(req: Request) {
  try {
    const authHeader = req.headers.get("authorization") ?? "";
    const secret = process.env.PROHUB_SYNC_SECRET ?? "";
    
    if (process.env.NODE_ENV === "production" && authHeader !== `Bearer ${secret}`) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    const payload = await req.json();

    if (!payload.dispensaryId || !payload.syncType) {
      return NextResponse.json({ error: "Missing required fields: dispensaryId, syncType" }, { status: 400 });
    }

    let syncedItems = 0;

    // 1. Sync Products (Catalog)
    // Scaffold: real upsert needs a compound unique on (organizationId, externalSku)
    // plus a mapping from ProHub categories → ProductType / DeliveryRoute. Until
    // that's wired we just log what was received so the integration can be smoke-tested.
    if (payload.syncType === "products" && Array.isArray(payload.data)) {
      for (const item of payload.data) {
        logger.info({
          event: "integrations.prohub.product_received",
          dispensaryId: payload.dispensaryId,
          sku: item.sku,
          name: item.name,
        });
        syncedItems++;
      }
    }

    // 2. Sync Sales/Dispenses
    // Scaffold: a real DispensaryDispense row needs cardId, budtender signature,
    // and a resolved skuId. Until ProHub provides those we log and skip the write.
    if (payload.syncType === "sales" && Array.isArray(payload.data)) {
      for (const sale of payload.data) {
        let matchedPatientId: string | undefined;
        if (sale.patientPhone) {
          const match = await prisma.patient.findFirst({
            where: { organizationId: payload.dispensaryId, phone: sale.patientPhone }
          });
          if (match) matchedPatientId = match.id;
        }

        logger.info({
          event: "integrations.prohub.sale_received",
          dispensaryId: payload.dispensaryId,
          patientId: matchedPatientId ?? null,
          externalRxId: sale.externalRxId,
        });
        syncedItems++;
      }
    }

    logger.info({ event: "integrations.prohub.sync", syncType: payload.syncType, count: syncedItems });

    return NextResponse.json({ 
      success: true, 
      syncType: payload.syncType,
      itemsProcessed: syncedItems 
    });

  } catch (error) {
    logger.error({ event: "integrations.prohub.failed", error });
    return NextResponse.json({ error: "Failed to process ProHub sync" }, { status: 500 });
  }
}
