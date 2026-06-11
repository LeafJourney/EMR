"use client";

import { useState, useTransition, useEffect, useRef } from "react";
import Link from "next/link";
import { generateBriefing, startVisitWithBriefing, type BriefingResult, type BriefingStep } from "./actions";
import { Button } from "@/components/ui/button";
import { Eyebrow, LeafSprig } from "@/components/ui/ornament";

// ---------------------------------------------------------------------------
// Liquid glass aesthetic — frosted surfaces, luminous depth, refined motion.
// ---------------------------------------------------------------------------

function GlassCard({
  children,
  className = "",
  tint = "neutral",
}: {
  children: React.ReactNode;
  className?: string;
  // accent / positive = green, caution = amber/yellow, warning = red
  tint?: "neutral" | "accent" | "positive" | "caution" | "warning";
}) {
  const gradient =
    tint === "accent" || tint === "positive"
      ? "linear-gradient(135deg, rgba(95,165,120,0.12), rgba(255,255,255,0.55))"
      : tint === "caution"
        ? "linear-gradient(135deg, rgba(184,120,47,0.13), rgba(255,255,255,0.55))"
        : tint === "warning"
          ? "linear-gradient(135deg, rgba(200,90,62,0.13), rgba(255,255,255,0.55))"
          : "linear-gradient(135deg, rgba(255,255,255,0.7), rgba(255,255,255,0.35))";

  return (
    <div
      className={`relative rounded-[24px] border overflow-hidden ${className}`}
      style={{
        background: gradient,
        backdropFilter: "blur(24px) saturate(180%)",
        WebkitBackdropFilter: "blur(24px) saturate(180%)",
        borderColor: "rgba(255,255,255,0.5)",
        boxShadow:
          "0 20px 60px -20px rgba(30, 60, 45, 0.15), 0 0 0 1px rgba(255,255,255,0.15) inset",
      }}
    >
      {/* Inner highlight */}
      <div
        aria-hidden="true"
        className="absolute inset-0 rounded-[24px] pointer-events-none"
        style={{
          background:
            "linear-gradient(180deg, rgba(255,255,255,0.4) 0%, transparent 30%, transparent 70%, rgba(255,255,255,0.08) 100%)",
          mixBlendMode: "overlay",
        }}
      />
      <div className="relative">{children}</div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step row with liquid glass treatment
// ---------------------------------------------------------------------------

function StepRow({ step }: { step: BriefingStep }) {
  const isRunning = step.status === "running";
  const isDone = step.status === "done";
  const isError = step.status === "error";
  const isPending = step.status === "pending";

  return (
    <div
      className={`group flex items-center gap-4 px-5 py-3.5 rounded-2xl border transition-all duration-500 ${
        isRunning
          ? "border-white/70 shadow-sm scale-[1.005]"
          : isDone
            ? "border-white/40"
            : isError
              ? "border-[rgba(200,70,60,0.3)]"
              : "border-transparent"
      }`}
      style={{
        background: isRunning
          ? "linear-gradient(135deg, rgba(95,165,120,0.12), rgba(255,255,255,0.6))"
          : isDone
            ? "rgba(255,255,255,0.35)"
            : isError
              ? "rgba(200,70,60,0.06)"
              : "transparent",
        backdropFilter: isRunning || isDone ? "blur(12px)" : "none",
        WebkitBackdropFilter: isRunning || isDone ? "blur(12px)" : "none",
        opacity: isPending ? 0.35 : 1,
      }}
    >
      {/* Status dot */}
      <div className="shrink-0 relative w-5 h-5">
        {isRunning ? (
          <>
            <div className="absolute inset-0 rounded-full border border-accent/25" />
            <div
              className="absolute inset-0 rounded-full border-2 border-transparent border-t-accent animate-spin"
              style={{ animationDuration: "0.9s" }}
            />
          </>
        ) : isDone ? (
          <div className="absolute inset-0 rounded-full bg-gradient-to-br from-accent to-accent-strong flex items-center justify-center shadow-sm">
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
              <path
                d="M2 5L4 7L8 3"
                stroke="white"
                strokeWidth="1.6"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>
        ) : isError ? (
          <div className="absolute inset-0 rounded-full bg-gradient-to-br from-[#C85040] to-[#A03B2E] flex items-center justify-center shadow-sm">
            <span className="text-[9px] font-bold text-white">!</span>
          </div>
        ) : (
          <div className="absolute inset-0 rounded-full border border-text-subtle/25" />
        )}
      </div>

      {/* Label */}
      <div className="flex-1 min-w-0 flex items-center justify-between gap-3">
        <p
          className={`text-sm font-medium truncate transition-colors ${
            isRunning
              ? "text-text"
              : isDone
                ? "text-text"
                : isError
                  ? "text-[#C85040]"
                  : "text-text-subtle"
          }`}
        >
          {step.label}
        </p>

        {/* Duration or status glyph */}
        <span
          className={`shrink-0 text-[11px] font-mono tabular-nums transition-colors ${
            isRunning
              ? "text-accent"
              : isDone
                ? "text-text-subtle"
                : "text-text-subtle/50"
          }`}
        >
          {isRunning ? (
            <span className="animate-pulse">processing</span>
          ) : isDone && step.durationMs != null ? (
            `${(step.durationMs / 1000).toFixed(1)}s`
          ) : isError ? (
            "failed"
          ) : (
            "—"
          )}
        </span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Briefing section card (for intelligence details)
// ---------------------------------------------------------------------------

// Three-tier color stratification per Dr. Patel's directive:
//   RED   ("critical")  = top priority / urgent
//   YELLOW("watch")     = watch / consider for future / side-effects
//   GREEN ("positive")  = positives + "continue" (keep same meds/labs/lifestyle)
type SectionTier = "critical" | "watch" | "positive";

const TIER_STYLE: Record<
  SectionTier,
  {
    tint: "warning" | "caution" | "positive";
    bar: string;
    label: string | null;
    chip: string;
  }
> = {
  critical: {
    tint: "warning",
    bar: "linear-gradient(180deg, #D85A3E, #B33F28)",
    label: "Priority",
    chip: "bg-[rgba(200,70,60,0.12)] text-[#B33F28]",
  },
  watch: {
    tint: "caution",
    bar: "linear-gradient(180deg, var(--highlight), var(--highlight-hover))",
    label: "Watch",
    chip: "bg-[var(--highlight-soft)] text-[color:var(--highlight-hover)]",
  },
  positive: {
    tint: "positive",
    bar: "linear-gradient(180deg, var(--accent), var(--accent-strong))",
    label: "Continue",
    chip: "bg-[var(--accent-soft)] text-[color:var(--accent)]",
  },
};

// "Symptom trends" type sections get colored by their *direction*, not their
// raw priority: green when improving, yellow/red when worsening (severity by
// how negative). We infer direction from whatever language the section already
// carries (title + content), since the briefing emits trend sections like
// "<metric> improving" / risk-style "worsening" copy.
const SIDE_EFFECT_RE = /side[\s-]?effect|adverse|tolerab/i;
const SYMPTOM_TREND_RE = /symptom|trend|outcome|improv|worsen|increas|decreas|trending/i;
const SEVERE_WORSEN_RE =
  /severe|sharp|rapid|markedly|significant|alarm|urgent|spik|escalat|much worse|considerably/i;

function inferTrendDirection(
  text: string,
): "improving" | "worsening" | "severely-worsening" | null {
  const t = text.toLowerCase();
  const improving =
    /improv|better|trending down|decreas(?:ing|ed)|lower(?:ing|ed)?|down over|reduc|relief|resolv|stabiliz/.test(
      t,
    );
  const worsening =
    /worsen|worse|trending up|increas(?:ing|ed)|higher|elevat|spik|flare|deteriorat|escalat/.test(
      t,
    );
  // When the copy reads positively (improving) and isn't also flagging a rise,
  // treat as improving — green.
  if (improving && !worsening) return "improving";
  if (worsening) {
    return SEVERE_WORSEN_RE.test(t) ? "severely-worsening" : "worsening";
  }
  return null;
}

function resolveTier(section: {
  title: string;
  content: string;
  priority: string;
}): SectionTier {
  const haystack = `${section.title} ${section.content}`;

  // Symptom-trend sections: color dynamically by direction.
  if (SYMPTOM_TREND_RE.test(haystack)) {
    const dir = inferTrendDirection(haystack);
    if (dir === "improving") return "positive";
    if (dir === "severely-worsening") return "critical";
    if (dir === "worsening") {
      // High-priority worsening reads as critical (red); otherwise watch.
      return section.priority === "high" ? "critical" : "watch";
    }
    // Direction unclear — fall through to the priority mapping below.
  }

  // Side-effect sections are always the "watch / consider" yellow tier.
  if (SIDE_EFFECT_RE.test(haystack)) return "watch";

  // Default priority stratification:
  //   high  -> red, medium -> yellow (watch), low -> green (positive/continue).
  if (section.priority === "high") return "critical";
  if (section.priority === "medium") return "watch";
  return "positive";
}

function BriefingSection({
  section,
}: {
  section: {
    title: string;
    content: string;
    priority: string;
    icon: string;
  };
}) {
  const tier = resolveTier(section);
  const style = TIER_STYLE[tier];

  return (
    <GlassCard tint={style.tint} className="px-5 py-4">
      <div className="flex items-start gap-4">
        {/* Tier indicator — red = priority, yellow = watch, green = continue */}
        <div
          className="shrink-0 w-1 self-stretch rounded-full"
          style={{ background: style.bar }}
        />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <p className="text-sm font-medium text-text">{section.title}</p>
            {style.label && (
              <span
                className={`text-[9px] font-medium uppercase tracking-[0.14em] px-2 py-0.5 rounded-full ${style.chip}`}
              >
                {style.label}
              </span>
            )}
          </div>
          <p className="text-[13px] text-text-muted leading-relaxed">
            {section.content}
          </p>
        </div>
      </div>
    </GlassCard>
  );
}

// ---------------------------------------------------------------------------
// Main console component
// ---------------------------------------------------------------------------

export function BriefingConsole({
  patientId,
  patientName,
}: {
  patientId: string;
  patientName: string;
}) {
  const firstName = patientName.trim().split(/\s+/)[0] || patientName;
  const [result, setResult] = useState<BriefingResult | null>(null);
  const [isPending, startTransition] = useTransition();
  const [isStartingVisit, startStartVisitTransition] = useTransition();
  const [simulatedSteps, setSimulatedSteps] = useState<BriefingStep[]>([]);
  const [phase, setPhase] = useState<"idle" | "running" | "done">("idle");
  const [riskFlagsExpanded, setRiskFlagsExpanded] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Simulated step progression for UX
  useEffect(() => {
    if (phase === "running" && simulatedSteps.length === 0) {
      const steps: BriefingStep[] = [
        { step: 1, label: "Loading patient profile and chart summary", status: "pending" },
        { step: 2, label: "Reviewing recent encounters and notes", status: "pending" },
        { step: 3, label: "Analyzing outcome trends (last 30 days)", status: "pending" },
        { step: 4, label: "Checking medications and dosing adherence", status: "pending" },
        { step: 5, label: "Scanning recent messages and assessments", status: "pending" },
        { step: 6, label: "Generating intelligence briefing", status: "pending" },
      ];
      setSimulatedSteps(steps);

      let current = 0;
      intervalRef.current = setInterval(() => {
        current++;
        setSimulatedSteps((prev) =>
          prev.map((s, i) => ({
            ...s,
            status:
              i < current
                ? "done"
                : i === current
                  ? "running"
                  : "pending",
            durationMs: i < current ? (i + 1) * 400 + Math.random() * 300 : undefined,
          })),
        );
        if (current >= steps.length) {
          if (intervalRef.current) clearInterval(intervalRef.current);
        }
      }, 600);
    }

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [phase, simulatedSteps.length]);

  function handleGenerate() {
    setPhase("running");
    setSimulatedSteps([]);
    startTransition(async () => {
      const res = await generateBriefing(patientId);
      setResult(res);
      if (res.steps.length > 0) {
        setSimulatedSteps(res.steps);
      }
      setPhase("done");
      if (intervalRef.current) clearInterval(intervalRef.current);
    });
  }

  const displaySteps =
    phase === "done" && result?.steps?.length
      ? result.steps
      : simulatedSteps;

  return (
    <div className="relative space-y-6">
      {/* Ambient light wash behind the whole console */}
      <div
        aria-hidden="true"
        className="absolute -inset-x-20 -inset-y-10 pointer-events-none -z-10"
        style={{
          background:
            "radial-gradient(ellipse 50% 40% at 30% 10%, rgba(95, 165, 120, 0.18), transparent 70%)," +
            "radial-gradient(ellipse 60% 60% at 80% 90%, rgba(222, 184, 135, 0.12), transparent 70%)",
          filter: "blur(40px)",
        }}
      />

      {/* ── Agent console card ─────────────────────────────── */}
      <GlassCard>
        {/* Header */}
        <div className="px-7 pt-6 pb-5 flex items-center justify-between">
          <div className="flex items-center gap-4">
            {/* Agent mark */}
            <div className="relative h-11 w-11 rounded-2xl overflow-hidden shadow-md">
              <div
                className="absolute inset-0"
                style={{
                  background:
                    "linear-gradient(135deg, var(--accent) 0%, var(--accent-strong) 100%)",
                }}
              />
              <div
                aria-hidden="true"
                className="absolute inset-0"
                style={{
                  background:
                    "linear-gradient(180deg, rgba(255,255,255,0.4) 0%, transparent 50%)",
                }}
              />
              <div className="relative flex items-center justify-center h-full">
                <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                  <path
                    d="M10 2C13 5 13.5 10 10 17C6.5 10 7 5 10 2Z"
                    stroke="white"
                    strokeWidth="1.3"
                    strokeLinejoin="round"
                  />
                  <path
                    d="M10 4L10 15"
                    stroke="white"
                    strokeWidth="0.8"
                    strokeLinecap="round"
                    opacity="0.7"
                  />
                </svg>
              </div>
            </div>
            <div>
              <p className="text-[10px] font-medium uppercase tracking-[0.16em] text-accent">
                Clinical intelligence
              </p>
              <h2 className="font-display text-xl text-text tracking-tight leading-tight mt-0.5">
                Pre-Visit Briefing
              </h2>
            </div>
          </div>

          {/* Status pill */}
          <div
            className="flex items-center gap-2 px-3 py-1.5 rounded-full border border-white/60"
            style={{
              background: "rgba(255,255,255,0.55)",
              backdropFilter: "blur(12px)",
              WebkitBackdropFilter: "blur(12px)",
            }}
          >
            {phase === "idle" && (
              <>
                <div className="h-1.5 w-1.5 rounded-full bg-text-subtle/50" />
                <span className="text-[10px] font-medium uppercase tracking-[0.14em] text-text-subtle">
                  Standby
                </span>
              </>
            )}
            {phase === "running" && (
              <>
                <div className="relative">
                  <div className="h-1.5 w-1.5 rounded-full bg-accent" />
                  <div className="absolute inset-0 h-1.5 w-1.5 rounded-full bg-accent animate-ping opacity-60" />
                </div>
                <span className="text-[10px] font-medium uppercase tracking-[0.14em] text-accent">
                  Processing
                </span>
              </>
            )}
            {phase === "done" && result?.ok && (
              <>
                <div className="h-1.5 w-1.5 rounded-full bg-accent" />
                <span className="text-[10px] font-medium uppercase tracking-[0.14em] text-accent">
                  Ready
                </span>
              </>
            )}
            {phase === "done" && result && !result.ok && (
              <>
                <div className="h-1.5 w-1.5 rounded-full bg-[#C85040]" />
                <span className="text-[10px] font-medium uppercase tracking-[0.14em] text-[#C85040]">
                  Error
                </span>
              </>
            )}
          </div>
        </div>

        {/* Divider */}
        <div className="mx-7 h-px bg-gradient-to-r from-transparent via-white/60 to-transparent" />

        {/* Idle state */}
        {phase === "idle" && (
          <div className="px-7 pt-6 pb-7">
            <p className="text-[14px] text-text-muted leading-relaxed max-w-lg">
              Cindy will summarize {firstName}&apos;s chart into a concise outline
              using chart data, outcome trends, medication adherence, recent messages,
              and assessments — with talking points and risk flags so you&apos;re ready for the visit.
            </p>
            <div className="mt-6">
              <Button size="lg" onClick={handleGenerate}>
                Prepare for visit
              </Button>
            </div>

            {/* Subtle stats */}
            <div className="mt-8 grid grid-cols-3 gap-4 pt-6 border-t border-white/40">
              {[
                { value: "~2.3s", label: "Typical duration" },
                { value: "6", label: "Analysis steps" },
                { value: "Claude 4.5", label: "Model" },
              ].map((stat) => (
                <div key={stat.label}>
                  <p className="font-display text-lg text-text tabular-nums">{stat.value}</p>
                  <p className="text-[10px] text-text-subtle uppercase tracking-[0.12em] mt-0.5">
                    {stat.label}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Running / done state — step console */}
        {phase !== "idle" && (
          <div className="px-5 pt-5 pb-6">
            <div className="space-y-1.5">
              {displaySteps.map((step) => (
                <StepRow key={step.step} step={step} />
              ))}
            </div>

            {phase === "done" && result && (
              <div className="mt-5 mx-2 pt-4 border-t border-white/50 flex items-center justify-between">
                <div className="flex items-baseline gap-4">
                  <div>
                    <p className="text-[10px] text-text-subtle uppercase tracking-[0.12em]">
                      Duration
                    </p>
                    <p className="font-display text-sm text-text tabular-nums mt-0.5">
                      {(result.totalDurationMs / 1000).toFixed(2)}s
                    </p>
                  </div>
                  {result.briefing && (
                    <div>
                      <p className="text-[10px] text-text-subtle uppercase tracking-[0.12em]">
                        Confidence
                      </p>
                      <p
                        className={`font-display text-sm tabular-nums mt-0.5 ${
                          result.briefing.confidence >= 0.8
                            ? "text-accent"
                            : result.briefing.confidence >= 0.6
                              ? "text-[color:var(--highlight)]"
                              : "text-[#C85040]"
                        }`}
                      >
                        {Math.round(result.briefing.confidence * 100)}%
                      </p>
                    </div>
                  )}
                </div>
                {!result.ok && (
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={handleGenerate}
                  >
                    Retry
                  </Button>
                )}
              </div>
            )}

            {phase === "done" && result && !result.ok && (
              <div className="mt-4 mx-2 p-3 rounded-xl border border-[rgba(200,70,60,0.2)] bg-[rgba(200,70,60,0.06)]">
                <p className="text-xs text-[#B33F28]">{result.error}</p>
              </div>
            )}
          </div>
        )}
      </GlassCard>

      {/* ── Briefing results ───────────────────────────────── */}
      {phase === "done" && result?.ok && result.briefing && (
        <>
          {/* Risk flags — warning tint glass */}
          {result.briefing.riskFlags.length > 0 && (
            <GlassCard tint="warning" className="animate-in fade-in slide-in-from-bottom-2 duration-500">
              <div className="px-6 py-5">
                <div className="flex items-center gap-2 mb-4">
                  <div
                    className="h-6 w-6 rounded-lg flex items-center justify-center shadow-sm"
                    style={{
                      background:
                        "linear-gradient(135deg, #D85A3E, #A03B2E)",
                    }}
                  >
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                      <path
                        d="M6 2V7M6 9.5V10"
                        stroke="white"
                        strokeWidth="1.5"
                        strokeLinecap="round"
                      />
                    </svg>
                  </div>
                  <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-[#B33F28]">
                    Risk Flags
                  </p>
                </div>
                <ul className="space-y-2.5">
                  {(riskFlagsExpanded
                    ? result.briefing.riskFlags
                    : result.briefing.riskFlags.slice(0, 3)
                  ).map((flag, i) => (
                    <li
                      key={i}
                      className="flex items-start gap-3 text-sm text-text leading-relaxed"
                    >
                      <span className="mt-1.5 h-1 w-1 rounded-full bg-[#B33F28] shrink-0" />
                      {flag}
                    </li>
                  ))}
                </ul>
                {result.briefing.riskFlags.length > 3 && (
                  <button
                    type="button"
                    onClick={() => setRiskFlagsExpanded((v) => !v)}
                    className="mt-3 text-[11px] font-medium uppercase tracking-[0.14em] text-[#B33F28] transition-opacity hover:opacity-70"
                  >
                    {riskFlagsExpanded
                      ? "Show fewer"
                      : `Expand · ${result.briefing.riskFlags.length - 3} more`}
                  </button>
                )}
              </div>
            </GlassCard>
          )}

          {/* Patient summary — hero glass */}
          <GlassCard tint="accent" className="animate-in fade-in slide-in-from-bottom-2 duration-500">
            <div className="px-8 py-8">
              <Eyebrow className="mb-4">Patient&apos;s Story</Eyebrow>
              <p className="font-display text-2xl md:text-3xl text-text leading-[1.15] tracking-tight">
                {result.briefing.patientSummary}
              </p>
              {result.briefing.lastVisitSummary && (
                <div className="mt-5 pt-5 border-t border-white/50">
                  <p className="text-[10px] text-text-subtle uppercase tracking-[0.14em] mb-1.5">
                    Last visit
                  </p>
                  <p className="text-sm text-text-muted leading-relaxed">
                    {result.briefing.lastVisitSummary}
                  </p>
                </div>
              )}
            </div>
          </GlassCard>

          {/* Talking points */}
          <GlassCard className="animate-in fade-in slide-in-from-bottom-2 duration-500">
            <div className="px-7 py-6">
              <div className="flex items-center gap-2 mb-5">
                <LeafSprig size={14} className="text-accent" />
                <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-accent">
                  Talking Points
                </p>
              </div>
              <ol className="space-y-4">
                {result.briefing.talkingPoints.map((point, i) => (
                  <li key={i} className="flex items-start gap-4">
                    <span
                      className="flex shrink-0 h-7 w-7 items-center justify-center rounded-xl text-[11px] font-display tabular-nums shadow-sm"
                      style={{
                        background:
                          "linear-gradient(135deg, var(--accent), var(--accent-strong))",
                        color: "white",
                      }}
                    >
                      {i + 1}
                    </span>
                    <p className="text-[14px] text-text leading-relaxed pt-0.5">
                      {point}
                    </p>
                  </li>
                ))}
              </ol>
            </div>
          </GlassCard>

          {/* Detail sections */}
          {result.briefing.sections.length > 0 && (
            <div className="space-y-3">
              <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-text-subtle px-1">
                Intelligence Details
              </p>
              {result.briefing.sections.map((section, i) => (
                <div
                  key={i}
                  style={{
                    animation: `fadeSlideUp 0.5s ease-out ${i * 0.06}s both`,
                  }}
                >
                  <BriefingSection section={section} />
                </div>
              ))}
            </div>
          )}

          {/* Actions footer */}
          <GlassCard>
            <div className="px-7 py-5 flex items-center justify-between gap-4">
              <div className="flex items-center gap-2">
                <div className="h-1.5 w-1.5 rounded-full bg-accent" />
                <p className="text-xs text-text-muted">
                  Briefing complete. Ready for the visit.
                </p>
              </div>
              <div className="flex gap-2">
                <Link href={`/clinic/patients/${patientId}/prescribe`}>
                  <Button variant="secondary" size="sm">
                    Prescribe
                  </Button>
                </Link>
                <Button
                  size="sm"
                  disabled={isStartingVisit}
                  onClick={() => {
                    startStartVisitTransition(async () => {
                      try {
                        await startVisitWithBriefing(
                          patientId,
                          result?.briefing ?? undefined,
                        );
                      } catch (err) {
                        if (
                          err instanceof Error &&
                          !err.message.includes("NEXT_REDIRECT")
                        ) {
                          alert("Failed to start visit: " + err.message);
                        }
                      }
                    });
                  }}
                >
                  {isStartingVisit ? "Starting..." : "Start Visit"}
                </Button>
              </div>
            </div>
          </GlassCard>
        </>
      )}

      <style jsx>{`
        @keyframes fadeSlideUp {
          from {
            opacity: 0;
            transform: translateY(8px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
      `}</style>
    </div>
  );
}
