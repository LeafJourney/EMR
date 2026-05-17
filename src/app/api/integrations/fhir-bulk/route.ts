import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { logger } from "@/lib/observability/log";

// EMR-085: Secure FHIR Bulk Data Export
// Generates population-level NDJSON (Newline Delimited JSON) exports for 
// Accountable Care Organizations (ACOs) and CMS compliance reporting.

export async function GET(req: Request) {
  try {
    const authHeader = req.headers.get("authorization") ?? "";
    const secret = process.env.FHIR_BULK_SECRET ?? "";
    
    if (process.env.NODE_ENV === "production" && authHeader !== `Bearer ${secret}`) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    const url = new URL(req.url);
    const orgId = url.searchParams.get("organizationId");

    if (!orgId) {
      return NextResponse.json({ error: "Missing organizationId parameter" }, { status: 400 });
    }

    // 1. Fetch Patient Population Data
    const patients = await prisma.patient.findMany({
      where: { organizationId: orgId },
      take: 1000 // In a real system, this would stream the data
    });

    // 2. Generate FHIR NDJSON payload (Mocked formatting)
    let ndjson = "";
    for (const patient of patients) {
      const fhirPatient = {
        resourceType: "Patient",
        id: patient.id,
        name: [{ family: patient.lastName, given: [patient.firstName] }],
        birthDate: patient.dateOfBirth?.toISOString().split("T")[0]
      };
      ndjson += JSON.stringify(fhirPatient) + "\n";
    }

    logger.info({ 
      event: "integrations.fhir_bulk.exported", 
      organizationId: orgId, 
      resourceCount: patients.length 
    });

    // Return as a streaming or flat text response
    return new NextResponse(ndjson, {
      status: 200,
      headers: {
        "Content-Type": "application/fhir+ndjson",
        "Content-Disposition": `attachment; filename="bulk_export_${orgId}.ndjson"`
      }
    });

  } catch (error) {
    logger.error({ event: "integrations.fhir_bulk.failed", error });
    return NextResponse.json({ error: "Failed to generate bulk export" }, { status: 500 });
  }
}
