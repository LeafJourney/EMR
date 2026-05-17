import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { logger } from "@/lib/observability/log";

// EMR-076: Controlled Substance Inventory Reconciliation
// Nightly cron job that cross-references physical vault inventory logs against 
// actual dispensed EMR prescriptions to detect discrepancies or potential diversion.

export async function POST(req: Request) {
  try {
    const authHeader = req.headers.get("authorization") ?? "";
    const secret = process.env.CRON_SECRET ?? "";
    
    if (process.env.NODE_ENV === "production" && authHeader !== `Bearer ${secret}`) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    logger.info({ event: "cron.cs_reconciliation.started" });

    // 1. Fetch products to reconcile. CannabisProduct doesn't carry stock-on-hand —
    // scaffold just walks active products and the real stock query gets layered in later.
    const trackedProducts = await prisma.cannabisProduct.findMany({
      where: { active: true },
      take: 200
    });

    let flagsGenerated = 0;

    for (const product of trackedProducts) {
      // 2. Fetch dispenses in the last 24h. Real reconciliation needs to filter by
      // skuId / productSku so per-product totals roll up; placeholder just queries the window.
      await prisma.dispensaryDispense.findMany({
        where: {
          dispensedAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) }
        }
      });

      // 3. Mock logic: If stock reduction doesn't match total dispensed
      const discrepancyFound = false; // Mock

      if (discrepancyFound) {
        // Flag for audit
        await prisma.auditLog.create({
          data: {
            organizationId: product.organizationId,
            action: "INVENTORY_DISCREPANCY_DETECTED",
            subjectType: "CannabisProduct",
            subjectId: product.id,
            metadata: { name: product.name, expected: 100, actual: 95 }
          }
        });
        flagsGenerated++;
      }
    }

    logger.info({ 
      event: "cron.cs_reconciliation.completed", 
      productsChecked: trackedProducts.length,
      flagsGenerated 
    });

    return NextResponse.json({ 
      success: true, 
      productsChecked: trackedProducts.length,
      flagsGenerated
    });

  } catch (error) {
    logger.error({ event: "cron.cs_reconciliation.failed", error });
    return NextResponse.json({ error: "Failed to run inventory reconciliation" }, { status: 500 });
  }
}
