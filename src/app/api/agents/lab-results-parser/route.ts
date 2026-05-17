import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { logger } from "@/lib/observability/log";

// EMR-056: Lab Results Parser
// Agent that receives webhook events from LabCorp/Quest or processes uploaded PDFs.
// Uses an OCR/AI pipeline to extract structured markers (e.g. A1C, Lipid Panels) 
// and insert them directly into the patient's discrete data flow.

export async function POST(req: Request) {
  try {
    const authHeader = req.headers.get("authorization") ?? "";
    const secret = process.env.LAB_PARSER_SECRET ?? "";
    
    if (process.env.NODE_ENV === "production" && authHeader !== `Bearer ${secret}`) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    const payload = await req.json();

    if (!payload.patientId || !payload.labDocumentId || !payload.extractedMarkers) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const { patientId, labDocumentId, extractedMarkers } = payload;
    let markersSaved = 0;

    // 1. Persist the parsed panel. LabResult stores the full marker set as JSON
    // under `results`; per-marker rows live inside that blob, indexed by name.
    // extractedMarkers expected shape: { code, name, value, unit, referenceRange, isAbnormal }
    const patient = await prisma.patient.findUnique({
      where: { id: patientId },
      select: { organizationId: true },
    });
    if (!patient) {
      return NextResponse.json({ error: "Patient not found" }, { status: 404 });
    }

    const resultsByMarker: Record<string, unknown> = {};
    for (const marker of extractedMarkers) {
      resultsByMarker[marker.name] = {
        loincCode: marker.code,
        value: marker.value,
        unit: marker.unit,
        referenceRange: marker.referenceRange,
        abnormal: marker.isAbnormal || false,
      };
      markersSaved++;
    }
    const hasAbnormal = extractedMarkers.some((m: any) => m.isAbnormal);

    await prisma.labResult.create({
      data: {
        organizationId: patient.organizationId!,
        patientId,
        panelName: payload.panelName || `Lab document ${labDocumentId}`,
        receivedAt: new Date(payload.collectedAt || Date.now()),
        results: resultsByMarker as Prisma.InputJsonValue,
        abnormalFlag: hasAbnormal,
      },
    });

    // 2. Alert Provider if High Priority/Abnormal
    if (hasAbnormal) {
      // Create a task or message in the Provider's inbox
      logger.info({ event: "agents.lab_parser.abnormal_flagged", patientId, labDocumentId });
    }

    logger.info({ event: "agents.lab_parser.completed", patientId, markersSaved });

    return NextResponse.json({ 
      success: true, 
      patientId,
      labDocumentId,
      markersExtracted: markersSaved,
      requiresReview: hasAbnormal
    });

  } catch (error) {
    logger.error({ event: "agents.lab_parser.failed", error });
    return NextResponse.json({ error: "Failed to parse lab results" }, { status: 500 });
  }
}
