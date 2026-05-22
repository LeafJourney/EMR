import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { logger } from "@/lib/observability/log";

// EMR-097: Patient Satisfaction AI Sentiment Analyzer
// Parses free-text responses from post-visit surveys. Uses NLP to gauge 
// sentiment (positive, neutral, negative). Automatically escalates negative 
// reviews to the Clinic Manager for service recovery.

export async function POST(req: Request) {
  try {
    const authHeader = req.headers.get("authorization") ?? "";
    const secret = process.env.WEBHOOK_SECRET ?? "";
    
    if (process.env.NODE_ENV === "production" && authHeader !== `Bearer ${secret}`) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    const payload = await req.json();

    if (!payload.encounterId || !payload.patientId || !payload.feedbackText) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const text = payload.feedbackText.toLowerCase();
    let sentiment = "neutral";
    let isEscalated = false;

    // 1. NLP Sentiment Mock
    if (text.includes("great") || text.includes("excellent") || text.includes("helpful") || text.includes("loved")) {
      sentiment = "positive";
    } else if (text.includes("wait time") || text.includes("rude") || text.includes("unprofessional") || text.includes("terrible")) {
      sentiment = "negative";
      isEscalated = true;
    }

    // 2. Log feedback and escalate if needed
    // await prisma.patientFeedback.create(...)

    if (isEscalated) {
      logger.error({ 
        event: "agents.sentiment_analyzer.negative_feedback_escalated", 
        patientId: payload.patientId, 
        encounterId: payload.encounterId 
      });

      // Create a task for the Clinic Manager
      await prisma.auditLog.create({
        data: {
          organizationId: payload.organizationId || "DEFAULT",
          action: "SERVICE_RECOVERY_REQUIRED",
          subjectType: "Patient",
          subjectId: payload.patientId,
          metadata: { feedback: payload.feedbackText, sentiment }
        }
      });
    } else {
      logger.info({ 
        event: "agents.sentiment_analyzer.feedback_processed", 
        patientId: payload.patientId,
        sentiment 
      });
    }

    return NextResponse.json({ 
      success: true, 
      sentiment,
      isEscalated
    });

  } catch (error) {
    logger.error({ event: "agents.sentiment_analyzer.failed", error });
    return NextResponse.json({ error: "Failed to run sentiment analyzer" }, { status: 500 });
  }
}
