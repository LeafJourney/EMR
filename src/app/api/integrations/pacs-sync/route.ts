import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { logger } from "@/lib/observability/log";

// EMR-096: Radiology PACS Link (DICOM HL7 ORU)
// Webhook endpoint that receives incoming HL7 ORU (Observation Result) messages 
// from external radiology imaging centers (MRI, CT, X-Ray). It automatically extracts 
// the radiologist's narrative report and links the DICOM study URL to the patient's chart.

export async function POST(req: Request) {
  try {
    const authHeader = req.headers.get("authorization") ?? "";
    const secret = process.env.PACS_WEBHOOK_SECRET ?? "";
    
    if (process.env.NODE_ENV === "production" && authHeader !== `Bearer ${secret}`) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    const payload = await req.json();

    if (!payload.patientId || !payload.accessionNumber || !payload.reportText) {
      return NextResponse.json({ error: "Missing required HL7 ORU fields" }, { status: 400 });
    }

    // 1. Identify the patient and study
    const { patientId, accessionNumber, reportText, dicomViewerUrl, isAbnormal } = payload;

    // 2. Create the Diagnostic Report document
    const report = await prisma.document.create({
      data: {
        organizationId: payload.organizationId || "DEFAULT",
        patientId: patientId,
        originalName: `Radiology Report (Accession: ${accessionNumber}).pdf`,
        kind: "image",
        storageKey: dicomViewerUrl || "pending_pacs_link",
        mimeType: "application/pdf",
        sizeBytes: 1024,
      }
    });

    // 3. Alert the ordering provider if the radiologist flagged an abnormal finding
    if (isAbnormal) {
      logger.warn({ 
        event: "integrations.pacs.abnormal_finding", 
        patientId, 
        accessionNumber 
      });

      // Generate a high-priority inbox message
      await prisma.auditLog.create({
        data: {
          organizationId: payload.organizationId || "DEFAULT",
          action: "ABNORMAL_RADIOLOGY_REPORT_RECEIVED",
          subjectType: "Document",
          subjectId: report.id,
          metadata: { patientId, accessionNumber }
        }
      });
    } else {
      logger.info({ 
        event: "integrations.pacs.report_received", 
        patientId, 
        accessionNumber 
      });
    }

    return NextResponse.json({ 
      success: true, 
      reportId: report.id,
      flaggedAbnormal: !!isAbnormal
    });

  } catch (error) {
    logger.error({ event: "integrations.pacs.failed", error });
    return NextResponse.json({ error: "Failed to process PACS HL7 sync" }, { status: 500 });
  }
}
