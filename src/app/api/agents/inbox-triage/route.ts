import { NextResponse } from "next/server";
import { logger } from "@/lib/observability/log";
// import { prisma } from "@/lib/db/prisma"; // If needed

// EMR-080: Smart Prioritization Inbox Triage
// AI Agent that intercepts inbound secure messages from patients, analyzes the text,
// and automatically categorizes them (Clinical, Billing, Scheduling) and tags urgency.

export async function POST(req: Request) {
  try {
    const authHeader = req.headers.get("authorization") ?? "";
    const secret = process.env.WEBHOOK_SECRET ?? "";
    
    if (process.env.NODE_ENV === "production" && authHeader !== `Bearer ${secret}`) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    const payload = await req.json();

    if (!payload.messageId || !payload.bodyText) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    // 1. NLP Mock: Analyze the incoming message
    const text = payload.bodyText.toLowerCase();
    let category = "General";
    let urgency = "routine";

    if (text.includes("chest pain") || text.includes("allergic") || text.includes("severe")) {
      category = "Clinical";
      urgency = "urgent";
    } else if (text.includes("refill") || text.includes("prescription")) {
      category = "Pharmacy";
      urgency = "high";
    } else if (text.includes("bill") || text.includes("insurance") || text.includes("charge")) {
      category = "Billing";
      urgency = "routine";
    } else if (text.includes("reschedule") || text.includes("cancel")) {
      category = "Scheduling";
      urgency = "routine";
    }

    // 2. Mock: Update the message record in the database
    // await prisma.message.update({
    //   where: { id: payload.messageId },
    //   data: { tags: [category, urgency] }
    // });

    logger.info({ 
      event: "agents.inbox_triage.categorized", 
      messageId: payload.messageId, 
      category, 
      urgency 
    });

    return NextResponse.json({ 
      success: true, 
      messageId: payload.messageId,
      triageResult: {
        category,
        urgency
      }
    });

  } catch (error) {
    logger.error({ event: "agents.inbox_triage.failed", error });
    return NextResponse.json({ error: "Failed to run inbox triage" }, { status: 500 });
  }
}
