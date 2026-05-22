import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { logger } from "@/lib/observability/log";
import { requireUser } from "@/lib/auth/session";

// EMR-036: Patient Portal Intake Forms API
// Secures and processes incoming intake forms filled out by the patient
// prior to their appointment. Syncs the structured data into their clinical chart.

export async function POST(req: Request) {
  try {
    const user = await requireUser();
    
    // Validate payload
    const payload = await req.json();
    if (!payload.encounterId || !payload.intakeAnswers) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    // 1. Verify the encounter belongs to this patient
    const encounter = await prisma.encounter.findUnique({
      where: { id: payload.encounterId }
    });

    if (!encounter || encounter.patientId !== user.id) {
      // For security, if patient tries to submit intake for an encounter they don't own
      return new NextResponse("Forbidden", { status: 403 });
    }

    // 2. Append Intake Data to the Patient Record
    await prisma.patient.update({
      where: { id: user.id },
      data: {
        intakeAnswers: payload.intakeAnswers,
        // If they provided a chief complaint in the intake, update the patient record
        presentingConcerns: payload.intakeAnswers.chiefComplaint || undefined
      }
    });

    // 3. Update the Encounter to mark intake as received
    // Here we can append a flag into the briefingContext so the provider knows it's ready
    await prisma.encounter.update({
      where: { id: encounter.id },
      data: {
        briefingContext: {
          intakeCompleted: true,
          intakeSubmittedAt: new Date().toISOString()
        }
      }
    });

    logger.info({ event: "patient.intake.submitted", encounterId: encounter.id, patientId: user.id });

    return NextResponse.json({ 
      success: true, 
      status: "intake_received",
      encounterId: encounter.id
    });

  } catch (error) {
    logger.error({ event: "patient.intake.failed", error });
    return NextResponse.json({ error: "Failed to submit intake forms" }, { status: 500 });
  }
}
