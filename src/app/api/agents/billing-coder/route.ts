import { NextResponse } from "next/server";
import { logger } from "@/lib/observability/log";

// EMR-032: Billing Rules Engine & Auto-Coding
// Background agent that parses signed clinician notes and automatically suggests 
// or applies ICD-10 and CPT codes for the encounter to generate draft claims.

export async function POST(req: Request) {
  try {
    const authHeader = req.headers.get("authorization") ?? "";
    const secret = process.env.CRON_SECRET ?? "";
    
    if (process.env.NODE_ENV === "production" && authHeader !== `Bearer ${secret}`) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    const payload = await req.json();

    if (!payload.encounterId || !payload.clinicalNoteText) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    // 1. AI Logic Mock: Extracting Codes from clinical text
    // In production, this would call an NLP model trained on medical coding
    const text = payload.clinicalNoteText.toLowerCase();
    
    const suggestedIcd10 = [];
    const suggestedCpt = [];

    if (text.includes("cannabis") || text.includes("medical marijuana")) {
      suggestedIcd10.push({ code: "Z79.899", description: "Other long term (current) drug therapy" });
    }
    if (text.includes("chronic pain")) {
      suggestedIcd10.push({ code: "G89.29", description: "Other chronic pain" });
    }
    if (text.includes("anxiety")) {
      suggestedIcd10.push({ code: "F41.9", description: "Anxiety disorder, unspecified" });
    }

    // Determine E/M level based on time spent or complexity (mocked logic)
    if (text.length > 500) {
      suggestedCpt.push({ code: "99214", description: "Office or other outpatient visit (Moderate severity)" });
    } else {
      suggestedCpt.push({ code: "99213", description: "Office or other outpatient visit (Low severity)" });
    }

    // ADVISORY ONLY — this agent must NOT create payer claims. The previous
    // version auto-created a real Claim with a hardcoded billedAmountCents and
    // an E/M level chosen purely by note LENGTH (text.length > 500 → 99214) —
    // note length is not a lawful basis for an E/M level (upcoding / False
    // Claims Act exposure). Return the code suggestions for a certified coder to
    // review and apply in the biller UI; persist nothing.
    logger.info({
      event: "agents.billing_coder.suggested",
      encounterId: payload.encounterId,
      cptCount: suggestedCpt.length,
      icd10Count: suggestedIcd10.length,
    });

    return NextResponse.json({
      success: true,
      advisory: true,
      applied: false,
      suggestedCpt,
      suggestedIcd10,
    });

  } catch (error) {
    logger.error({ event: "agents.billing_coder.failed", error });
    return NextResponse.json({ error: "Failed to run billing coder" }, { status: 500 });
  }
}
