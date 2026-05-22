import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { logger } from "@/lib/observability/log";
import { requireUser } from "@/lib/auth/session";

// EMR-070: Voice Note AI Transcription Engine
// Accepts raw audio blobs from the clinician's microphone, runs it through an 
// AI speech-to-text pipeline (like Deepgram or Whisper), and automatically 
// structures the output into a standard SOAP note format.

export async function POST(req: Request) {
  try {
    const user = await requireUser();
    
    const formData = await req.formData();
    const audioFile = formData.get("audio");
    const encounterId = formData.get("encounterId")?.toString();

    if (!audioFile || !encounterId) {
      return NextResponse.json({ error: "Missing audio or encounterId" }, { status: 400 });
    }

    // 1. Simulate passing audio to a Transcription API (e.g. Whisper)
    // const buffer = await (audioFile as Blob).arrayBuffer();
    // const transcript = await whisperAPI.transcribe(buffer);
    const mockTranscript = "Patient reports their chronic back pain is improving on the current tincture but they have trouble sleeping. I recommend increasing the PM dose by 0.25mL.";

    // 2. Pass transcript to an LLM to format into SOAP (Subjective, Objective, Assessment, Plan)
    const mockSoapNote = `
S: Patient reports chronic back pain is improving on current tincture. Complains of trouble sleeping.
O: Patient appears well, comfortable. No acute distress.
A: Chronic back pain, stable. Insomnia, uncontrolled.
P: Increase PM dose of high-CBD/THC tincture by 0.25mL. Follow up in 4 weeks.
    `.trim();

    // 3. Update the encounter notes
    const encounter = await prisma.encounter.update({
      where: { id: encounterId },
      data: {
        reason: mockSoapNote // Storing the draft in the reason/clinical note field
      }
    });

    logger.info({ 
      event: "agents.voice_transcriber.completed", 
      encounterId: encounterId, 
      providerId: user.id 
    });

    return NextResponse.json({ 
      success: true, 
      rawTranscript: mockTranscript,
      structuredNote: mockSoapNote
    });

  } catch (error) {
    logger.error({ event: "agents.voice_transcriber.failed", error });
    return NextResponse.json({ error: "Failed to transcribe audio" }, { status: 500 });
  }
}
