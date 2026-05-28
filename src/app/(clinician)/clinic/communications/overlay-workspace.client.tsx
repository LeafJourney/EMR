"use client";

// EMR-037 — End-to-End Communications Overlay workspace.
//
// Three-panel client surface that lets a clinician demo the full
// communications stack from a single page:
//
//   1. Encrypted Messenger    — E2EE chat with file-attachment stubs.
//   2. Telehealth Video       — simulated WebRTC tiles + call controls.
//   3. HIPAA Phone/Fax Portal — dialer with live transcript redaction
//                               and a clinical fax send/receive log.
//
// Everything is purely visual / simulated. The real wiring lives in
// `src/app/api/communications/**` and the existing sub-routes; this
// component is the glassmorphism "command center" that ties them
// together.

import * as React from "react";
import {
  Lock,
  Paperclip,
  Send,
  Video,
  Mic,
  MicOff,
  Volume2,
  VolumeX,
  ScreenShare,
  PhoneCall,
  PhoneOff,
  ShieldCheck,
  FileText,
  Upload,
  Inbox,
  CircleDot,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Tabs, TabList, Trigger, Panel } from "@/components/ui/tabs";
import { cn } from "@/lib/utils/cn";
import {
  generateSessionKeyPair,
  redactTranscriptLine,
  type SessionKeyPair,
  type RedactedTranscriptLine,
} from "@/lib/communications/overlay";
import { PATIENT_CHECKLIST } from "@/lib/domain/telehealth";
import { DailyVideoFrame, type ConnectionState } from "@/components/telehealth/DailyVideoFrame";
import {
  startOverlayTelehealthVisit,
  endOverlayTelehealthVisit,
  fetchOverlayDefaultPatient,
  type OverlayTelehealthVisitResult,
} from "./actions";

// ---------------------------------------------------------------------------
// Shared building blocks
// ---------------------------------------------------------------------------

function GlassPanel({
  children,
  className,
  tone = "glass",
}: {
  children: React.ReactNode;
  className?: string;
  tone?: "glass" | "glassStrong";
}) {
  return (
    <Card
      tone={tone}
      className={cn(
        "relative overflow-hidden rounded-2xl border border-white/40 shadow-lg",
        className,
      )}
    >
      {children}
    </Card>
  );
}

function LiveDot({ tone = "success" }: { tone?: "success" | "warning" | "info" | "danger" }) {
  const dotColor = {
    success: "bg-success",
    warning: "bg-[color:var(--warning)]",
    info: "bg-info",
    danger: "bg-danger",
  }[tone];
  const ringColor = {
    success: "bg-success/40",
    warning: "bg-[color:var(--warning)]/40",
    info: "bg-info/40",
    danger: "bg-danger/40",
  }[tone];
  return (
    <span className="relative inline-flex h-2 w-2 items-center justify-center">
      <span className={cn("absolute inline-flex h-full w-full animate-ping rounded-full opacity-75", ringColor)} />
      <span className={cn("relative inline-flex h-2 w-2 rounded-full", dotColor)} />
    </span>
  );
}

