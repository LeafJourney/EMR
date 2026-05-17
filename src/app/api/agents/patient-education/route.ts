import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { logger } from "@/lib/observability/log";

// EMR-065: Patient Education AI Generator
// Parses the finalized clinical note and automatically generates a 5th-grade reading level 
// post-visit summary, including dosing instructions, lifestyle recommendations, and 
// educational material about prescribed cannabis chemovars.

export async function POST(req: Request) {
  try {
    const authHeader = req.headers.get("authorization") ?? "";
    const secret = process.env.CRON_SECRET ?? ""; // Or specific AI agent secret
    
    if (process.env.NODE_ENV === "production" && authHeader !== `Bearer ${secret}`) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    const payload = await req.json();

    if (!payload.encounterId || !payload.clinicalNoteText) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    // 1. Fetch patient info for context
    const encounter = await prisma.encounter.findUnique({
      where: { id: payload.encounterId },
      include: { patient: true }
    });

    if (!encounter || !encounter.patient) {
      return NextResponse.json({ error: "Encounter or patient not found" }, { status: 404 });
    }

    // 2. Simulate AI Generation (DeepSeek/GPT logic would go here)
    // We would pass the `payload.clinicalNoteText` to the LLM with a strict system prompt.
    const mockPatientSummary = `
Hi ${encounter.patient.firstName}, 

It was great seeing you today! Here is a quick summary of your visit:

1. **New Medications**: You have been prescribed a new high-CBD tincture. Take 0.5mL under your tongue twice daily. 
2. **Lifestyle Changes**: We discussed incorporating 20 minutes of light stretching in the morning to help with your chronic back pain.
3. **Follow-Up**: Please schedule a video follow-up in 4 weeks to see how the new medication is working.

*Attached is a PDF guide on the benefits of CBD.*
    `.trim();

    // 3. Save the summary to the patient's portal / document library
    await prisma.document.create({
      data: {
        organizationId: encounter.organizationId,
        patientId: encounter.patientId,
        encounterId: encounter.id,
        originalName: "Post-Visit Summary & Education.md",
        mimeType: "text/markdown",
        sizeBytes: mockPatientSummary.length,
        storageKey: "simulated_storage_url",
      }
    });

    logger.info({ event: "agents.patient_education.generated", encounterId: encounter.id });

    return NextResponse.json({ 
      success: true, 
      summaryPreview: mockPatientSummary
    });

  } catch (error) {
    logger.error({ event: "agents.patient_education.failed", error });
    return NextResponse.json({ error: "Failed to generate patient education material" }, { status: 500 });
  }
}
