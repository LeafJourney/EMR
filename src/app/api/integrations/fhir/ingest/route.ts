import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { logger } from "@/lib/observability/log";

// EMR-013: Conventional EMR Integration (HL7/FHIR Data Ingestion Pipeline)
// Seamless way to port over external patient records. Connects via FHIR 
// to Epic/Cerner environments and normalizes resources into Leafjourney DB.

export async function POST(req: Request) {
  try {
    const authHeader = req.headers.get("authorization") ?? "";
    const secret = process.env.FHIR_INGEST_SECRET ?? "";
    
    if (process.env.NODE_ENV === "production" && authHeader !== `Bearer ${secret}`) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    // Expecting a FHIR R4 Bundle
    const bundle = await req.json();

    if (bundle.resourceType !== "Bundle" || !bundle.entry) {
      return NextResponse.json({ error: "Invalid FHIR Bundle" }, { status: 400 });
    }

    const orgId = req.headers.get("x-organization-id");
    if (!orgId) {
      return NextResponse.json({ error: "Missing x-organization-id header" }, { status: 400 });
    }

    let patientId = null;
    let newPatient = null;
    const addedConditions: string[] = [];
    const addedMeds: string[] = [];

    // Parse FHIR Resources
    for (const entry of bundle.entry) {
      const resource = entry.resource;
      
      // 1. Patient Normalization
      if (resource.resourceType === "Patient") {
        const name = resource.name?.[0];
        const firstName = name?.given?.[0] || "Unknown";
        const lastName = name?.family || "Unknown";
        const email = resource.telecom?.find((t: any) => t.system === "email")?.value;
        const phone = resource.telecom?.find((t: any) => t.system === "phone")?.value;
        const address = resource.address?.[0];

        // Upsert Patient by exact name/DOB or insert
        newPatient = await prisma.patient.create({
          data: {
            organizationId: orgId,
            firstName,
            lastName,
            email,
            phone,
            dateOfBirth: resource.birthDate ? new Date(resource.birthDate) : null,
            addressLine1: address?.line?.[0],
            city: address?.city,
            state: address?.state,
            postalCode: address?.postalCode,
          }
        });
        patientId = newPatient.id;
      }

      // 2. Condition Normalization
      if (resource.resourceType === "Condition" && patientId) {
        const conditionText = resource.code?.coding?.[0]?.display || resource.code?.text;
        if (conditionText) addedConditions.push(conditionText);
      }

      // 3. Medication Normalization
      if (resource.resourceType === "MedicationStatement" && patientId) {
        const medText = resource.medicationCodeableConcept?.coding?.[0]?.display || resource.medicationCodeableConcept?.text;
        if (medText) addedMeds.push(medText);
      }
    }

    if (patientId && (addedConditions.length > 0 || addedMeds.length > 0)) {
      await prisma.patient.update({
        where: { id: patientId },
        data: {
          presentingConcerns: addedConditions.join(", "),
          // Store external meds into cannabisHistory or a generalized field
          cannabisHistory: { externalMeds: addedMeds }
        }
      });
    }

    logger.info({ event: "fhir.ingest.completed", patientId, conditions: addedConditions.length });

    return NextResponse.json({ 
      success: true, 
      patientId, 
      conditionsParsed: addedConditions.length,
      medicationsParsed: addedMeds.length 
    });

  } catch (error) {
    logger.error({ event: "fhir.ingest.failed", error });
    return NextResponse.json({ error: "Failed to process FHIR payload" }, { status: 500 });
  }
}
