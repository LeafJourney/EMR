"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { cn } from "@/lib/utils/cn";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Eyebrow, LeafSprig, EditorialRule } from "@/components/ui/ornament";
import type { TelehealthChecklistItem } from "@/lib/domain/telehealth";
import { DailyVideoFrame, type ConnectionState } from "@/components/telehealth/DailyVideoFrame";
import {
  startTelehealthVisit,
  endTelehealthVisit,
  type TelehealthVisitResult,
} from "./actions";

// ─── Types ──────────────────────────────────────────────

interface PatientInfo {
  id: string;
  firstName: string;
  lastName: string;
  presentingConcerns: string | null;
  medications: { name: string; dosage: string | null }[];
}

interface VideoRoomProps {
  patient: PatientInfo;
  roomUrl: string;
  encounterId: string;
  checklist: TelehealthChecklistItem[];
  providerName: string;
}

type VisitPhase = "pre_visit" | "in_progress" | "ended";

// ─── Timer Hook ─────────────────────────────────────────

function useTimer(running: boolean) {
  const [seconds, setSeconds] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (running) {
      intervalRef.current = setInterval(() => {
        setSeconds((s) => s + 1);
      }, 1000);
    } else if (intervalRef.current) {
      clearInterval(intervalRef.current);
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [running]);

  const mm = String(Math.floor(seconds / 60)).padStart(2, "0");
  const ss = String(seconds % 60).padStart(2, "0");

  return { seconds, formatted: `${mm}:${ss}` };
}

// ─── Main Component ─────────────────────────────────────

