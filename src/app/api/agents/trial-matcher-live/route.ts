import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { logger } from "@/lib/observability/log";

// EMR-129: AI Clinical Trial Matching Engine (In-Visit)
// Real-time NLP agent that scans the active charting session. It cross-references
// the patient's demographics, ICD-10 codes, and clinical text against active 
// internal research protocols or ClinicalTrials.gov to flag enrollment opportunities.

export async function POST(req: Request) {
  try {
    const authHeader = req.headers.get("authorization") ?? "";
    const secret = process.env.WEBHOOK_SECRET ?? "";
    
    if (process.env.NODE_ENV === "production" && authHeader !== `Bearer ${secret}`) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    const payload = await req.json();

    if (!payload.encounterId || !payload.patientId) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const encounter = await prisma.encounter.findUnique({
      where: { id: payload.encounterId },
      include: { patient: true }
    });

    if (!encounter || !encounter.patient) {
      return NextResponse.json({ error: "Encounter not found" }, { status: 404 });
    }

    const clinicalText = (encounter.reason || "").toLowerCase();
    
    // 1. Mock Active Trials Database
    const activeTrials = [
      { id: "NCT1001", condition: "crohn", keyword: "refractory crohn" },
      { id: "NCT1002", condition: "insomnia", keyword: "chronic insomnia" }
    ];

    let matchedTrial = null;

    // 2. Scan Clinical Text for Inclusion Criteria
    for (const trial of activeTrials) {
      if (clinicalText.includes(trial.keyword)) {
        matchedTrial = trial;
        break;
      }
    }

    if (matchedTrial) {
      logger.info({ 
        event: "agents.trial_matcher_live.match_found", 
        patientId: encounter.patientId, 
        trialId: matchedTrial.id 
      });

      // 3. Inject an Alert into the active Encounter UI
      await prisma.auditLog.create({
        data: {
          organizationId: encounter.organizationId,
          action: "CLINICAL_TRIAL_MATCH_SUGGESTED",
          subjectType: "Encounter",
          subjectId: encounter.id,
          metadata: { trialId: matchedTrial.id, message: `Patient may be eligible for Trial ${matchedTrial.id}. Discuss enrollment.` }
        }
      });

      return NextResponse.json({ 
        success: true, 
        status: "match_found",
        trialId: matchedTrial.id
      });
    }

    return NextResponse.json({ 
      success: true, 
      status: "no_matches"
    });

  } catch (error) {
    logger.error({ event: "agents.trial_matcher_live.failed", error });
    return NextResponse.json({ error: "Failed to run live trial matcher" }, { status: 500 });
  }
}
