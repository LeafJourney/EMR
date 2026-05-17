import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { logger } from "@/lib/observability/log";

// EMR-029: Patient Kiosk App API
// Receives check-in payloads from the front-desk iPad kiosk. Updates the patient's
// wait state and alerts the clinician.

export async function POST(req: Request) {
  try {
    const authHeader = req.headers.get("authorization") ?? "";
    const secret = process.env.KIOSK_SECRET ?? "";
    
    if (process.env.NODE_ENV === "production" && authHeader !== `Bearer ${secret}`) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    const payload = await req.json();

    if (!payload.encounterId || !payload.patientId) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    // 1. Update the Encounter Status to "arrived"
    const encounter = await prisma.encounter.update({
      where: { id: payload.encounterId },
      data: {
        status: "arrived", // Moves them from scheduled to the active queue
        updatedAt: new Date()
      }
    });

    // 2. Append forms if they signed any on the kiosk
    if (payload.signedForms) {
      await prisma.patient.update({
        where: { id: payload.patientId },
        data: {
          intakeAnswers: payload.signedForms
        }
      });
    }

    logger.info({ 
      event: "kiosk.check_in.success", 
      encounterId: encounter.id, 
      patientId: payload.patientId 
    });

    return NextResponse.json({ 
      success: true, 
      status: "arrived"
    });

  } catch (error) {
    logger.error({ event: "kiosk.check_in.failed", error });
    return NextResponse.json({ error: "Failed to process kiosk check-in" }, { status: 500 });
  }
}