export function VideoRoom({
  patient,
  roomUrl,
  encounterId,
  checklist,
  providerName,
}: VideoRoomProps) {
  const params = useParams<{ id: string }>();
  const router = useRouter();

  const [phase, setPhase] = useState<VisitPhase>("pre_visit");
  const [checkedItems, setCheckedItems] = useState<Set<string>>(new Set());
  const [muted, setMuted] = useState(false);
  const [cameraOff, setCameraOff] = useState(false);
  const [screenSharing, setScreenSharing] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [visitData, setVisitData] = useState<TelehealthVisitResult | null>(null);
  const [startingVisit, setStartingVisit] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);
  const [connection, setConnection] = useState<ConnectionState>("loading");
  const [participantCount, setParticipantCount] = useState(1);
  const [scribeActive, setScribeActive] = useState(false);

  const timer = useTimer(phase === "in_progress" && connection === "joined");

  const toggleCheck = useCallback((id: string) => {
    setCheckedItems((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const requiredComplete = checklist
    .filter((c) => c.required)
    .every((c) => checkedItems.has(c.id));

  const startVisit = useCallback(async () => {
    setStartingVisit(true);
    try {
      const result = await startTelehealthVisit(patient.id, encounterId);
      setVisitData(result);
      setPhase("in_progress");
    } catch (err) {
      console.error("Failed to start telehealth visit:", err);
      alert("Failed to create video room. Please try again.");
    } finally {
      setStartingVisit(false);
    }
  }, [patient.id, encounterId]);

  const endVisit = useCallback(async () => {
    setPhase("ended");
    if (visitData?.room.name) {
      try {
        await endTelehealthVisit(visitData.room.name);
      } catch {
        // Best-effort cleanup
      }
    }
  }, [visitData]);

  const copyPatientLink = useCallback(() => {
    if (!visitData?.patientJoinUrl) return;
    navigator.clipboard.writeText(visitData.patientJoinUrl);
    setLinkCopied(true);
    setTimeout(() => setLinkCopied(false), 2000);
  }, [visitData]);

  const goToNotes = useCallback(() => {
    router.push(`/clinic/patients/${params.id}/notes`);
  }, [router, params.id]);

  // ─── Pre-visit checklist ──────────────────────────

  if (phase === "pre_visit") {
    return (
      <div>
        <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-5 mb-10">
          <div className="max-w-2xl">
            <Eyebrow className="mb-3">Telehealth</Eyebrow>
            <h1 className="font-display text-3xl md:text-4xl text-text tracking-tight leading-[1.1]">
              Pre-visit checklist
            </h1>
            <p className="text-[15px] text-text-muted mt-3 leading-relaxed">
              Confirm readiness before starting the video visit with{" "}
              <span className="font-medium text-text">
                {patient.firstName} {patient.lastName}
              </span>
              .
            </p>
          </div>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => router.push(`/clinic/patients/${params.id}`)}
          >
            Back to chart
          </Button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          <Card tone="raised">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <LeafSprig size={16} className="text-accent" />
                System check
              </CardTitle>
              <CardDescription>
                Complete all required items before starting the visit.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="space-y-3">
                {checklist.map((item) => (
                  <li key={item.id}>
                    <button
                      type="button"
                      onClick={() => toggleCheck(item.id)}
                      className={cn(
                        "w-full text-left flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-all duration-200",
                        checkedItems.has(item.id)
                          ? "bg-accent/5 border-accent/30"
                          : "bg-surface border-border hover:bg-surface-muted",
                      )}
                    >
                      <div className={cn(
                        "mt-0.5 flex h-5 w-5 items-center justify-center rounded border transition-colors",
                        checkedItems.has(item.id) ? "border-accent bg-accent text-white" : "border-border-strong text-transparent"
                      )}>
                        <LeafSprig size={12} className="text-current" />
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-text">
                            {item.label}
                          </span>
                          {item.required && (
                            <Badge tone="warning" className="text-[9px]">
                              Required
                            </Badge>
                          )}
                        </div>
                        <p className="text-xs text-text-muted mt-0.5">
                          {item.description}
                        </p>
                      </div>
                      </button>
                    </li>
                ))}
              </ul>
            </CardContent>
            <div className="px-6 pb-6">
              <Button
                onClick={startVisit}
                disabled={!requiredComplete || startingVisit}
                size="lg"
                className="w-full"
              >
                {startingVisit ? "Creating video room..." : "Start video visit"}
              </Button>
              {!requiredComplete && (
                <p className="text-xs text-text-muted text-center mt-2">
                  Complete all required items to enable the visit
                </p>
              )}
            </div>
          </Card>

          {/* Patient quick view */}
          <Card tone="raised">
            <CardHeader>
              <CardTitle className="text-base">Patient overview</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-5">
                <div>
                  <p className="text-[10px] text-text-subtle uppercase tracking-wider mb-1">
                    Patient
                  </p>
                  <p className="text-lg font-display text-text">
                    {patient.firstName} {patient.lastName}
                  </p>
                </div>
                <div>
                  <p className="text-[10px] text-text-subtle uppercase tracking-wider mb-1">
                    Presenting concerns
                  </p>
                  <p className="text-sm text-text-muted leading-relaxed">
                    {patient.presentingConcerns || "No concerns documented."}
                  </p>
                </div>
                <div>
                  <p className="text-[10px] text-text-subtle uppercase tracking-wider mb-2">
                    Current medications
                  </p>
                  {patient.medications.length > 0 ? (
                    <ul className="space-y-1.5">
                      {patient.medications.map((med, i) => (
                        <li
                          key={i}
                          className="flex items-center gap-2 text-sm"
                        >
                          <span className="h-1.5 w-1.5 rounded-full bg-accent shrink-0" />
                          <span className="text-text">{med.name}</span>
                          {med.dosage && (
                            <span className="text-text-muted text-xs">
                              {med.dosage}
                            </span>
                          )}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-sm text-text-muted">
                      No active medications.
                    </p>
                  )}
                </div>
                <div>
                  <p className="text-[10px] text-text-subtle uppercase tracking-wider mb-1">
                    Room URL
                  </p>
                  <p className="text-xs font-mono text-accent break-all">
                    {visitData?.room.url ?? roomUrl}
                  </p>
                </div>

                {visitData && (
                  <div className="mt-4 pt-4 border-t border-border space-y-3">
                    <div>
                      <p className="text-[10px] text-text-subtle uppercase tracking-wider mb-1">
                        Provider join URL
                      </p>
                      <a
                        href={visitData.providerJoinUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs font-mono text-accent break-all hover:underline"
                      >
                        {visitData.providerJoinUrl}
                      </a>
                    </div>
                    <Button
                      onClick={copyPatientLink}
                      variant="secondary"
                      size="sm"
                      className="w-full"
                    >
                      {linkCopied ? "Copied!" : "Copy patient link"}
                    </Button>
                    <p className="text-[10px] text-text-subtle text-center">
                      Room expires {new Date(visitData.room.expiresAt).toLocaleTimeString()}
                    </p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  // ─── Visit ended ──────────────────────────────────

  if (phase === "ended") {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Card tone="raised" className="max-w-lg w-full">
          <CardContent className="py-12 text-center">
            <div className="w-16 h-16 rounded-full bg-accent/10 mx-auto mb-6 flex items-center justify-center">
              <svg
                width="32"
                height="32"
                viewBox="0 0 32 32"
                fill="none"
                className="text-accent"
              >
                <path
                  d="M11 16l3 3 7-7"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <circle
                  cx="16"
                  cy="16"
                  r="13"
                  stroke="currentColor"
                  strokeWidth="1.5"
                />
              </svg>
            </div>
            <h2 className="font-display text-2xl text-text mb-2">
              Visit complete
            </h2>
            <p className="text-text-muted mb-2">
              Telehealth visit with{" "}
              <span className="font-medium text-text">
                {patient.firstName} {patient.lastName}
              </span>
            </p>
            <p className="text-sm text-text-muted mb-8">
              Duration: {timer.formatted}
            </p>
            <div className="flex items-center justify-center gap-3">
              <Button onClick={goToNotes} size="lg">
                Write visit notes
              </Button>
              <Button
                variant="secondary"
                size="md"
                onClick={() => router.push(`/clinic/patients/${params.id}`)}
              >
                Back to chart
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // ─── Video room (in progress) ─────────────────────

  return (
    <div>
      {/* Compact header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Eyebrow>Telehealth</Eyebrow>
          {connection === "joined" ? (
            <Badge tone="danger" className="animate-pulse text-xs px-2.5">
              LIVE
            </Badge>
          ) : (
            <Badge tone="info" className="text-xs px-2.5">
              {connection === "error" ? "Error" : "Connecting"}
            </Badge>
          )}
          <span className="font-mono text-lg text-text tabular-nums">
            {timer.formatted}
          </span>
          <Badge tone="neutral" className="text-[10px]">
            {participantCount} {participantCount === 1 ? "participant" : "participants"}
          </Badge>
        </div>
        <div className="flex items-center gap-2">
          {scribeActive && (
            <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-accent/10 border border-accent/20 text-xs font-medium text-accent animate-pulse mr-2">
              <span className="h-2 w-2 rounded-full bg-accent" />
              AI Scribe Active
            </div>
          )}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setSidebarOpen(!sidebarOpen)}
          >
            {sidebarOpen ? "Hide sidebar" : "Show sidebar"}
          </Button>
        </div>
      </div>

      <div className="flex gap-6">
        {/* Main video area */}
        <div className="flex-1 min-w-0">
          {/* Video frame — real Daily.co session */}
          <Card
            tone="raised"
            className="relative overflow-hidden mb-4 aspect-video"
          >
            {visitData ? (
              <DailyVideoFrame
                roomUrl={visitData.room.url}
                token={visitData.providerToken.token}
                userName={providerName}
                muted={muted}
                cameraOff={cameraOff}
                screenSharing={screenSharing}
                onConnectionStateChange={setConnection}
                onParticipantCountChange={setParticipantCount}
              />
            ) : (
              <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900">
                <p className="text-white/60 text-sm">Preparing video room…</p>
              </div>
            )}
          </Card>

          {/* Controls bar */}
          <Card tone="raised">
            <CardContent className="py-3">
              <div className="flex items-center justify-center gap-3">
                <button
                  onClick={() => setMuted(!muted)}
                  className={cn(
                    "h-12 w-12 rounded-full flex items-center justify-center transition-all duration-200",
                    muted
                      ? "bg-danger text-white"
                      : "bg-surface-muted text-text hover:bg-surface-muted/80",
                  )}
                  title={muted ? "Unmute" : "Mute"}
                >
                  <svg
                    width="20"
                    height="20"
                    viewBox="0 0 20 20"
                    fill="none"
                  >
                    {muted ? (
                      <>
                        <path
                          d="M10 1v11M6 5v4a4 4 0 008 0V5"
                          stroke="currentColor"
                          strokeWidth="1.5"
                          strokeLinecap="round"
                        />
                        <path
                          d="M3 3l14 14"
                          stroke="currentColor"
                          strokeWidth="1.5"
                          strokeLinecap="round"
                        />
                        <path
                          d="M3 11a7 7 0 0014 0M10 18v2"
                          stroke="currentColor"
                          strokeWidth="1.5"
                          strokeLinecap="round"
                        />
                      </>
                    ) : (
                      <>
                        <path
                          d="M10 1v11M6 5v4a4 4 0 008 0V5"
                          stroke="currentColor"
                          strokeWidth="1.5"
                          strokeLinecap="round"
                        />
                        <path
                          d="M3 11a7 7 0 0014 0M10 18v2"
                          stroke="currentColor"
                          strokeWidth="1.5"
                          strokeLinecap="round"
                        />
                      </>
                    )}
                  </svg>
                </button>

                <button
                  onClick={() => setCameraOff(!cameraOff)}
                  className={cn(
                    "h-12 w-12 rounded-full flex items-center justify-center transition-all duration-200",
                    cameraOff
                      ? "bg-danger text-white"
                      : "bg-surface-muted text-text hover:bg-surface-muted/80",
                  )}
                  title={cameraOff ? "Turn camera on" : "Turn camera off"}
                >
                  <svg
                    width="20"
                    height="20"
                    viewBox="0 0 20 20"
                    fill="none"
                  >
                    <rect
                      x="2"
                      y="5"
                      width="12"
                      height="10"
                      rx="2"
                      stroke="currentColor"
                      strokeWidth="1.5"
                    />
                    <path
                      d="M14 9l4-2v6l-4-2"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      strokeLinejoin="round"
                    />
                    {cameraOff && (
                      <path
                        d="M2 3l16 14"
                        stroke="currentColor"
                        strokeWidth="1.5"
                        strokeLinecap="round"
                      />
                    )}
                  </svg>
                </button>

                <button
                  onClick={() => setScreenSharing(!screenSharing)}
                  className={cn(
                    "h-12 w-12 rounded-full flex items-center justify-center transition-all duration-200",
                    screenSharing
                      ? "bg-accent text-white"
                      : "bg-surface-muted text-text hover:bg-surface-muted/80",
                  )}
                  title={
                    screenSharing ? "Stop sharing" : "Share screen"
                  }
                >
                  <svg
                    width="20"
                    height="20"
                    viewBox="0 0 20 20"
                    fill="none"
                  >
                    <rect
                      x="2"
                      y="3"
                      width="16"
                      height="11"
                      rx="2"
                      stroke="currentColor"
                      strokeWidth="1.5"
                    />
                    <path
                      d="M7 17h6M10 14v3"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                    />
                  </svg>
                </button>

                <button
                  onClick={() => setScribeActive(!scribeActive)}
                  className={cn(
                    "h-12 w-12 rounded-full flex items-center justify-center transition-all duration-200",
                    scribeActive
                      ? "bg-accent text-white shadow-[0_0_15px_rgba(var(--accent-rgb),0.5)]"
                      : "bg-surface-muted text-text hover:bg-surface-muted/80",
                  )}
                  title={scribeActive ? "Pause AI Scribe" : "Start AI Scribe"}
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
                    <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                    <line x1="12" x2="12" y1="19" y2="22" />
                    <path d="M8 22h8" />
                  </svg>
                </button>

                <div className="w-px h-8 bg-border mx-2" />

                <button
                  onClick={endVisit}
                  className="h-12 px-6 rounded-full bg-danger text-white font-medium text-sm hover:brightness-110 transition-all duration-200 flex items-center gap-2"
                >
                  <svg
                    width="18"
                    height="18"
                    viewBox="0 0 18 18"
                    fill="none"
                  >
                    <path
                      d="M1 7.5C1 4 4 2 9 2s8 2 8 5.5"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                    />
                    <path
                      d="M1 7.5l2 3.5h3l1-3.5M17 7.5l-2 3.5h-3l-1-3.5"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                  End visit
                </button>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Sidebar: patient chart quick-view */}
        {sidebarOpen && (
          <div className="w-80 shrink-0 space-y-4">
            <Card tone="raised">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm flex items-center gap-2">
                  <LeafSprig size={14} className="text-accent" />
                  Patient chart
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-5">
                  <div>
                    <p className="text-[10px] text-text-subtle uppercase tracking-wider mb-1">
                      Patient
                    </p>
                    <p className="text-sm font-medium text-text">
                      {patient.firstName} {patient.lastName}
                    </p>
                  </div>

                  <EditorialRule />

                  <div>
                    <p className="text-[10px] text-text-subtle uppercase tracking-wider mb-2">
                      Presenting concerns
                    </p>
                    <p className="text-sm text-text-muted leading-relaxed">
                      {patient.presentingConcerns ||
                        "No concerns documented."}
                    </p>
                  </div>

                  <EditorialRule />

                  <div>
                    <p className="text-[10px] text-text-subtle uppercase tracking-wider mb-2">
                      Current medications
                    </p>
                    {patient.medications.length > 0 ? (
                      <ul className="space-y-2">
                        {patient.medications.map((med, i) => (
                          <li
                            key={i}
                            className="flex items-center gap-2 text-sm"
                          >
                            <span className="h-1.5 w-1.5 rounded-full bg-accent shrink-0" />
                            <div>
                              <span className="text-text">{med.name}</span>
                              {med.dosage && (
                                <span className="text-text-muted text-xs ml-1">
                                  ({med.dosage})
                                </span>
                              )}
                            </div>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-sm text-text-muted">
                        No active medications.
                      </p>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card tone="raised">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">Visit info</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3 text-sm">
                  <div className="flex justify-between">
                    <span className="text-text-muted">Duration</span>
                    <span className="font-mono text-text tabular-nums">
                      {timer.formatted}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-text-muted">Modality</span>
                    <Badge tone="accent" className="text-[9px]">
                      Video
                    </Badge>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-text-muted">Provider</span>
                    <span className="text-text text-xs">{providerName}</span>
                  </div>
                  {visitData && (
                    <>
                      <EditorialRule />
                      <div>
                        <p className="text-[10px] text-text-subtle uppercase tracking-wider mb-1.5">
                          Room
                        </p>
                        <p className="text-xs font-mono text-accent break-all">
                          {visitData.room.name}
                        </p>
                      </div>
                      <Button
                        onClick={copyPatientLink}
                        variant="secondary"
                        size="sm"
                        className="w-full"
                      >
                        {linkCopied ? "Copied!" : "Copy patient link"}
                      </Button>
                    </>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}
