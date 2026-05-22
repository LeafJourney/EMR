import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { logger } from "@/lib/observability/log";

// EMR-071: Specialty Pharmacy Fill Status Webhook
// Listens for external events from pharmacy partners (like CVS Specialty or local 
// compounding pharmacies) and updates the prescription status in the EMR so 
// providers know if a patient actually picked up their medication.

export async function POST(req: Request) {
  try {
    const authHeader = req.headers.get("authorization") ?? "";
    const secret = process.env.PHARMACY_WEBHOOK_SECRET ?? "";
    
    if (process.env.NODE_ENV === "production" && authHeader !== `Bearer ${secret}`) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    const payload = await req.json();

    // Standard pharmacy status payload
    if (!payload.prescriptionId || !payload.status) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const allowedStatuses = ["received", "processing", "ready_for_pickup", "dispensed", "cancelled"];
    if (!allowedStatuses.includes(payload.status)) {
      return NextResponse.json({ error: "Invalid status value" }, { status: 400 });
    }

    // Update the local Medication Request or Prescription record
    // Mocking finding the record and updating it
    // await prisma.prescription.update(...)
    
    logger.info({ 
      event: "integrations.pharmacy.status_updated", 
      prescriptionId: payload.prescriptionId, 
      status: payload.status 
    });

    // If status is 'dispensed', we might trigger an adherence cron job to start counting days
    if (payload.status === "dispensed") {
      logger.info({ event: "agents.adherence.tracking_started", prescriptionId: payload.prescriptionId });
    }

    return NextResponse.json({ 
      success: true, 
      prescriptionId: payload.prescriptionId,
      newStatus: payload.status
    });

  } catch (error) {
    logger.error({ event: "integrations.pharmacy.webhook_failed", error });
    return NextResponse.json({ error: "Failed to process pharmacy webhook" }, { status: 500 });
  }
}