function SectionHeading({
  title,
  description,
  status,
}: {
  title: string;
  description: string;
  status?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h3 className="font-display text-lg font-medium tracking-tight text-text">{title}</h3>
        <p className="mt-1 max-w-prose text-sm text-text-muted">{description}</p>
      </div>
      {status && <div className="shrink-0">{status}</div>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Encrypted Messenger
// ---------------------------------------------------------------------------

interface ChatMessage {
  id: string;
  from: "clinician" | "patient";
  body: string;
  sentAt: string;
  attachment?: { name: string; size: string };
}

const SEED_MESSAGES: ChatMessage[] = [
  {
    id: "m1",
    from: "patient",
    body:
      "Started the 1:1 tincture last night — slept 6.5 hrs which is the longest stretch in months.",
    sentAt: "08:42",
  },
  {
    id: "m2",
    from: "clinician",
    body:
      "That's a great signal. Any morning grogginess, or did the sleep feel restful?",
    sentAt: "08:44",
  },
  {
    id: "m3",
    from: "patient",
    body: "No grogginess. Pain at 3/10 vs 7/10 last week.",
    sentAt: "08:45",
  },
  {
    id: "m4",
    from: "clinician",
    body: "Wonderful. Sending the updated titration plan as an attachment.",
    sentAt: "08:46",
    attachment: { name: "titration-week-2.pdf", size: "184 KB" },
  },
];

function EncryptedMessenger() {
  // Generated once per mount. The fingerprint badge is the visible
  // surface of the simulated E2E negotiation.
  const [keyPair] = React.useState<SessionKeyPair>(() => generateSessionKeyPair());
  const [messages, setMessages] = React.useState<ChatMessage[]>(SEED_MESSAGES);
  const [draft, setDraft] = React.useState("");
  const [attachment, setAttachment] = React.useState<{ name: string; size: string } | null>(null);
  const logRef = React.useRef<HTMLDivElement | null>(null);

  React.useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight, behavior: "smooth" });
  }, [messages.length]);

  function send() {
    const trimmed = draft.trim();
    if (!trimmed && !attachment) return;
    setMessages((prev) => [
      ...prev,
      {
        id: `m${prev.length + 1}-${Date.now()}`,
        from: "clinician",
        body: trimmed || "(file attached)",
        sentAt: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        attachment: attachment ?? undefined,
      },
    ]);
    setDraft("");
    setAttachment(null);
  }

  function pickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setAttachment({ name: f.name, size: `${Math.max(1, Math.round(f.size / 1024))} KB` });
    e.target.value = "";
  }

  return (
    <GlassPanel className="flex flex-col">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/40 px-6 py-4">
        <div className="flex items-center gap-3">
          <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-accent-soft text-accent">
            <Lock className="h-4 w-4" aria-hidden />
          </span>
          <div className="min-w-0">
            <p className="text-sm font-medium text-text">Maya R. · Chronic pain panel</p>
            <p className="text-[11px] text-text-subtle">
              {keyPair.algorithm} · key fp {keyPair.fingerprint}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge tone="success" className="gap-1.5">
            <ShieldCheck className="h-3 w-3" aria-hidden /> E2E Encrypted
          </Badge>
          <Badge tone="neutral" className="gap-1.5">
            <LiveDot /> Live session
          </Badge>
        </div>
      </div>

      <div ref={logRef} className="max-h-[420px] min-h-[320px] overflow-y-auto px-6 py-5 space-y-3">
        {messages.map((m) => (
          <ChatBubble key={m.id} message={m} />
        ))}
      </div>

      <div className="border-t border-white/40 px-4 py-3 space-y-2">
        {attachment && (
          <div className="flex items-center justify-between rounded-md border border-border bg-surface px-3 py-1.5 text-xs">
            <span className="flex items-center gap-2 text-text-muted">
              <Paperclip className="h-3 w-3" /> {attachment.name} · {attachment.size}
            </span>
            <button
              type="button"
              onClick={() => setAttachment(null)}
              className="text-text-subtle hover:text-text"
            >
              remove
            </button>
          </div>
        )}
        <div className="flex items-center gap-2">
          <label className="inline-flex h-10 w-10 cursor-pointer items-center justify-center rounded-md border border-border-strong bg-surface text-text-muted hover:bg-surface-muted">
            <Paperclip className="h-4 w-4" aria-hidden />
            <span className="sr-only">Attach file</span>
            <input type="file" className="sr-only" onChange={pickFile} />
          </label>
          <Input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Type a HIPAA-compliant message…"
            className="flex-1"
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
          />
          <Button size="md" onClick={send} leadingIcon={<Send className="h-4 w-4" aria-hidden />}>
            Send
          </Button>
        </div>
        <p className="text-[11px] text-text-subtle">
          Messages and attachments are sealed with the session key above before leaving this device.
        </p>
      </div>
    </GlassPanel>
  );
}

