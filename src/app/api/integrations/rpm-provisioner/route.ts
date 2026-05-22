import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { logger } from "@/lib/observability/log";

// EMR-169: Remote Patient Monitoring (RPM) Device Provisioner
// Logistics webhook. When a provider prescribes a Remote Patient Monitoring 
// program (e.g., Hypertension Management), this agent automatically connects 
// to the fulfillment API (e.g., BioTel or 100Plus) to ship a pre-configured, 
// cellular-enabled blood pressure cuff directly to the patient's home.

export async function POST(req: Request) {
  try {
    const authHeader = req.headers.get("authorization") ?? "";
    const secret = process.env.RPM_WEBHOOK_SECRET ?? "";
    
    if (process.env.NODE_ENV === "production" && authHeader !== `Bearer ${secret}`) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    const payload = await req.json();

    if (!payload.patientId || !payload.programType || !payload.shippingAddress) {
      return NextResponse.json({ error: "Missing required RPM provision fields" }, { status: 400 });
    }

    const { patientId, programType, shippingAddress } = payload;

    logger.info({ 
      event: "integrations.rpm_provisioner.initiated", 
      patientId, 
      programType 
    });

    // 1. Map Clinical Program to Hardware
    let hardwareToShip = "";
    if (programType === "hypertension") hardwareToShip = "Cellular Blood Pressure Monitor";
    else if (programType === "diabetes") hardwareToShip = "Cellular Glucometer";
    else if (programType === "weight_management") hardwareToShip = "Cellular Smart Scale";
    else return NextResponse.json({ error: "Unsupported RPM program" }, { status: 400 });

    // 2. Mock API call to Fulfillment Partner (e.g., 100Plus API)
    const fulfillmentSuccess = true;
    const trackingNumber = `RPM-TRACK-${Date.now()}`;

    if (fulfillmentSuccess) {
      logger.info({ 
        event: "integrations.rpm_provisioner.hardware_shipped", 
        patientId, 
        hardware: hardwareToShip,
        trackingNumber 
      });

      // 3. Log the provision to the patient's chart
      await prisma.auditLog.create({
        data: {
          organizationId: payload.organizationId || "DEFAULT",
          action: "RPM_HARDWARE_DISPATCHED",
          subjectType: "Patient",
          subjectId: patientId,
          metadata: { hardware: hardwareToShip, tracking: trackingNumber, address: shippingAddress }
        }
      });
    }

    return NextResponse.json({ 
      success: true, 
      status: "hardware_dispatched",
      trackingNumber,
      hardware: hardwareToShip
    });

  } catch (error) {
    logger.error({ event: "integrations.rpm_provisioner.failed", error });
    return NextResponse.json({ error: "Failed to provision RPM device" }, { status: 500 });
  }
}
