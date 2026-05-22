import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth/session";
import { logger } from "@/lib/observability/log";

// EMR-024: Telehealth Video Infrastructure (Twilio API Integration)
// Generates secure JWT access tokens for patients and providers to join 
// scheduled video telehealth rooms.

export async function GET(req: Request) {
  try {
    const user = await requireUser();
    
    const url = new URL(req.url);
    const roomName = url.searchParams.get("room");

    if (!roomName) {
      return NextResponse.json({ error: "Room name is required" }, { status: 400 });
    }

    // Mock Twilio Token Generation
    // In a real implementation, we would use twilio.jwt.AccessToken
    const mockToken = Buffer.from(`mock_twilio_token_${user.id}_${roomName}_${Date.now()}`).toString('base64');

    logger.info({ 
      event: "twilio.video_token.generated", 
      userId: user.id, 
      room: roomName 
    });

    return NextResponse.json({ 
      token: mockToken,
      room: roomName,
      identity: user.id,
      expiresIn: 3600 // 1 hour
    });

  } catch (error) {
    logger.error({ event: "twilio.video_token.failed", error });
    return NextResponse.json({ error: "Failed to generate video token" }, { status: 500 });
  }
}
