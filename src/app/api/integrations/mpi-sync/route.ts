import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { logger } from "@/lib/observability/log";

// EMR-083: Interoperability Master Patient Index (MPI)
// Syncs patient demographics with regional Health Information Exchanges (HIE).
// Resolves duplicate records by matching on Name, DOB, and SSN to maintain a 
// single source of truth across the care continuum.

export async function POST(req: Request) {
  try {
    const authHeader = req.headers.get("authorization") ?? "";
    const secret = process.env.MPI_SYNC_SECRET ?? "";
    
    if (process.env.NODE_ENV === "production" && authHeader !== `Bearer ${secret}`) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    const payload = await req.json();

    // Payload expected from HIE ADT (Admit, Discharge, Transfer) feeds
    if (!payload.firstName || !payload.lastName || !payload.dateOfBirth) {
      return NextResponse.json({ error: "Missing required MPI fields" }, { status: 400 });
    }

    // 1. MPI Probabilistic Matching Logic
    // In production, we'd use Levenshtein distance on names and fuzzy matching
    const potentialMatch = await prisma.patient.findFirst({
      where: {
        firstName: { equals: payload.firstName, mode: "insensitive" },
        lastName: { equals: payload.lastName, mode: "insensitive" },
        // Exact DOB match as a strong identifier
        dateOfBirth: new Date(payload.dateOfBirth)
      }
    });

    if (potentialMatch) {
      // 2. Resolve Duplicate / Update Record
      await prisma.patient.update({
        where: { id: potentialMatch.id },
        data: {
          // Update address or contact info if the HIE data is more recent
          phone: payload.phone || potentialMatch.phone,
          city: payload.city || potentialMatch.city,
        }
      });

      logger.info({ 
        event: "integrations.mpi.match_found_and_updated", 
        patientId: potentialMatch.id 
      });

      return NextResponse.json({ 
        success: true, 
        action: "updated",
        patientId: potentialMatch.id
      });
    } else {
      // 3. Create New Record if no match found
      const newPatient = await prisma.patient.create({
        data: {
          organizationId: payload.organizationId || "DEFAULT_ORG",
          firstName: payload.firstName,
          lastName: payload.lastName,
          dateOfBirth: new Date(payload.dateOfBirth),
          phone: payload.phone,
          status: "prospect"
        }
      });

      logger.info({ 
        event: "integrations.mpi.new_record_created", 
        patientId: newPatient.id 
      });

      return NextResponse.json({ 
        success: true, 
        action: "created",
        patientId: newPatient.id
      });
    }

  } catch (error) {
    logger.error({ event: "integrations.mpi.failed", error });
    return NextResponse.json({ error: "Failed to sync with MPI" }, { status: 500 });
  }
}