function ChatBubble({ message }: { message: ChatMessage }) {
  const mine = message.from === "clinician";
  return (
    <div className={cn("flex", mine ? "justify-end" : "justify-start")}>
      <div
        className={cn(
          "max-w-[78%] rounded-2xl px-4 py-2 text-sm shadow-sm",
          mine
            ? "rounded-br-sm bg-accent text-accent-ink"
            : "rounded-bl-sm bg-surface text-text border border-border",
        )}
      >
        <p className="leading-relaxed">{message.body}</p>
        {message.attachment && (
          <div
            className={cn(
              "mt-2 flex items-center gap-2 rounded-md px-2 py-1 text-xs",
              mine ? "bg-white/15 text-accent-ink/90" : "bg-surface-muted text-text-muted",
            )}
          >
            <FileText className="h-3 w-3" aria-hidden /> {message.attachment.name} ·{" "}
            {message.attachment.size}
          </div>
        )}
        <p
          className={cn(
            "mt-1 flex items-center gap-1 text-[10px] uppercase tracking-wide",
            mine ? "text-accent-ink/70" : "text-text-subtle",
          )}
        >
          <Lock className="h-2.5 w-2.5" aria-hidden /> {message.sentAt}
        </p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Telehealth Video
// ---------------------------------------------------------------------------

function VideoTile({
  label,
  role,
  muted,
  cameraOff,
}: {
  label: string;
  role: "patient" | "provider";
  muted: boolean;
  cameraOff?: boolean;
}) {
  return (
    <div
      className={cn(
        "relative aspect-video w-full overflow-hidden rounded-xl border border-white/30 shadow-md",
        role === "patient"
          ? "bg-gradient-to-br from-emerald-700/80 via-emerald-900/80 to-slate-900"
          : "bg-gradient-to-br from-indigo-700/80 via-slate-900 to-slate-800",
      )}
    >
      <div className="absolute inset-0 opacity-30 mix-blend-screen">
        <div className="absolute -left-12 top-6 h-32 w-32 rounded-full bg-white blur-2xl" />
        <div className="absolute bottom-6 right-4 h-24 w-24 rounded-full bg-white/70 blur-2xl" />
      </div>
      {cameraOff && (
        <div className="absolute inset-0 flex items-center justify-center bg-slate-900/80">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-white/10 text-white/70">
            {label.slice(0, 1)}
          </div>
        </div>
      )}
      <div className="absolute left-3 top-3 flex items-center gap-1.5 rounded-full bg-black/40 px-2 py-0.5 text-[11px] font-medium text-white backdrop-blur-sm">
        <LiveDot tone={role === "patient" ? "success" : "info"} /> {label}
      </div>
      {muted && (
        <div className="absolute right-3 top-3 rounded-full bg-black/40 p-1.5 text-white backdrop-blur-sm">
          <MicOff className="h-3 w-3" aria-hidden />
        </div>
      )}
      <div className="absolute bottom-2 left-3 text-[10px] uppercase tracking-wide text-white/70">
        WebRTC · DTLS-SRTP · 1080p
      </div>
    </div>
  );
}

function TelehealthVideo() {
  const [phase, setPhase] = React.useState<"pre_visit" | "in_progress" | "ended">("pre_visit");
  const [checkedItems, setCheckedItems] = React.useState<Set<string>>(new Set());
  const [muted, setMuted] = React.useState(false);
  const [cameraOff, setCameraOff] = React.useState(false);
  const [speakerOff, setSpeakerOff] = React.useState(false);
  const [sharing, setSharing] = React.useState(false);
  const [scribeActive, setScribeActive] = React.useState(false);
  const [startingVisit, setStartingVisit] = React.useState(false);
  const [visitData, setVisitData] = React.useState<OverlayTelehealthVisitResult | null>(null);
  const [connection, setConnection] = React.useState<ConnectionState>("loading");
  const [participantCount, setParticipantCount] = React.useState(1);
  const [linkCopied, setLinkCopied] = React.useState(false);
  const [defaultPatient, setDefaultPatient] = React.useState<{ id: string; firstName: string; lastName: string; presentingConcerns: string | null } | null>(null);
  const [callSeconds, setCallSeconds] = React.useState(0);

  // Load default patient details on mount for pre-visit checklist preview
  React.useEffect(() => {
    let active = true;
    async function load() {
      try {
        const patient = await fetchOverlayDefaultPatient();
        if (active && patient) {
          setDefaultPatient(patient);
        }
      } catch (err) {
        console.error("Failed to load overlay patient:", err);
      }
    }
    load();
    return () => { active = false; };
  }, []);

  // Timer
  React.useEffect(() => {
    if (phase === "pre_visit") {
      setCallSeconds(0);
    }
  }, [phase]);

  React.useEffect(() => {
    if (phase === "in_progress" && connection === "joined") {
      const id = window.setInterval(() => setCallSeconds((s) => s + 1), 1000);
      return () => window.clearInterval(id);
    }
  }, [phase, connection]);

  const mm = String(Math.floor(callSeconds / 60)).padStart(2, "0");
  const ss = String(callSeconds % 60).padStart(2, "0");

  const toggleCheck = React.useCallback((id: string) => {
    setCheckedItems((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const requiredComplete = PATIENT_CHECKLIST
    .filter((c) => c.required)
    .every((c) => checkedItems.has(c.id));

  const startVisit = React.useCallback(async () => {
    setStartingVisit(true);
    try {
      const result = await startOverlayTelehealthVisit();
      setVisitData(result);
      setPhase("in_progress");
    } catch (err) {
      console.error("Failed to start overlay telehealth:", err);
      alert("Failed to start visit: " + (err instanceof Error ? err.message : String(err)));
    } finally {
      setStartingVisit(false);
    }
  }, []);

  const endVisit = React.useCallback(async () => {
    setPhase("ended");
    if (visitData?.room.name) {
      try {
        await endOverlayTelehealthVisit(visitData.room.name);
      } catch (err) {
        console.error("Failed to end overlay telehealth room:", err);
      }
    }
  }, [visitData]);

  const copyPatientLink = React.useCallback(() => {
    if (!visitData?.patientJoinUrl) return;
    navigator.clipboard.writeText(visitData.patientJoinUrl);
    setLinkCopied(true);
    setTimeout(() => setLinkCopied(false), 2000);
  }, [visitData]);

  if (phase === "pre_visit") {
    return (
      <GlassPanel className="flex flex-col">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/40 px-6 py-4">
          <div className="flex items-center gap-3">
            <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-info/10 text-info">
              <Video className="h-4 w-4" aria-hidden />
            </span>
            <div>
              <p className="text-sm font-medium text-text">Beam Telehealth · Setup workspace</p>
              <p className="text-[11px] text-text-subtle">
                Daily.co dynamic rooms · waiting-room verified · HIPAA compliant
              </p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-6 p-6 md:grid-cols-2">
          {/* System Readiness Checklist */}
          <div>
            <h4 className="text-sm font-medium text-text mb-3">System Readiness</h4>
            <ul className="space-y-2">
              {PATIENT_CHECKLIST.map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    onClick={() => toggleCheck(item.id)}
                    className={cn(
                      "w-full text-left flex items-start gap-2.5 p-2.5 rounded-xl border transition-all duration-200",
                      checkedItems.has(item.id)
                        ? "bg-accent/5 border-accent/20"
                        : "bg-surface border-border hover:bg-surface-muted",
                    )}
                  >
                    <div className={cn(
                      "mt-0.5 flex h-4 w-4 items-center justify-center rounded border transition-colors",
                      checkedItems.has(item.id) ? "border-accent bg-accent text-white" : "border-border-strong text-transparent"
                    )}>
                      <span className="text-[10px]">✓</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-xs font-semibold text-text">
                          {item.label}
                        </span>
                        {item.required && (
                          <Badge tone="warning" className="text-[8px] px-1 py-0 h-3.5">
                            Req
                          </Badge>
                        )}
                      </div>
                      <p className="text-[10px] text-text-muted mt-0.5">
                        {item.description}
                      </p>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          </div>

          {/* Patient Info Preview */}
          <div className="flex flex-col justify-between rounded-xl bg-surface-muted/30 border border-white/20 p-4">
            <div>
              <h4 className="text-xs uppercase tracking-wider text-text-subtle mb-3">Upcoming patient</h4>
              {defaultPatient ? (
                <div className="space-y-3">
                  <div>
                    <p className="text-sm font-semibold text-text">
                      {defaultPatient.firstName} {defaultPatient.lastName}
                    </p>
                    <p className="text-xs text-text-muted mt-1 leading-relaxed">
                      <span className="font-medium text-text-subtle">Presenting concern:</span>{" "}
                      {defaultPatient.presentingConcerns || "General follow-up."}
                    </p>
                  </div>
                </div>
              ) : (
                <div className="text-xs text-text-muted italic">
                  Loading database patient details...
                </div>
              )}
            </div>

            <div className="mt-4 pt-4 border-t border-white/10">
              <Button
                onClick={startVisit}
                disabled={!requiredComplete || startingVisit}
                size="sm"
                className="w-full"
              >
                {startingVisit ? "Creating video room..." : "Start video visit"}
              </Button>
              {!requiredComplete && (
                <p className="text-[10px] text-text-muted text-center mt-1.5">
                  Complete required system checks to enable visit.
                </p>
              )}
            </div>
          </div>
        </div>
      </GlassPanel>
    );
  }

  if (phase === "ended") {
    return (
      <GlassPanel className="flex flex-col items-center justify-center p-8 text-center min-h-[300px]">
        <div className="w-12 h-12 rounded-full bg-accent/10 mb-4 flex items-center justify-center text-accent">
          ✓
        </div>
        <h3 className="font-display text-lg text-text mb-1">
          Visit complete
        </h3>
        <p className="text-sm text-text-muted mb-1">
          The telehealth session has ended.
        </p>
        <p className="text-xs text-text-subtle mb-6">
          Duration: {mm}:{ss}
        </p>
        <Button onClick={() => setPhase("pre_visit")} size="sm">
          Reset setup
        </Button>
      </GlassPanel>
    );
  }

  return (
    <GlassPanel className="flex flex-col">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/40 px-6 py-3">
        <div className="flex items-center gap-3">
          <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-info/10 text-info">
            <Video className="h-4 w-4" aria-hidden />
          </span>
          <div>
            <p className="text-sm font-medium text-text">Beam Telehealth · Active room</p>
            <p className="text-[11px] text-text-subtle">
              Daily.co Live Session · waiting-room verified
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {scribeActive && (
            <div className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-accent/15 border border-accent/20 text-[10px] font-semibold text-accent animate-pulse">
              <span className="h-1.5 w-1.5 rounded-full bg-accent" />
              Scribe Active
            </div>
          )}
          <Badge tone={connection === "joined" ? "danger" : "info"} className="gap-1.5 text-xs py-0.5">
            {connection === "joined" ? (
              <>
                <LiveDot tone="danger" /> LIVE · {mm}:{ss}
              </>
            ) : (
              connection === "loading" ? "Loading..." : "Connecting..."
            )}
          </Badge>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 p-4 lg:grid-cols-3">
        {/* Main video area */}
        <div className="lg:col-span-2 relative aspect-video w-full overflow-hidden rounded-xl bg-black border border-white/20">
          {visitData ? (
            <DailyVideoFrame
              roomUrl={visitData.room.url}
              token={visitData.providerToken.token}
              userName={visitData.providerName}
              muted={muted}
              cameraOff={cameraOff}
              screenSharing={sharing}
              onConnectionStateChange={setConnection}
              onParticipantCountChange={setParticipantCount}
            />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center bg-slate-900">
              <p className="text-white/60 text-xs">Preparing video session...</p>
            </div>
          )}
        </div>

        {/* Chart quick-view */}
        <div className="rounded-xl bg-surface-muted/30 border border-white/20 p-4 space-y-4 text-xs">
          <div>
            <h4 className="text-[10px] text-text-subtle uppercase tracking-wider mb-1 font-semibold">Counterparty</h4>
            <p className="text-sm font-semibold text-text">
              {visitData?.patient.firstName} {visitData?.patient.lastName}
            </p>
          </div>

          <div>
            <h4 className="text-[10px] text-text-subtle uppercase tracking-wider mb-1 font-semibold">Presenting Concern</h4>
            <p className="text-text-muted leading-relaxed">
              {visitData?.patient.presentingConcerns || "No concern logged."}
            </p>
          </div>

          {visitData?.patient.medications && visitData.patient.medications.length > 0 && (
            <div>
              <h4 className="text-[10px] text-text-subtle uppercase tracking-wider mb-1 font-semibold">Active Medications</h4>
              <ul className="space-y-1">
                {visitData.patient.medications.map((med, index) => (
                  <li key={index} className="flex items-center gap-1.5 text-text-muted">
                    <span className="w-1.5 h-1.5 rounded-full bg-accent shrink-0" />
                    <span>{med.name}</span>
                    {med.dosage && <span className="text-[10px] text-text-subtle">({med.dosage})</span>}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {visitData && (
            <div className="pt-2.5 border-t border-white/10">
              <Button onClick={copyPatientLink} variant="secondary" size="sm" className="w-full h-7 text-[10px]">
                {linkCopied ? "Copied!" : "Copy patient link"}
              </Button>
            </div>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/40 bg-surface/40 px-6 py-3 backdrop-blur-sm">
        <div className="flex items-center gap-2">
          <ControlBtn
            active={!muted}
            onClick={() => setMuted((m) => !m)}
            label={muted ? "Unmute mic" : "Mute mic"}
            icon={muted ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
          />
          <ControlBtn
            active={!speakerOff}
            onClick={() => setSpeakerOff((s) => !s)}
            label={speakerOff ? "Unmute speaker" : "Mute speaker"}
            icon={speakerOff ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
          />
          <ControlBtn
            active={!cameraOff}
            onClick={() => setCameraOff((c) => !c)}
            label={cameraOff ? "Camera on" : "Camera off"}
            icon={<Video className="h-4 w-4" />}
          />
          <ControlBtn
            active={sharing}
            onClick={() => setSharing((s) => !s)}
            label={sharing ? "Stop sharing" : "Share screen"}
            icon={<ScreenShare className="h-4 w-4" />}
            tone="info"
          />
          <ControlBtn
            active={scribeActive}
            onClick={() => setScribeActive((a) => !a)}
            label={scribeActive ? "Pause AI Scribe" : "Start AI Scribe"}
            icon={
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={cn(scribeActive && "animate-pulse")}>
                <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
                <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                <line x1="12" x2="12" y1="19" y2="22" />
                <path d="M8 22h8" />
              </svg>
            }
            tone="info"
          />
        </div>
        <Button onClick={endVisit} variant="danger" size="sm" leadingIcon={<PhoneOff className="h-4 w-4" aria-hidden />}>
          End visit
        </Button>
      </div>
    </GlassPanel>
  );
}

function ControlBtn({
  active,
  onClick,
  label,
  icon,
  tone = "neutral",
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  icon: React.ReactNode;
  tone?: "neutral" | "info";
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      className={cn(
        "inline-flex h-9 w-9 items-center justify-center rounded-full border transition-colors",
        active
          ? tone === "info"
            ? "border-info/40 bg-info/10 text-info"
            : "border-border-strong bg-surface text-text"
          : "border-border bg-surface-muted text-text-subtle hover:text-text",
      )}
    >
      {icon}
    </button>
  );
}

// ---------------------------------------------------------------------------
// HIPAA Phone / Fax portal
// ---------------------------------------------------------------------------

const TRANSCRIPT_SCRIPT = [
  "Hi this is Maya, my SSN is 123-45-6789 and DOB 04/12/1984.",
  "I live at 482 Cedar Lane and my card on file is 4111 1111 1111 1111.",
  "The pain is about 3 out of 10 since starting the 1:1 tincture last night.",
  "Sleep is much better, maybe six and a half hours straight.",
  "Email me a copy at maya.r@example.com if you can — thanks!",
  "We talked about ICD-10 G47.00 for the insomnia and CPT 99213 for the visit.",
];

const FAX_LOG_SEED: Array<{
  id: string;
  direction: "outbound" | "inbound";
  party: string;
  doc: string;
  pages: number;
  status: "sent" | "delivered" | "received" | "queued";
  time: string;
}> = [
  {
    id: "f1",
    direction: "outbound",
    party: "Riverside Imaging",
    doc: "MRI lumbar order",
    pages: 2,
    status: "delivered",
    time: "9:14 AM",
  },
  {
    id: "f2",
    direction: "inbound",
    party: "Highland Pharmacy",
    doc: "Refill confirmation",
    pages: 1,
    status: "received",
    time: "8:51 AM",
  },
  {
    id: "f3",
    direction: "outbound",
    party: "Aetna PA Intake",
    doc: "Prior-auth packet",
    pages: 4,
    status: "sent",
    time: "8:32 AM",
  },
];

function PhoneFaxPortal() {
  const [number, setNumber] = React.useState("(555) 020-4711");
  const [onCall, setOnCall] = React.useState(false);
  const [recording, setRecording] = React.useState(false);
  const [step, setStep] = React.useState(0);
  const [lines, setLines] = React.useState<RedactedTranscriptLine[]>([]);
  const [faxDoc, setFaxDoc] = React.useState<{ name: string; size: string } | null>(null);
  const [faxTo, setFaxTo] = React.useState("");
  const [faxLog, setFaxLog] =
    React.useState<typeof FAX_LOG_SEED>(FAX_LOG_SEED);

  // Drive the simulated transcriber: every ~1.6s push the next scripted
  // line through the redactor and append it to the live transcript.
  React.useEffect(() => {
    if (!recording) return;
    if (step >= TRANSCRIPT_SCRIPT.length) return;
    const id = window.setTimeout(() => {
      const raw = TRANSCRIPT_SCRIPT[step];
      setLines((prev) => [...prev, redactTranscriptLine(raw)]);
      setStep((s) => s + 1);
    }, 1600);
    return () => window.clearTimeout(id);
  }, [recording, step]);

  function startCall() {
    setOnCall(true);
    setRecording(true);
    setStep(0);
    setLines([]);
  }

  function endCall() {
    setOnCall(false);
    setRecording(false);
  }

  function pickFax(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setFaxDoc({ name: f.name, size: `${Math.max(1, Math.round(f.size / 1024))} KB` });
    e.target.value = "";
  }

  function sendFax() {
    if (!faxTo.trim() || !faxDoc) return;
    setFaxLog((prev) => [
      {
        id: `f-${Date.now()}`,
        direction: "outbound",
        party: faxTo,
        doc: faxDoc.name,
        pages: 1,
        status: "queued",
        time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      },
      ...prev,
    ]);
    setFaxTo("");
    setFaxDoc(null);
  }

  const redactedSoFar = lines
    .flatMap((l) => l.redactedCategories)
    .filter((v, i, a) => a.indexOf(v) === i);

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <GlassPanel className="flex flex-col">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/40 px-6 py-4">
          <div className="flex items-center gap-3">
            <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-[color:var(--warning)]/10 text-[color:var(--warning)]">
              <PhoneCall className="h-4 w-4" aria-hidden />
            </span>
            <div>
              <p className="text-sm font-medium text-text">HIPAA Phone Line</p>
              <p className="text-[11px] text-text-subtle">
                Outbound calls auto-record with live PHI redaction. Raw audio never persists.
              </p>
            </div>
          </div>
          <Badge tone={onCall ? "success" : "neutral"} className="gap-1.5">
            <LiveDot tone={onCall ? "success" : "info"} /> {onCall ? "On call" : "Standby"}
          </Badge>
        </div>

        <div className="space-y-3 px-6 py-5">
          <div className="flex items-center gap-2">
            <Input
              value={number}
              onChange={(e) => setNumber(e.target.value)}
              placeholder="Patient phone"
              disabled={onCall}
              className="flex-1"
            />
            {onCall ? (
              <Button
                variant="danger"
                onClick={endCall}
                leadingIcon={<PhoneOff className="h-4 w-4" aria-hidden />}
              >
                End call
              </Button>
            ) : (
              <Button
                onClick={startCall}
                leadingIcon={<PhoneCall className="h-4 w-4" aria-hidden />}
              >
                Dial
              </Button>
            )}
          </div>

          <div className="rounded-xl border border-border bg-surface/70 backdrop-blur-sm">
            <div className="flex items-center justify-between border-b border-border px-4 py-2">
              <p className="text-xs font-medium uppercase tracking-wide text-text-subtle">
                Live transcript · sanitized in real time
              </p>
              <div className="flex items-center gap-1.5">
                {recording && <LiveDot tone="danger" />}
                <span className="text-[11px] text-text-muted">
                  {recording ? "Listening" : "Idle"}
                </span>
              </div>
            </div>
            <div className="max-h-[260px] min-h-[180px] space-y-2 overflow-y-auto px-4 py-3">
              {lines.length === 0 ? (
                <p className="text-sm text-text-subtle">
                  Press Dial to start a simulated call. Personal data (SSN, address, credit
                  card, DOB, email) is masked on the wire before it appears here.
                </p>
              ) : (
                lines.map((l, i) => <TranscriptLine key={i} line={l} />)
              )}
            </div>
            {redactedSoFar.length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5 border-t border-border px-4 py-2">
                <span className="text-[11px] uppercase tracking-wide text-text-subtle">
                  Masked this call:
                </span>
                {redactedSoFar.map((c) => (
                  <Badge key={c} tone="warning">
                    {c.replace("_", " ")}
                  </Badge>
                ))}
              </div>
            )}
          </div>
        </div>
      </GlassPanel>

      <GlassPanel className="flex flex-col">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/40 px-6 py-4">
          <div className="flex items-center gap-3">
            <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-info/10 text-info">
              <Inbox className="h-4 w-4" aria-hidden />
            </span>
            <div>
              <p className="text-sm font-medium text-text">Clinical Fax</p>
              <p className="text-[11px] text-text-subtle">
                TLS-protected SRFax transport · cover sheets autogenerated
              </p>
            </div>
          </div>
          <Badge tone="success" className="gap-1.5">
            <ShieldCheck className="h-3 w-3" aria-hidden /> HIPAA channel
          </Badge>
        </div>

        <div className="space-y-3 px-6 py-5">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_auto_auto]">
            <Input
              value={faxTo}
              onChange={(e) => setFaxTo(e.target.value)}
              placeholder="To fax number or facility"
            />
            <label className="inline-flex h-10 cursor-pointer items-center justify-center gap-2 rounded-md border border-border-strong bg-surface px-3 text-sm text-text-muted hover:bg-surface-muted">
              <Upload className="h-4 w-4" aria-hidden /> {faxDoc ? "Replace" : "Choose file"}
              <input type="file" className="sr-only" onChange={pickFax} />
            </label>
            <Button onClick={sendFax} disabled={!faxTo.trim() || !faxDoc}>
              Send fax
            </Button>
          </div>

          {faxDoc && (
            <div className="flex items-center justify-between rounded-md border border-border bg-surface px-3 py-2 text-xs">
              <span className="flex items-center gap-2 text-text-muted">
                <FileText className="h-3 w-3" aria-hidden /> {faxDoc.name} · {faxDoc.size}
              </span>
              <button
                type="button"
                onClick={() => setFaxDoc(null)}
                className="text-text-subtle hover:text-text"
              >
                remove
              </button>
            </div>
          )}

          <div className="rounded-xl border border-border bg-surface/70 backdrop-blur-sm">
            <div className="border-b border-border px-4 py-2 text-xs font-medium uppercase tracking-wide text-text-subtle">
              Transmission log
            </div>
            <ul className="divide-y divide-border">
              {faxLog.map((row) => (
                <li
                  key={row.id}
                  className="flex items-center justify-between gap-3 px-4 py-2 text-sm"
                >
                  <div className="min-w-0">
                    <p className="truncate text-text">
                      {row.direction === "outbound" ? "→" : "←"} {row.party} ·{" "}
                      <span className="text-text-muted">{row.doc}</span>
                    </p>
                    <p className="text-[11px] text-text-subtle">
                      {row.pages} pages · {row.time}
                    </p>
                  </div>
                  <Badge
                    tone={
                      row.status === "delivered" || row.status === "received"
                        ? "success"
                        : row.status === "queued"
                          ? "info"
                          : "neutral"
                    }
                  >
                    {row.status}
                  </Badge>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </GlassPanel>
    </div>
  );
}

function TranscriptLine({ line }: { line: RedactedTranscriptLine }) {
  return (
    <div className="flex items-start gap-2 text-sm leading-relaxed">
      <CircleDot
        className={cn(
          "mt-1 h-3 w-3 shrink-0",
          line.isClinicallyRelevant ? "text-accent" : "text-text-subtle",
        )}
        aria-hidden
      />
      <div className="min-w-0">
        <p className="text-text">{line.redacted}</p>
        {(line.redactedCategories.length > 0 ||
          line.preservedClinicalTerms.length > 0 ||
          line.preservedBillingCodes.length > 0) && (
          <div className="mt-1 flex flex-wrap items-center gap-1">
            {line.preservedClinicalTerms.slice(0, 4).map((t) => (
              <Badge key={`c-${t}`} tone="accent">
                {t}
              </Badge>
            ))}
            {line.preservedBillingCodes.map((b) => (
              <Badge key={`b-${b.code}`} tone="info">
                {b.kind.toUpperCase()} {b.code}
              </Badge>
            ))}
            {line.redactedCategories.map((c) => (
              <Badge key={`r-${c}`} tone="warning">
                masked {c.replace("_", " ")}
              </Badge>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Root workspace — tabbed glassmorphism container
// ---------------------------------------------------------------------------

export function OverlayWorkspace() {
  return (
    <section className="relative mb-10">
      <div className="pointer-events-none absolute -inset-x-4 -top-6 -bottom-2 -z-10">
        <div className="absolute left-1/4 top-0 h-48 w-48 rounded-full bg-emerald-200/40 blur-3xl" />
        <div className="absolute right-10 top-12 h-60 w-60 rounded-full bg-amber-100/50 blur-3xl" />
      </div>

      <Tabs defaultValue="messenger" variant="pill" urlParam="overlay">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <SectionHeading
            title="End-to-end overlay"
            description="One pane for encrypted text, telehealth video, and HIPAA-clean phone + fax — all simulated locally."
            status={
              <Badge tone="accent" className="gap-1.5">
                <ShieldCheck className="h-3 w-3" aria-hidden /> Zero-knowledge session
              </Badge>
            }
          />
          <TabList aria-label="Overlay channels" className="rounded-lg bg-surface/60 p-1 backdrop-blur-sm">
            <Trigger value="messenger">
              <Lock className="h-3.5 w-3.5" aria-hidden /> Messenger
            </Trigger>
            <Trigger value="video">
              <Video className="h-3.5 w-3.5" aria-hidden /> Telehealth
            </Trigger>
            <Trigger value="phonefax">
              <PhoneCall className="h-3.5 w-3.5" aria-hidden /> Phone & Fax
            </Trigger>
          </TabList>
        </div>

        <Panel value="messenger" className="pt-2">
          <EncryptedMessenger />
        </Panel>
        <Panel value="video" lazy className="pt-2">
          <TelehealthVideo />
        </Panel>
        <Panel value="phonefax" lazy className="pt-2">
          <PhoneFaxPortal />
        </Panel>
      </Tabs>
    </section>
  );
}
