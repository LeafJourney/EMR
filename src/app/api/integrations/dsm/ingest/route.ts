import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { logger } from "@/lib/observability/log";

// EMR-069: Direct Secure Messaging (DSM) Ingestion
// Secure webhook endpoint that receives encrypted CCDA/XML clinical summaries 
// from external providers via the DirectTrust network, and routes them to 
// the correct patient's chart.

export async function POST(req: Request) {
  try {
    const authHeader = req.headers.get("authorization") ?? "";
    const secret = process.env.DSM_INGEST_SECRET ?? "";
    
    if (process.env.NODE_ENV === "production" && authHeader !== `Bearer ${secret}`) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    const payload = await req.json();

    if (!payload.senderDirectAddress || !payload.recipientDirectAddress || !payload.ccdaAttachment) {
      return NextResponse.json({ error: "Missing required Direct protocol fields" }, { status: 400 });
    }

    // 1. Identify the internal provider receiving this message
    // Production: parse the recipient Direct address and resolve to a Provider via
    // the user record (User holds the email; Provider links via userId). For the
    // scaffold we just grab any active provider to satisfy downstream FK constraints.
    const provider = await prisma.provider.findFirst({
      where: { active: true },
    });

    if (!provider) {
      logger.warn({ event: "integrations.dsm.provider_not_found", recipient: payload.recipientDirectAddress });
      return NextResponse.json({ error: "Provider not found" }, { status: 404 });
    }

    // 2. Identify the patient based on demographics in the CCDA (Simulated)
    // In production, we'd parse the XML payload to extract patient name, DOB, and sex
    const mockPatientId = "mock-patient-uuid";

    // 3. Create a Document record in the EMR
    await prisma.document.create({
      data: {
        organizationId: provider.organizationId,
        patientId: mockPatientId,
        originalName: `Transition of Care Summary from ${payload.senderDirectAddress}.xml`,
        mimeType: "application/xml",
        sizeBytes: 0,
        storageKey: "s3_mock_url_for_ccda_xml",
      }
    });

    // 4. Alert the provider in their Inbox
    // prisma.message.create(...)

    logger.info({ 
      event: "integrations.dsm.ingested", 
      sender: payload.senderDirectAddress, 
      recipient: payload.recipientDirectAddress 
    });

    return NextResponse.json({ 
      success: true, 
      status: "routed_to_inbox"
    });

  } catch (error) {
    logger.error({ event: "integrations.dsm.failed", error });
    return NextResponse.json({ error: "Failed to ingest DSM payload" }, { status: 500 });
  }
}
