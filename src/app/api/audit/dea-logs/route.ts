import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requireUser } from "@/lib/auth/session";

// EMR-041: DEA Compliance & Logs
// Log every controlled substance prescription event to the database 
// to comply with DEA regulations and State PDMP requirements.

export async function POST(req: Request) {
  try {
    const user = await requireUser();
    
    // In a real implementation this might be gated to providers or system agents
    const payload = await req.json();

    if (!payload.patientId || !payload.medicationName || !payload.action) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    // Insert an AuditLog specifically for DEA controlled substances
    const log = await prisma.auditLog.create({
      data: {
        organizationId: user.organizationId!,
        actorUserId: user.id,
        action: `DEA_CONTROLLED_SUBSTANCE_${payload.action}`,
        subjectType: "Medication",
        subjectId: payload.medicationId || "unknown",
        metadata: {
          patientId: payload.patientId,
          medication: payload.medicationName,
          quantity: payload.quantity,
          providerNpi: payload.providerNpi,
          timestamp: new Date().toISOString()
        }
      }
    });

    return NextResponse.json({ 
      success: true, 
      logId: log.id
    });

  } catch (error) {
    return NextResponse.json({ error: "Failed to record DEA audit log" }, { status: 500 });
  }
}
