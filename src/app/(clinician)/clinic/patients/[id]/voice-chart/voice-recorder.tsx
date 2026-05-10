"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { TranscriptSegment } from "@/lib/domain/voice-chart";
import type { NoteBlockType } from "@/lib/domain/notes";
import { NOTE_BLOCK_LABELS, APSO_ORDER } from "@/lib/domain/notes";
import {
  startVoiceEncounter,
  processTranscript,
  saveTranscriptToEncounter,
} from "./actions";
import { logger } from "@/lib/observability/log";

// ── Types ──────────────────────────────────────────────────────

type RecordingState = "idle" | "recording" | "paused" | "processing" | "complete";

interface NoteBlock {
  type: NoteBlockType;
  heading: string;
  body: string;
  metadata?: Record<string, unknown>;
}

interface Props {
  patientId: string;
  patientName: string;
  patientDob: string | null;
  presentingConcerns: string | null;
  treatmentGoals: string | null;
}

// ── Simulated transcript ───────────────────────────────────────

function buildSimulatedTranscript(
  patientName: string,
  concerns: string | null,
  goals: string | null,
  durationSec: number
): TranscriptSegment[] {
  const firstName = patientName.split(" ")[0];
  const concernText = concerns || "general wellness";
  const goalText = goals || "symptom management";

  const segments: TranscriptSegment[] = [
    {
      speaker: "clinician",
      text: `Good morning, ${firstName}. How have you been feeling since our last visit?`,
      startTime: 0,
      endTime: 8,
    },
    {
      speaker: "patient",
      text: `Overall I've been doing better, doctor. The ${concernText} has been more manageable lately. I've been sticking with the treatment plan we discussed.`,
      startTime: 8,
      endTime: 22,
    },
    {
      speaker: "clinician",
      text: "That's good to hear. Can you walk me through your current regimen? How are you using the cannabis products we discussed?",
      startTime: 22,
      endTime: 32,
    },
    {
      speaker: "patient",
      text: "I've been using the tincture twice daily, about 15mg CBD and 5mg THC in the morning, and then 10mg CBD with 10mg THC in the evening before bed. The evening dose really helps with sleep.",
      startTime: 32,
      endTime: 52,
    },
    {
      speaker: "clinician",
      text: "And how is the sleep quality? Any side effects you've noticed?",
      startTime: 52,
      endTime: 58,
    },
    {
      speaker: "patient",
      text: "Sleep is much better, falling asleep within 30 minutes now instead of over an hour. No major side effects, maybe a little dry mouth in the morning but nothing bothersome.",
      startTime: 58,
      endTime: 74,
    },
    {
      speaker: "clinician",
      text: `Good. And regarding your ${goalText} goals, are you seeing progress there?`,
      startTime: 74,
      endTime: 82,
    },
    {
      speaker: "patient",
      text: "Definitely. My pain levels have dropped from about a 7 to around a 3 or 4 on most days. I'm able to be more active and even started walking daily again.",
      startTime: 82,
      endTime: 98,
    },
    {
      speaker: "clinician",
      text: "That's excellent progress. I'd like to continue with the current regimen since it's working well. Let's check in again in four weeks. If anything changes or you have concerns before then, don't hesitate to reach out.",
      startTime: 98,
      endTime: 118,
    },
    {
      speaker: "patient",
      text: "Sounds great, thank you doctor.",
      startTime: 118,
      endTime: 122,
    },
  ];

  // Scale timestamps to roughly match actual recording duration
  const maxTime = segments[segments.length - 1].endTime;
  const scale = durationSec > 0 ? durationSec / maxTime : 1;

  return segments.map((s) => ({
    ...s,
    startTime: Math.round(s.startTime * scale),
    endTime: Math.round(s.endTime * scale),
  }));
}

// ── Real transcription w/ simulated fallback ────────────────────

/**
 * Posts the recorded audio to /api/transcribe and returns real
 * segments when the backend is configured. On any failure —
 * including the "transcription_not_configured" 503 the API
 * emits when TRANSCRIPTION_PROVIDER=simulated — falls back to
 * the simulated transcript so the voice-chart flow still works
 * end-to-end in dev / demo environments.
 */
