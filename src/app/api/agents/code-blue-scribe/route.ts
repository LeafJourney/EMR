import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { logger } from "@/lib/observability/log";

// EMR-161: Smart Code Blue Auto-Scribe
// Critical emergency agent triggered during a Cardiac Arrest (Code Blue). 
// It ingests voice inputs or bedside monitor events to transcribe time-stamped 
// Epinephrine pushes, defibrillator shocks, and rhythm checks into an immutable, 
// legally defensible Code Blue flow sheet.

export async function POST(req: Request) {
  try {
    const authHeader = req.headers.get("authorization") ?? "";
    const secret = process.env.WEBHOOK_SECRET ?? "";
    
    if (process.env.NODE_ENV === "production" && authHeader !== `Bearer ${secret}`) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    const payload = await req.json();

    if (!payload.encounterId || !payload.patientId || !payload.codeEvent) {
      return NextResponse.json({ error: "Missing required Code Blue fields" }, { status: 400 });
    }

    const { encounterId, patientId, codeEvent, timestamp } = payload;
    const eventTime = timestamp ? new Date(timestamp) : new Date();

    logger.warn({ 
      event: "agents.code_blue_scribe.event_logged", 
      patientId, 
      codeEvent 
    });

    // 1. Format the Code Event Entry
    const logEntry = `[${eventTime.toISOString().split("T")[1].slice(0,8)}] CODE EVENT: ${codeEvent}`;

    // 2. Append to the Immutable Code Blue Flow Sheet
    // Using AuditLog to simulate the immutable flow sheet
    await prisma.auditLog.create({
      data: {
        organizationId: payload.organizationId || "DEFAULT",
        action: "CODE_BLUE_FLOWSHEET_ENTRY",
        subjectType: "Encounter",
        subjectId: encounterId,
        metadata: { event: codeEvent, time: eventTime.toISOString() }
      }
    });

    // 3. Update the main encounter notes (acting as a running log)
    const encounter = await prisma.encounter.findUnique({ where: { id: encounterId } });
    
    if (encounter) {
      const updatedReason = encounter.reason 
        ? `${encounter.reason}\n${logEntry}` 
        : `--- CODE BLUE INITIATED ---\n${logEntry}`;
        
      await prisma.encounter.update({
        where: { id: encounterId },
        data: { reason: updatedReason }
      });
    }

    return NextResponse.json({ 
      success: true, 
      status: "event_transcribed",
      entry: logEntry
    });

  } catch (error) {
    logger.error({ event: "agents.code_blue_scribe.failed", error });
    return NextResponse.json({ error: "Failed to scribe Code Blue event" }, { status: 500 });
  }
}
