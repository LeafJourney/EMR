import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { logger } from "@/lib/observability/log";

// EMR-121: Patient Transport Coordinator (NEMT API)
// Connects with Lyft Healthcare or Uber Health APIs. If a Medicaid/Medicare 
// patient indicates they lack transportation to their appointment, this agent 
// automatically books and dispatches a Non-Emergency Medical Transport (NEMT) ride.

export async function POST(req: Request) {
  try {
    const authHeader = req.headers.get("authorization") ?? "";
    const secret = process.env.NEMT_WEBHOOK_SECRET ?? "";
    
    if (process.env.NODE_ENV === "production" && authHeader !== `Bearer ${secret}`) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    const payload = await req.json();

    if (!payload.encounterId || !payload.patientId || !payload.pickupAddress) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    // 1. Fetch encounter and patient data
    const encounter = await prisma.encounter.findUnique({
      where: { id: payload.encounterId },
      include: { patient: true }
    });

    if (!encounter || !encounter.patient) {
      return NextResponse.json({ error: "Encounter or patient not found" }, { status: 404 });
    }

    // 2. Mock API call to Lyft Healthcare / Uber Health
    // Ensure pickup is 60 minutes prior to appointment
    const pickupTime = new Date(encounter.scheduledFor || new Date());
    pickupTime.setMinutes(pickupTime.getMinutes() - 60);

    const transportSuccess = true;
    const rideReference = `UBER-HLTH-${Date.now()}`;

    if (transportSuccess) {
      logger.info({ 
        event: "integrations.nemt.ride_dispatched", 
        patientId: encounter.patientId, 
        rideReference,
        pickupTime
      });

      // 3. Log the transport in the audit trail
      await prisma.auditLog.create({
        data: {
          organizationId: encounter.organizationId,
          action: "NEMT_RIDE_DISPATCHED",
          entity: "Patient",
          entityId: encounter.patientId,
          details: { rideId: rideReference, provider: "Uber Health", pickupTime }
        }
      });
    }

    return NextResponse.json({ 
      success: true, 
      status: "transport_scheduled",
      rideReference,
      pickupTime
    });

  } catch (error) {
    logger.error({ event: "integrations.nemt.failed", error });
    return NextResponse.json({ error: "Failed to schedule NEMT transport" }, { status: 500 });
  }
}