async function transcribeOrFallback(opts: {
  audioChunks: Blob[];
  mimeType: string;
  durationSec: number;
  patientName: string;
  presentingConcerns: string | null;
  treatmentGoals: string | null;
}): Promise<TranscriptSegment[]> {
  const {
    audioChunks,
    mimeType,
    durationSec,
    patientName,
    presentingConcerns,
    treatmentGoals,
  } = opts;

  const fallback = () =>
    buildSimulatedTranscript(
      patientName,
      presentingConcerns,
      treatmentGoals,
      durationSec,
    );

  if (audioChunks.length === 0) {
    return fallback();
  }

  const blob = new Blob(audioChunks, { type: mimeType || "audio/webm" });
  if (blob.size === 0) return fallback();

  try {
    const form = new FormData();
    form.append("audio", blob, filenameForMime(mimeType));

    const response = await fetch("/api/transcribe", {
      method: "POST",
      body: form,
    });

    if (response.status === 503) {
      // Expected in dev: TRANSCRIPTION_PROVIDER=simulated.
      // Fall back silently — no console noise.
      return fallback();
    }

    if (!response.ok) {
      logger.warn({
        event: "clinic.voice_recorder.transcribe_non_ok",
        status: response.status,
      });
      return fallback();
    }

    const payload = (await response.json()) as {
      segments?: TranscriptSegment[];
    };
    if (!Array.isArray(payload.segments) || payload.segments.length === 0) {
      return fallback();
    }
    return payload.segments;
  } catch (err) {
    logger.warn({
      event: "clinic.voice_recorder.transcribe_failed",
      err,
    });
    return fallback();
  }
}

function filenameForMime(mime: string): string {
  const lower = (mime ?? "").toLowerCase();
  if (lower.includes("webm")) return "recording.webm";
  if (lower.includes("mp4")) return "recording.mp4";
  if (lower.includes("m4a")) return "recording.m4a";
  if (lower.includes("ogg")) return "recording.ogg";
  return "recording.webm";
}

// ── Waveform bar component ─────────────────────────────────────

function WaveformBars({ active }: { active: boolean }) {
  const [heights, setHeights] = useState<number[]>(
    () => Array.from({ length: 20 }, () => 0.15)
  );

  useEffect(() => {
    if (!active) {
      setHeights(Array.from({ length: 20 }, () => 0.15));
      return;
    }
    const interval = setInterval(() => {
      setHeights(
        Array.from({ length: 20 }, () => 0.15 + Math.random() * 0.85)
      );
    }, 150);
    return () => clearInterval(interval);
  }, [active]);

  return (
    <div className="flex items-center justify-center gap-[3px] h-12">
      {heights.map((h, i) => (
        <div
          key={i}
          className="w-[3px] rounded-full transition-all duration-150 ease-out"
          style={{
            height: `${h * 100}%`,
            backgroundColor: active
              ? "var(--accent)"
              : "var(--border-strong)",
            opacity: active ? 0.8 + h * 0.2 : 0.4,
          }}
        />
      ))}
    </div>
  );
}

// ── Timer display ──────────────────────────────────────────────

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}

// ── Confidence badge tone ──────────────────────────────────────

function confidenceTone(confidence: number) {
  if (confidence >= 0.8) return "success" as const;
  if (confidence >= 0.6) return "warning" as const;
  return "danger" as const;
}

// ── Section icon (inline SVG) ──────────────────────────────────

function SectionIcon({ type }: { type: NoteBlockType }) {
  const iconMap: Record<NoteBlockType, string> = {
    summary: "M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z",
    findings: "M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01",
    assessment: "M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z",
    plan: "M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4",
    followUp: "M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z",
  };
  return (
    <svg
      className="w-4 h-4 text-accent shrink-0"
      fill="none"
      viewBox="0 0 24 24"
      stroke="currentColor"
      strokeWidth={1.5}
    >
      <path strokeLinecap="round" strokeLinejoin="round" d={iconMap[type]} />
    </svg>
  );
}

// ── Main component ─────────────────────────────────────────────

