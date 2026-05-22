import { NextResponse } from "next/server";
import { logger } from "@/lib/observability/log";

// EMR-177: Google Chat Sprint Broadcaster
// DevOps utility webhook. When a block of EMR tickets is successfully deployed, 
// this agent automatically crafts a formatted message and pushes it to the 
// Engineering team's Google Chat Space via an incoming webhook.

export async function POST(req: Request) {
  try {
    const authHeader = req.headers.get("authorization") ?? "";
    const secret = process.env.WEBHOOK_SECRET ?? "";
    
    if (process.env.NODE_ENV === "production" && authHeader !== `Bearer ${secret}`) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    const payload = await req.json();

    if (!payload.message || !payload.ticketsCompleted) {
      return NextResponse.json({ error: "Missing required payload fields" }, { status: 400 });
    }

    const { message, ticketsCompleted, webhookUrl } = payload;
    
    // In production, the URL is an env var, but allowing override for dynamic routing
    const targetUrl = webhookUrl || process.env.GOOGLE_CHAT_WEBHOOK_URL;

    if (!targetUrl) {
      return NextResponse.json({ error: "No Google Chat Webhook URL configured." }, { status: 500 });
    }

    logger.info({ 
      event: "agents.sprint_broadcaster.sending", 
      ticketsCompleted 
    });

    // 1. Format the Google Chat payload (Simple Text or Card)
    const chatPayload = {
      text: `🚀 *SPRINT UPDATE*\n\n${message}\n\n*Tickets Completed:* ${ticketsCompleted}\n*Status:* Deployed to QA Branch`
    };

    // 2. Transmit to Google Chat
    const response = await fetch(targetUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(chatPayload)
    });

    if (!response.ok) {
      throw new Error(`Google Chat API responded with status: ${response.status}`);
    }

    return NextResponse.json({ 
      success: true, 
      status: "broadcast_sent"
    });

  } catch (error) {
    logger.error({ event: "agents.sprint_broadcaster.failed", error });
    return NextResponse.json({ error: "Failed to broadcast sprint update" }, { status: 500 });
  }
}
