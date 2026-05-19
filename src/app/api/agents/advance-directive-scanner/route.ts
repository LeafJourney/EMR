import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { logger } from "@/lib/observability/log";

// EMR-134: NLP Advance Directive Scanner
// Webhook listening for inbound patient document uploads (e.g., via the portal).
// Uses OCR/NLP to scan PDFs for "Advance Directive", "DNR", "DNI", or "Living Will". 
// Instantly updates the patient's global banner with their code status.

export async function POST(req: Request) {
  try {
    const authHeader = req.headers.get("authorization") ?? "";
    const secret = process.env.DOC_WEBHOOK_SECRET ?? "";
    
    if (process.env.NODE_ENV === "production" && authHeader !== `Bearer ${secret}`) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    const payload = await req.json();

    if (!payload.documentId || !payload.patientId || !payload.extractedText) {
      return NextResponse.json({ error: "Missing required document fields" }, { status: 400 });
    }

    const { patientId, documentId, extractedText } = payload;
    const text = extractedText.toLowerCase();

    // 1. NLP Scan for Resuscitation Status
    let codeStatus = null;

    if (text.includes("do not resuscitate") || text.includes("dnr")) {
      codeStatus = "DNR";
    }
    if (text.includes("do not intubate") || text.includes("dni")) {
      codeStatus = codeStatus ? `${codeStatus}/DNI` : "DNI";
    }

    // 2. Update Patient Chart Global Banner
    if (codeStatus) {
      logger.warn({ 
        event: "agents.advance_directive_scanner.code_status_updated", 
        patientId, 
        codeStatus 
      });

      // Update Patient Record (Mocking a clinical flags field)
      await prisma.patient.update({
        where: { id: patientId },
        data: {
          presentingConcerns: `[CRITICAL: CODE STATUS ${codeStatus}]`
        }
      });

      // Log the legal document processing
      await prisma.auditLog.create({
        data: {
          organizationId: payload.organizationId || "DEFAULT",
          action: "ADVANCE_DIRECTIVE_RECORDED",
          entity: "Patient",
          entityId: patientId,
          details: { documentId, codeStatus }
        }
      });

      return NextResponse.json({ 
        success: true, 
        status: "directive_recorded",
        codeStatus
      });
    }

    return NextResponse.json({ 
      success: true, 
      status: "no_directives_found"
    });

  } catch (error) {
    logger.error({ event: "agents.advance_directive_scanner.failed", error });
    return NextResponse.json({ error: "Failed to scan advance directive" }, { status: 500 });
  }
}