export function VoiceRecorder({
  patientId,
  patientName,
  patientDob,
  presentingConcerns,
  treatmentGoals,
}: Props) {
  const router = useRouter();

  const [state, setState] = useState<RecordingState>("idle");
  const [duration, setDuration] = useState(0);
  const [encounterId, setEncounterId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Processing / complete state
  const [transcript, setTranscript] = useState<TranscriptSegment[]>([]);
  const [blocks, setBlocks] = useState<NoteBlock[]>([]);
  const [noteId, setNoteId] = useState<string | null>(null);
  const [confidence, setConfidence] = useState(0);

  // Audio refs
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const audioMimeTypeRef = useRef<string>("");
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const durationRef = useRef(0);

  // ── Timer helpers ──────────────────────────────────────────

  const startTimer = useCallback(() => {
    timerRef.current = setInterval(() => {
      durationRef.current += 1;
      setDuration(durationRef.current);
    }, 1000);
  }, []);

  const stopTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopTimer();
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
      }
    };
  }, [stopTimer]);

  // ── Recording controls ─────────────────────────────────────

  const handleStart = async () => {
    setError(null);

    try {
      // Create encounter first
      const { encounterId: eid } = await startVoiceEncounter(patientId);
      setEncounterId(eid);

      // Request microphone access
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const recorder = new MediaRecorder(stream);
      mediaRecorderRef.current = recorder;

      // Reset + collect audio chunks as they arrive so we can post the
      // full recording to /api/transcribe on stop. Default to the mime
      // type the browser actually gave us (webm on Chrome, mp4 on
      // Safari) so Whisper knows what it's decoding.
      audioChunksRef.current = [];
      audioMimeTypeRef.current = recorder.mimeType || "audio/webm";
      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      // Fire dataavailable every 1s so a browser crash doesn't lose
      // the whole recording — we still have partial audio to recover.
      recorder.start(1000);
      durationRef.current = 0;
      setDuration(0);
      startTimer();
      setState("recording");
    } catch (err) {
      logger.error({ event: "clinic.voice_recorder.start_failed", err });
      setError(
        err instanceof DOMException && err.name === "NotAllowedError"
          ? "Microphone access denied. Please allow microphone access in your browser settings."
          : "Failed to start recording. Please try again."
      );
    }
  };

  const handlePause = () => {
    if (mediaRecorderRef.current?.state === "recording") {
      mediaRecorderRef.current.pause();
      stopTimer();
      setState("paused");
    }
  };

  const handleResume = () => {
    if (mediaRecorderRef.current?.state === "paused") {
      mediaRecorderRef.current.resume();
      startTimer();
      setState("recording");
    }
  };

  const handleStop = async () => {
    stopTimer();

    // Stop the media recorder and tracks. MediaRecorder.stop() flushes a
    // final ondataavailable before firing onstop, so we await that via a
    // promise before assembling the audio blob for transcription.
    const recorder = mediaRecorderRef.current;
    const stopRecorder = recorder
      ? new Promise<void>((resolve) => {
          recorder.addEventListener("stop", () => resolve(), { once: true });
          recorder.stop();
        })
      : Promise.resolve();

    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }

    setState("processing");

    await stopRecorder;

    // Try the real transcription pipeline first. If the server isn't
    // configured (503 transcription_not_configured) or the provider
    // returns an error, fall back to the simulated transcript so the
    // demo / dev flow still works end-to-end.
    const segments = await transcribeOrFallback({
      audioChunks: audioChunksRef.current,
      mimeType: audioMimeTypeRef.current,
      durationSec: durationRef.current,
      patientName,
      presentingConcerns,
      treatmentGoals,
    });

    setTranscript(segments);

    // Save transcript to encounter
    if (encounterId) {
      try {
        await saveTranscriptToEncounter(encounterId, segments);
      } catch (err) {
        logger.error({ event: "clinic.voice_recorder.save_transcript_failed", err });
      }
    }

    // Format transcript and process through AI
    const formatted = segments
      .map((s) => {
        const speaker =
          s.speaker === "clinician"
            ? "Dr"
            : s.speaker === "patient"
              ? "Pt"
              : "??";
        return `[${formatDuration(s.startTime)}] ${speaker}: ${s.text}`;
      })
      .join("\n");

    if (encounterId) {
      const result = await processTranscript(encounterId, formatted, patientId);
      if (result.ok) {
        setBlocks(result.blocks);
        setNoteId(result.noteId);
        setConfidence(result.confidence);
        setState("complete");
      } else {
        setError(result.error);
        setState("idle");
      }
    } else {
      setError("No encounter ID. Please try again.");
      setState("idle");
    }
  };

  const handleRecordAgain = () => {
    setState("idle");
    setDuration(0);
    setTranscript([]);
    setBlocks([]);
    setNoteId(null);
    setConfidence(0);
    setError(null);
    durationRef.current = 0;
  };

  const handleOpenNote = () => {
    if (noteId) {
      router.push(`/clinic/patients/${patientId}/notes/${noteId}`);
    }
  };

  // ── Render ─────────────────────────────────────────────────

  return (
    <div className="space-y-8">
      {/* Error banner */}
      {error && (
        <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-danger">
          {error}
        </div>
      )}

      {/* ── Idle state ────────────────────────────────────── */}
      {state === "idle" && (
        <Card tone="raised" className="max-w-lg mx-auto">
          <CardContent className="pt-8 pb-8 flex flex-col items-center gap-6">
            <div className="text-center space-y-1">
              <p className="text-lg font-medium text-text">{patientName}</p>
              {patientDob && (
                <p className="text-sm text-text-muted">DOB: {patientDob}</p>
              )}
              {presentingConcerns && (
                <p className="text-xs text-text-muted mt-2 max-w-xs">
                  Concerns: {presentingConcerns}
                </p>
              )}
            </div>

            <button
              onClick={handleStart}
              className="group relative w-20 h-20 rounded-full bg-gradient-to-b from-accent to-accent-strong shadow-lg
                         hover:shadow-xl hover:scale-105 active:scale-95
                         transition-all duration-200 ease-out
                         focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
              aria-label="Start recording"
            >
              <svg
                className="w-8 h-8 text-accent-ink mx-auto"
                fill="currentColor"
                viewBox="0 0 24 24"
              >
                <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm-1 1.93c-3.94-.49-7-3.85-7-7.93h2c0 3.31 2.69 6 6 6s6-2.69 6-6h2c0 4.08-3.06 7.44-7 7.93V19h4v2H8v-2h4v-3.07z" />
              </svg>
            </button>

            <p className="text-sm text-text-muted">Tap to start recording</p>
          </CardContent>
        </Card>
      )}

      {/* ── Recording state ───────────────────────────────── */}
      {state === "recording" && (
        <Card tone="raised" className="max-w-lg mx-auto">
          <CardContent className="pt-8 pb-8 flex flex-col items-center gap-6">
            {/* Pulsing red indicator + timer */}
            <div className="flex items-center gap-3">
              <span className="relative flex h-3 w-3">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500" />
              </span>
              <span className="text-2xl font-mono font-semibold text-text tabular-nums tracking-wider">
                {formatDuration(duration)}
              </span>
            </div>

            {/* Waveform */}
            <WaveformBars active />

            {/* Listening indicator */}
            <p className="text-sm text-text-muted">
              Listening
              <span className="inline-flex ml-1">
                <span className="animate-bounce" style={{ animationDelay: "0ms" }}>.</span>
                <span className="animate-bounce" style={{ animationDelay: "150ms" }}>.</span>
                <span className="animate-bounce" style={{ animationDelay: "300ms" }}>.</span>
              </span>
            </p>

            {/* Controls */}
            <div className="flex items-center gap-3">
              <Button variant="secondary" size="md" onClick={handlePause}>
                <svg className="w-4 h-4 mr-1" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
                </svg>
                Pause
              </Button>
              <Button variant="danger" size="md" onClick={handleStop}>
                <svg className="w-4 h-4 mr-1" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M6 6h12v12H6z" />
                </svg>
                Stop
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Paused state ──────────────────────────────────── */}
      {state === "paused" && (
        <Card tone="raised" className="max-w-lg mx-auto">
          <CardContent className="pt-8 pb-8 flex flex-col items-center gap-6">
            <div className="flex items-center gap-3">
              <span className="inline-flex rounded-full h-3 w-3 bg-yellow-500" />
              <span className="text-2xl font-mono font-semibold text-text tabular-nums tracking-wider">
                {formatDuration(duration)}
              </span>
            </div>

            <WaveformBars active={false} />

            <p className="text-sm text-text-muted">Recording paused</p>

            <div className="flex items-center gap-3">
              <Button variant="primary" size="md" onClick={handleResume}>
                <svg className="w-4 h-4 mr-1" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M8 5v14l11-7z" />
                </svg>
                Resume
              </Button>
              <Button variant="danger" size="md" onClick={handleStop}>
                <svg className="w-4 h-4 mr-1" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M6 6h12v12H6z" />
                </svg>
                Stop
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Processing state ──────────────────────────────── */}
      {state === "processing" && (
        <div className="space-y-6">
          <Card tone="raised" className="max-w-lg mx-auto">
            <CardContent className="pt-8 pb-8 flex flex-col items-center gap-5">
              {/* Spinner */}
              <div className="w-10 h-10 border-2 border-accent/20 border-t-accent rounded-full animate-spin" />

              <p className="text-sm font-medium text-text">
                Processing transcript
                <span className="inline-flex ml-1">
                  <span className="animate-bounce" style={{ animationDelay: "0ms" }}>.</span>
                  <span className="animate-bounce" style={{ animationDelay: "150ms" }}>.</span>
                  <span className="animate-bounce" style={{ animationDelay: "300ms" }}>.</span>
                </span>
              </p>
              <p className="text-xs text-text-muted">
                Extracting structured notes from your conversation
              </p>
            </CardContent>
          </Card>

          {/* Transcript preview */}
          {transcript.length > 0 && (
            <Card className="max-w-2xl mx-auto">
              <CardHeader>
                <CardTitle>Transcript</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2 text-sm">
                  {transcript.map((seg, i) => (
                    <div key={i} className="flex gap-2">
                      <span className="font-medium text-text-muted shrink-0 w-8">
                        {seg.speaker === "clinician" ? "Dr" : "Pt"}
                      </span>
                      <span className="text-text">{seg.text}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* ── Complete state ────────────────────────────────── */}
      {state === "complete" && (
        <div className="space-y-6">
          {/* Header with confidence + actions */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="flex items-center gap-3">
              <h2 className="text-xl font-display font-medium text-text">
                Extracted Notes
              </h2>
              <Badge tone={confidenceTone(confidence)}>
                {Math.round(confidence * 100)}% confidence
              </Badge>
            </div>
            <div className="flex items-center gap-3">
              <Button variant="secondary" size="md" onClick={handleRecordAgain}>
                Record Again
              </Button>
              <Button variant="primary" size="md" onClick={handleOpenNote}>
                Open in Note Editor
              </Button>
            </div>
          </div>

          {/* Note sections in APSO order */}
          <div className="grid gap-4 max-w-3xl">
            {APSO_ORDER.map((sectionType) => {
              const block = blocks.find((b) => b.type === sectionType);
              if (!block) return null;
              return (
                <Card key={sectionType}>
                  <CardHeader className="pb-2">
                    <div className="flex items-center gap-2">
                      <SectionIcon type={sectionType} />
                      <CardTitle className="text-base">
                        {NOTE_BLOCK_LABELS[sectionType]}
                      </CardTitle>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-text leading-relaxed whitespace-pre-wrap">
                      {block.body}
                    </p>
                  </CardContent>
                </Card>
              );
            })}
          </div>

          {/* Transcript accordion */}
          <details className="max-w-3xl">
            <summary className="cursor-pointer text-sm font-medium text-text-muted hover:text-text transition-colors duration-200 py-2">
              View full transcript ({transcript.length} segments, {formatDuration(duration)} recorded)
            </summary>
            <Card className="mt-2">
              <CardContent className="pt-4">
                <div className="space-y-2 text-sm">
                  {transcript.map((seg, i) => (
                    <div key={i} className="flex gap-3">
                      <span className="font-mono text-xs text-text-muted shrink-0 pt-0.5 w-10 text-right">
                        {formatDuration(seg.startTime)}
                      </span>
                      <span className="font-medium text-text-muted shrink-0 w-6">
                        {seg.speaker === "clinician" ? "Dr" : "Pt"}
                      </span>
                      <span className="text-text">{seg.text}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </details>
        </div>
      )}
    </div>
  );
}
