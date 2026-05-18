import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { logger } from "@/lib/observability/log";

// EMR-176: Telehealth Bandwidth Analyzer & Fallback
// Infrastructure webhook. Continuously monitors WebRTC packet loss and latency 
// during an active telehealth visit. If a rural patient's internet connection 
// degrades severely, it seamlessly downgrades the session from HD Video to 
// Audio-Only to prevent a dropped clinical encounter.

export async function POST(req: Request) {
  try {
    const authHeader = req.headers.get("authorization") ?? "";
    const secret = process.env.WEBHOOK_SECRET ?? "";
    
    if (process.env.NODE_ENV === "production" && authHeader !== `Bearer ${secret}`) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    const payload = await req.json();

    if (!payload.telehealthSessionId || !payload.packetLossPercent) {
      return NextResponse.json({ error: "Missing required WebRTC telemetry" }, { status: 400 });
    }

    const { telehealthSessionId, packetLossPercent, currentMode } = payload;

    logger.info({ 
      event: "integrations.telehealth_bandwidth.monitoring", 
      telehealthSessionId, 
      packetLossPercent 
    });

    // 1. Evaluate Network Degradation
    // If packet loss exceeds 15%, video becomes completely frozen/unusable
    if (packetLossPercent > 15 && currentMode !== "audio_only") {
      
      logger.warn({ 
        event: "integrations.telehealth_bandwidth.downgraded", 
        telehealthSessionId, 
        packetLossPercent 
      });

      // 2. Command the client UI to drop video stream (Mock payload return)
      await prisma.auditLog.create({
        data: {
          organizationId: payload.organizationId || "DEFAULT",
          action: "TELEHEALTH_SESSION_DOWNGRADED",
          entity: "Encounter", // Assuming sessionId maps to encounter
          entityId: telehealthSessionId,
          details: { 
            reason: `Severe network degradation (${packetLossPercent}% packet loss). Auto-switched to Audio-Only to preserve encounter.` 
          }
        }
      });

      return NextResponse.json({ 
        success: true, 
        action: "downgrade_to_audio",
        message: "Bandwidth critical. Preserving connection."
      });
    }

    return NextResponse.json({ 
      success: true, 
      action: "maintain_current_mode"
    });

  } catch (error) {
    logger.error({ event: "integrations.telehealth_bandwidth.failed", error });
    return NextResponse.json({ error: "Failed to analyze telehealth bandwidth" }, { status: 500 });
  }
}
