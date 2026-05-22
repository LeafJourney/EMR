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

    if (smartPhrase) {
      // 2. Inject phrase into Encounter Plan
      const encounter = await prisma.encounter.findUnique({ where: { id: payload.encounterId } });
      
      if (encounter) {
        const updatedReason = encounter.reason ? `${encounter.reason}\n\n[Medical Necessity]\n${smartPhrase}` : `[Medical Necessity]\n${smartPhrase}`;
        
        await prisma.encounter.update({
          where: { id: payload.encounterId },
          data: { reason: updatedReason }
        });

        logger.info({ 
          event: "agents.smart_phrase.injected", 
          encounterId: payload.encounterId, 
          icd10Code: payload.icd10Code 
        });
      }

      return NextResponse.json({ 
        success: true, 
        injectedPhrase: smartPhrase
      });
    }

    return NextResponse.json({ 
      success: true, 
      injectedPhrase: null
    });

  } catch (error) {
    logger.error({ event: "agents.smart_phrase.failed", error });
    return NextResponse.json({ error: "Failed to run smart phrase injector" }, { status: 500 });
  }
}
