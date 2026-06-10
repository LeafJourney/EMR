import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { logger } from "@/lib/observability/log";

// EMR-115: Medical Necessity "Smart-Phrase" Injector
// NLP agent that scans the active charting session. Based on the selected diagnosis 
// (e.g., Medicare LCD/NCD requirements), it automatically injects the required 
// justification phrases (e.g., "Patient failed 6 weeks of conservative therapy") 
// to prevent claim denials.

export async function POST(req: Request) {
  try {
    const authHeader = req.headers.get("authorization") ?? "";
    const secret = process.env.WEBHOOK_SECRET ?? "";
    
    if (process.env.NODE_ENV === "production" && authHeader !== `Bearer ${secret}`) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    const payload = await req.json();

    if (!payload.encounterId || !payload.icd10Code) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    // 1. Fetch Medicare Local Coverage Determination (LCD) rules (Mocked)
    let smartPhrase = "";
    
    // E.g., Knee Osteoarthritis requiring Hyaluronic Acid Injection
    if (payload.icd10Code.startsWith("M17")) {
      smartPhrase = "Patient has radiographically confirmed osteoarthritis. Patient has failed >3 months of conservative therapy including NSAIDs and physical therapy. Symptoms persistently interfere with Activities of Daily Living (ADLs).";
    } else if (payload.icd10Code.startsWith("Z79")) {
      // Chronic drug therapy (Cannabis)
      smartPhrase = "Patient has intractable symptoms unresponsive to standard first-line therapies. Risks and benefits of medical cannabis discussed at length.";
    }

    // ADVISORY ONLY — this agent must NOT write to the chart. Auto-injecting
    // medical-necessity language a clinician never authored (e.g. "failed >3
    // months of conservative therapy") is a documentation-integrity and
    // billing-compliance hazard. We return the suggested phrase for the
    // clinician to review and accept in the UI; we never mutate Encounter.reason.
    // (Was: prisma.encounter.update — see EMR-115 follow-up to wire real review.)
    if (smartPhrase) {
      // Confirm the encounter exists so the suggestion is scoped to a real
      // chart, but perform no write.
      const encounter = await prisma.encounter.findUnique({
        where: { id: payload.encounterId },
        select: { id: true },
      });

      logger.info({
        event: "agents.smart_phrase.suggested",
        encounterId: payload.encounterId,
        icd10Code: payload.icd10Code,
        encounterFound: Boolean(encounter),
      });

      return NextResponse.json({
        success: true,
        advisory: true,
        applied: false,
        encounterFound: Boolean(encounter),
        suggestedPhrase: smartPhrase,
        requiresClinicianReview: true,
      });
    }

    return NextResponse.json({
      success: true,
      advisory: true,
      applied: false,
      suggestedPhrase: null,
    });

  } catch (error) {
    logger.error({ event: "agents.smart_phrase.failed", error });
    return NextResponse.json({ error: "Failed to run smart phrase injector" }, { status: 500 });
  }
}
