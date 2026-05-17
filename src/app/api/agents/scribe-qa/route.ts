import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { logger } from "@/lib/observability/log";

// EMR-137: AI Medical Scribe Quality Assurance Loop
// Acts as a secondary AI reviewer that validates the output of the primary Voice-to-SOAP 
// AI Scribe. It checks for clinical hallucinations, ensures the Physical Exam matches 
// the Chief Complaint, and flags missing elements before the provider signs the chart.

export async function POST(req: Request) {
  try {
    const authHeader = req.headers.get("authorization") ?? "";
    const secret = process.env.WEBHOOK_SECRET ?? "";
    
    if (process.env.NODE_ENV === "production" && authHeader !== `Bearer ${secret}`) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    const payload = await req.json();

    if (!payload.encounterId || !payload.aiGeneratedNote) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const { encounterId, aiGeneratedNote, chiefComplaint } = payload;
    const noteText = aiGeneratedNote.toLowerCase();
    const ccText = (chiefComplaint || "").toLowerCase();

    // 1. NLP Quality Assurance Rules (Mocked)
    let isFlagged = false;
    let qaFlags: string[] = [];

    // Rule 1: Chief complaint mentions chest pain, but Physical Exam is missing Cardiac auscultation
    if (ccText.includes("chest pain") && !noteText.includes("cardiovascular")) {
      isFlagged = true;
      qaFlags.push("Missing Cardiovascular exam for Chest Pain complaint.");
    }

    // Rule 2: AI hallucinates a non-existent medication in the plan
    // In production, we'd cross-reference against the FDA NDC database
    if (noteText.includes("prescribed unobtanium")) {
      isFlagged = true;
      qaFlags.push("Potential medication hallucination detected.");
    }

    // 2. Update Encounter with QA Flags
    if (isFlagged) {
      logger.warn({ 
        event: "agents.scribe_qa.flags_detected", 
        encounterId, 
        flags: qaFlags.length 
      });

      // Append a warning banner to the top of the provider's draft note
      const qaBanner = `[AI QA WARNING]: Please review this auto-generated note.\n- ${qaFlags.join("\n- ")}\n\n`;
      
      await prisma.encounter.update({
        where: { id: encounterId },
        data: {
          reason: `${qaBanner}${aiGeneratedNote}`
        }
      });
    } else {
      logger.info({ 
        event: "agents.scribe_qa.passed", 
        encounterId 
      });
    }

    return NextResponse.json({ 
      success: true, 
      status: isFlagged ? "qa_failed" : "qa_passed",
      flags: qaFlags
    });

  } catch (error) {
    logger.error({ event: "agents.scribe_qa.failed", error });
    return NextResponse.json({ error: "Failed to run scribe QA" }, { status: 500 });
  }
}
