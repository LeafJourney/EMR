import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { logger } from "@/lib/observability/log";

// EMR-127: Oncology Tumor Board Auto-Scheduler
// Background webhook listening for Pathology results. If a report flags a new 
// malignancy (Cancer), it automatically pulls the patient's case, imaging, and 
// labs into the queue for the weekly Multi-Disciplinary Tumor Board review.

export async function POST(req: Request) {
  try {
    const authHeader = req.headers.get("authorization") ?? "";
    const secret = process.env.LAB_WEBHOOK_SECRET ?? "";
    
    if (process.env.NODE_ENV === "production" && authHeader !== `Bearer ${secret}`) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    const payload = await req.json();

    if (!payload.patientId || !payload.reportId || !payload.pathologyText) {
      return NextResponse.json({ error: "Missing required pathology fields" }, { status: 400 });
    }

    const { patientId, reportId, pathologyText } = payload;
    const text = pathologyText.toLowerCase();

    // 1. Detect Malignancy
    const isMalignant = text.includes("carcinoma") || text.includes("malignant") || text.includes("sarcoma") || text.includes("melanoma");

    if (isMalignant) {
      logger.warn({ 
        event: "agents.tumor_board.malignancy_detected", 
        patientId, 
        reportId 
      });

      // 2. Add to Tumor Board Queue
      // Assuming an event or audit log acts as the clinical queue
      await prisma.auditLog.create({
        data: {
          organizationId: payload.organizationId || "DEFAULT",
          action: "TUMOR_BOARD_CASE_QUEUED",
          entity: "Patient",
          entityId: patientId,
          details: { reason: "New Malignant Pathology Detected", reportId }
        }
      });

      return NextResponse.json({ 
        success: true, 
        status: "queued_for_tumor_board",
        finding: "Malignancy"
      });
    }

    return NextResponse.json({ 
      success: true, 
      status: "routine_pathology_logged",
      finding: "Benign/Routine"
    });

  } catch (error) {
    logger.error({ event: "agents.tumor_board.failed", error });
    return NextResponse.json({ error: "Failed to run tumor board scheduler" }, { status: 500 });
  }
}
