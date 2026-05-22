import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { logger } from "@/lib/observability/log";

// EMR-074: Telematics & Logistics Fleet API
// For Dispensary / Apothecary operations. Integrates with third-party delivery 
// networks (like Onfleet or Bringg) to track driver GPS, route efficiency, and 
// proof-of-delivery signatures in real-time.

export async function POST(req: Request) {
  try {
    const authHeader = req.headers.get("authorization") ?? "";
    const secret = process.env.FLEET_WEBHOOK_SECRET ?? "";
    
    if (process.env.NODE_ENV === "production" && authHeader !== `Bearer ${secret}`) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    const payload = await req.json();

    if (!payload.orderId || !payload.driverStatus) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    // 1. Find the Dispense / Order record
    // Mocking finding the record:
    // const order = await prisma.dispensaryDispense.findUnique(...)

    // 2. Process Telematics
    if (payload.driverStatus === "completed" && payload.proofOfDeliverySignature) {
      logger.info({ 
        event: "integrations.fleet.delivery_completed", 
        orderId: payload.orderId 
      });
      
      // Update DB with proof of delivery and timestamp
      // await prisma.dispensaryDispense.update(...)
    } else if (payload.driverStatus === "en_route") {
      // Could push an SMS to the patient with a tracking link
      logger.info({ 
        event: "integrations.fleet.en_route", 
        orderId: payload.orderId 
      });
    }

    return NextResponse.json({ 
      success: true, 
      orderId: payload.orderId,
      status: payload.driverStatus
    });

  } catch (error) {
    logger.error({ event: "integrations.fleet.failed", error });
    return NextResponse.json({ error: "Failed to process fleet webhook" }, { status: 500 });
  }
}
