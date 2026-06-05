import { NextResponse } from "next/server";
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

    // ADVISORY ONLY — resuscitation code status is a clinician-confirmed
    // determination, never an auto-write. The previous version overwrote
    // patient.presentingConcerns (the chart-banner / chief-complaint field) with
    // "[CRITICAL: CODE STATUS ...]" off a substring match — a false positive (a
    // document merely *discussing* DNR) would flip a full-code patient to DNR, a
    // potentially fatal documentation error. Surface the detection for explicit
    // clinician confirmation in the chart UI; perform no write.
    if (codeStatus) {
      logger.warn({
        event: "agents.advance_directive_scanner.code_status_detected",
        patientId,
        codeStatus,
      });
      return NextResponse.json({
        success: true,
        advisory: true,
        applied: false,
        status: "directive_detected",
        detectedCodeStatus: codeStatus,
        documentId,
        requiresClinicianConfirmation: true,
      });
    }

    return NextResponse.json({
      success: true,
      advisory: true,
      applied: false,
      status: "no_directives_found",
    });

  } catch (error) {
    logger.error({ event: "agents.advance_directive_scanner.failed", error });
    return NextResponse.json({ error: "Failed to scan advance directive" }, { status: 500 });
  }
}
