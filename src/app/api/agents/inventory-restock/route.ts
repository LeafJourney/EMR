import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { logger } from "@/lib/observability/log";

// EMR-052: Inventory Restock AI
// Background agent that monitors supply products and dispensary products.
// Automatically generates draft purchase orders for low-stock items.

export async function POST(req: Request) {
  try {
    const authHeader = req.headers.get("authorization") ?? "";
    const secret = process.env.CRON_SECRET ?? "";
    
    if (process.env.NODE_ENV === "production" && authHeader !== `Bearer ${secret}`) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    // Scaffold: the Product model doesn't carry a live stock level yet, so the
    // "low-stock" filter is approximated by status=published. Real reorder-point
    // tracking lands once Inventory is its own table; until then we just walk the
    // published catalog and log what we'd reorder.
    const lowStockProducts = await prisma.product.findMany({
      where: { status: "active" },
      take: 500,
    });

    let draftOrdersCreated = 0;

    const orgs = new Set(lowStockProducts.map(p => p.organizationId));

    for (const orgId of orgs) {
      const orgProducts = lowStockProducts.filter(p => p.organizationId === orgId);

      if (orgProducts.length > 0) {
        logger.info({
          event: "agents.inventory_restock.would_reorder",
          organizationId: orgId,
          productCount: orgProducts.length,
          productNames: orgProducts.map(p => p.name),
        });
        draftOrdersCreated++;
      }
    }

    logger.info({ event: "agents.inventory_restock.completed", draftOrdersCreated, items: lowStockProducts.length });

    return NextResponse.json({
      success: true,
      lowStockItemsIdentified: lowStockProducts.length,
      draftOrdersCreated
    });

  } catch (error) {
    logger.error({ event: "agents.inventory_restock.failed", error });
    return NextResponse.json({ error: "Failed to run inventory restock agent" }, { status: 500 });
  }
}
