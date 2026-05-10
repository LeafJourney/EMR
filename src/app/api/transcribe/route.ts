import { NextResponse } from "next/server";
import { logger } from "@/lib/observability/log";
import { requireUser } from "@/lib/auth/session";
import {
  transcribeAudio,
  TranscriptionNotConfiguredError,
  TranscriptionFailedError,
} from "@/lib/domain/transcription";

/**
 * POST /api/transcribe
 *
 * Accepts a multipart/form-data payload with a single "audio" file
 * field. Sends the audio to the configured transcription provider
 * (see lib/domain/transcription.ts) and returns canonical
 * TranscriptSegment records.
 *
 * Callers (voice-recorder.tsx) should fall back to the simulated
 * transcript when this route returns:
 *   - 404 (shouldn't happen in practice; deployment safety net)
 *   - 503 with error "transcription_not_configured"
 *
 * All other errors surface as 500 so the UI can show a real error.
 */

export const runtime = "nodejs";
// Transcription can take tens of seconds for long recordings.
export const maxDuration = 60;

export async function POST(request: Request) {
  const user = await requireUser();
  if (!user.organizationId) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json(
      { error: "invalid_form_data", detail: "Expected multipart/form-data." },
      { status: 400 },
    );
  }

  const file = formData.get("audio");
  if (!(file instanceof Blob)) {
    return NextResponse.json(
      { error: "missing_audio", detail: "Field 'audio' is required." },
      { status: 400 },
    );
  }

  if (file.size === 0) {
    return NextResponse.json(
      { error: "empty_audio", detail: "Audio payload is empty." },
      { status: 400 },
    );
  }

  try {
    const segments = await transcribeAudio(file, {
      mimeType: file.type,
    });
    return NextResponse.json({ segments });
  } catch (err) {
    if (err instanceof TranscriptionNotConfiguredError) {
      // Let the UI fall back to the simulated transcript without logging
      // this as an error — it's the expected state in dev / demo.
      return NextResponse.json(
        {
          error: "transcription_not_configured",
          detail: err.message,
        },
        { status: 503 },
      );
    }
    if (err instanceof TranscriptionFailedError) {
      logger.error({ event: "transcribe.provider_failed", err });
      return NextResponse.json(
        {
          error: "transcription_failed",
          provider: err.provider,
          detail: err.message,
        },
        { status: 502 },
      );
    }
    logger.error({ event: "transcribe.unexpected_error", err });
    return NextResponse.json(
      {
        error: "internal_error",
        detail: err instanceof Error ? err.message : String(err),
      },
      { status: 500 },
    );
  }
}
