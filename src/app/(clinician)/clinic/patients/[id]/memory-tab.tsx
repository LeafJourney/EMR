"use client";

import * as React from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Sparkline } from "@/components/ui/sparkline";
import { formatRelative } from "@/lib/utils/format";
import { AgentAvatar } from "@/components/ui/agent-signal";
import { resolveAgentMeta } from "@/lib/agents/ui-registry";
import {
  Bubble,
  BubbleStrip,
  CollapsibleSection,
  AckDismissControls,
  ModalShell,
  useChartLedger,
  usePersistentState,
  type FilterBubble,
  type ResolveAction,
} from "./chart-kit";
import { cindyListSummary } from "@/lib/clinical/cindy-says";
import type { ModuleFlags } from "@/lib/clinical/module-opt-in";
import type {
  PatientMemory,
  ClinicalObservation,
  MemoryKind,
  ObservationSeverity,
  ObservationCategory,
} from "@prisma/client";

/**
 * Memory Tab — the physician-facing surface that shows what Cindy and the
 * care team remember about a patient ("longitudinal understanding").
 *
 * Reworked per Dr. Patel's directive (EMR-856/858/859/860):
 *
 *   1. LONGITUDINAL MEMORY (EMR-856) — click-to-expand collapsible. Quotes
 *      never truncate. Summary bubbles (e.g. "1 Urgent") open a popup with
 *      the issue / the why / how to act + Acknowledge·Dismiss·comment that
 *      records into the chart ledger and confirms where it lands.
 *
 *   2. RECENT OBSERVATIONS FROM CINDY (EMR-858) — one collapsible panel,
 *      terse bullets, urgent/concern/info/consider filter bubbles,
 *      Dismiss-all, "Suggested Action" subsection for any "consider…" text,
 *      and per-row acknowledge/dismiss/comment recorded to the ledger.
 *
 *   3. WHAT WE REMEMBER (EMR-860) — one big window with internal dividers;
 *      per-provider saved order + minimise (never delete); each subsection
 *      opens a detail popup; trend visuals via sparkline/bars.
 *
 * The acknowledgement ledger is localStorage-backed (no schema changes),
 * keyed per patient via useChartLedger.
 */

// MUST stay structurally identical so the unchanged page.tsx keeps compiling.
// New props are OPTIONAL with safe defaults.
interface MemoryTabProps {
  memories: PatientMemory[];
  observations: ClinicalObservation[];
  patientFirstName: string;
  /** EMR-856/858 — ledger keying + EMR-896 cross-tab routing. Optional so
   *  the existing page.tsx call site keeps compiling. */
  patientId?: string;
  /** EMR-859 — hide cannabis/psilocybin trend bubbles when opted out. */
  moduleFlags?: ModuleFlags;
}

// ---------------------------------------------------------------------------
// Kind + severity display maps
// ---------------------------------------------------------------------------

/** EMR-860 — subsection order/copy. firstName-aware titles resolved at render. */
const KIND_GROUPS: Array<{
  key: MemoryKind;
  title: (firstName: string) => string;
  blurb: string;
  emoji: string;
  accent: string;
}> = [
  {
    key: "concern",
    title: () => "Ongoing concerns",
    blurb: "What the team is keeping front of mind",
    emoji: "🫶",
    accent: "border-l-danger",
  },
  {
    key: "working",
    title: () => "What's working",
    blurb: "Interventions that are genuinely helping",
    emoji: "✅",
    accent: "border-l-success/70",
  },
  {
    key: "not_working",
    title: () => "What hasn't worked",
    blurb: "Things already tried, so we don't re-suggest them",
    emoji: "🚫",
    accent: "border-l-[color:var(--warning)]",
  },
  {
    key: "preference",
    // EMR-860 rename → "How {firstName} wants to be cared for"
    title: (f) => `How ${f} wants to be cared for`,
    blurb: "Stated or observed preferences",
    emoji: "💜",
    accent: "border-l-accent",
  },
  {
    key: "trajectory",
    title: () => "How things are trending",
    blurb: "Longitudinal direction of change",
    emoji: "📈",
    accent: "border-l-accent/60",
  },
  {
    key: "observation",
    title: () => "What the team has noticed",
    blurb: "Soft signals worth remembering",
    emoji: "👀",
    accent: "border-l-[color:var(--info)]",
  },
  {
    key: "relationship",
    // EMR-860 rename → "People in {firstName}'s life" (include pets)
    title: (f) => `People in ${f}'s life`,
    blurb: "Family, pets, other providers, support system",
    emoji: "👪",
    accent: "border-l-accent/40",
  },
  {
    key: "context",
    // EMR-860 rename → "Background to keep in mind"
    title: () => "Background to keep in mind",
    blurb: "Life context that shapes care",
    emoji: "🧭",
    accent: "border-l-border-strong",
  },
  {
    key: "milestone",
    title: () => "Key moments",
    blurb: "Turning points worth remembering",
    emoji: "⭐️",
    accent: "border-l-highlight",
  },
];

const SEVERITY_STYLE: Record<
  ObservationSeverity,
  { tone: "danger" | "warning" | "info" | "accent"; label: string }
> = {
  urgent: { tone: "danger", label: "Urgent" },
  concern: { tone: "warning", label: "Concern" },
  notable: { tone: "info", label: "Notable" },
  info: { tone: "accent", label: "Info" },
};

const CATEGORY_LABEL: Record<ObservationCategory, string> = {
  symptom_trend: "Symptoms",
  medication_response: "Medications",
  adherence: "Adherence",
  emotional_state: "Emotional state",
  red_flag: "Red flag",
  positive_signal: "Positives",
  side_effect: "Side effects",
  lifestyle_shift: "Lifestyle",
  engagement: "Engagement",
  other: "Other",
};

/** EMR-858 — the four observation filter buckets, each a distinct colour. */
type ObsBucket = "urgent" | "concern" | "info" | "consider";

function bucketOf(obs: ClinicalObservation): ObsBucket {
  // "consider"/"considering" → Suggested Action bucket (EMR-858)
  if (mentionsConsider(obs)) return "consider";
  if (obs.severity === "urgent") return "urgent";
  if (obs.severity === "concern") return "concern";
  return "info";
}

function mentionsConsider(obs: ClinicalObservation): boolean {
  const text = `${obs.summary} ${obs.actionSuggested ?? ""}`.toLowerCase();
  return /consider(ing)?\b/.test(text);
}

// ---------------------------------------------------------------------------
// <MemoryTab />
// ---------------------------------------------------------------------------

export function MemoryTab({
  memories,
  observations,
  patientFirstName,
  patientId,
  moduleFlags = { cannabis: true, psilocybin: false },
}: MemoryTabProps) {
  // Ledger is keyed per patient; fall back to firstName when no id is passed.
  const ledgerKey = patientId ?? `name:${patientFirstName}`;
  const { record } = useChartLedger(ledgerKey);

  if (memories.length === 0 && observations.length === 0) {
    return (
      <EmptyState
        title="We're just getting to know them"
        description={`Memories and observations will accumulate here as ${patientFirstName}'s care team and Cindy work together over time. The longer the relationship, the richer this view becomes.`}
      />
    );
  }

  const openObservations = observations.filter((o) => !o.acknowledgedAt);

  return (
    <div className="space-y-6">
      {/* EMR-856 — Longitudinal memory: click-to-expand, untruncated quotes,
          clickable summary bubbles → popup with ack/dismiss/comment. */}
      <LongitudinalMemoryPanel
        memories={memories}
        observations={observations}
        patientFirstName={patientFirstName}
        record={record}
      />

      {/* EMR-858 — Recent observations from Cindy: one collapsible box. */}
      {openObservations.length > 0 && (
        <CindyObservationsPanel
          observations={openObservations}
          record={record}
        />
      )}

      {/* EMR-859 + EMR-860 — What we remember: trend bubbles + one window. */}
      <WhatWeRememberPanel
        memories={memories}
        observations={observations}
        patientFirstName={patientFirstName}
        moduleFlags={moduleFlags}
        ledgerKey={ledgerKey}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// EMR-856 — Longitudinal memory panel
// ---------------------------------------------------------------------------

function LongitudinalMemoryPanel({
  memories,
  observations,
  patientFirstName,
  record,
}: {
  memories: PatientMemory[];
  observations: ClinicalObservation[];
  patientFirstName: string;
  record: ReturnType<typeof useChartLedger>["record"];
}) {
  const mostRecent = memories[0];
  const open = observations.filter((o) => !o.acknowledgedAt);
  const urgent = open.filter((o) => o.severity === "urgent");
  const concern = open.filter((o) => o.severity === "concern");

  // The clickable summary bubble currently open in the popup.
  const [active, setActive] = React.useState<ClinicalObservation[] | null>(
    null,
  );
  const [activeLabel, setActiveLabel] = React.useState("");

  function openBubble(label: string, items: ClinicalObservation[]) {
    if (items.length === 0) return;
    setActiveLabel(label);
    setActive(items);
  }

  return (
    <>
      <CollapsibleSection
        storageKey={`memory:longitudinal:${patientFirstName}`}
        title="Longitudinal memory"
        meta={`${memories.length} memor${memories.length === 1 ? "y" : "ies"}`}
        right={
          <div className="flex items-center gap-1.5">
            {urgent.length > 0 && (
              <button
                type="button"
                onClick={() => openBubble("Urgent", urgent)}
                aria-label={`${urgent.length} urgent — open details`}
              >
                <Bubble tone="severe" emoji="🚨">
                  {urgent.length} Urgent
                </Bubble>
              </button>
            )}
            {concern.length > 0 && (
              <button
                type="button"
                onClick={() => openBubble("Concern", concern)}
                aria-label={`${concern.length} concern — open details`}
              >
                <Bubble tone="mild" emoji="⚠️">
                  {concern.length} Concern{concern.length === 1 ? "" : "s"}
                </Bubble>
              </button>
            )}
            <button
              type="button"
              onClick={() => openBubble("Open observations", open)}
              aria-label={`${open.length} open observations — open details`}
            >
              <Bubble tone="info" emoji="👀">
                {open.length} Open
              </Bubble>
            </button>
          </div>
        }
      >
        <div className="pt-1">
          <h2 className="font-display text-2xl text-text leading-tight">
            We remember{" "}
            <span className="text-accent">{memories.length}</span> thing
            {memories.length === 1 ? "" : "s"} about {patientFirstName}
          </h2>
          {mostRecent && (
            <div className="mt-3">
              <p className="text-[11px] uppercase tracking-wider text-text-subtle mb-1">
                Most recently
              </p>
              {/* EMR-856 — quote never truncates (no line-clamp). */}
              <blockquote className="text-sm text-text leading-relaxed border-l-2 border-accent/40 pl-3">
                “{mostRecent.content}”
                <footer className="text-text-subtle mt-1 not-italic">
                  {formatRelative(mostRecent.createdAt.toISOString())}
                </footer>
              </blockquote>
            </div>
          )}
          <p className="text-[11px] text-text-subtle mt-3">
            Tap a bubble above to review the issue, the why, and how to act —
            then acknowledge or dismiss with a note.
          </p>
        </div>
      </CollapsibleSection>

      <ObservationDetailModal
        open={active != null}
        label={activeLabel}
        observations={active ?? []}
        source="Memory"
        onClose={() => setActive(null)}
        record={record}
      />
    </>
  );
}

/**
 * EMR-856 — popup showing each issue, the why, and how to act, plus
 * Acknowledge/Dismiss + free-text comment. Sign-off records into the chart
 * ledger and confirms where AI suggests it lands in the chart.
 */
function ObservationDetailModal({
  open,
  label,
  observations,
  source,
  onClose,
  record,
}: {
  open: boolean;
  label: string;
  observations: ClinicalObservation[];
  source: string;
  onClose: () => void;
  record: ReturnType<typeof useChartLedger>["record"];
}) {
  return (
    <ModalShell
      open={open}
      onClose={onClose}
      eyebrow="Longitudinal memory"
      title={label}
      placement="center"
      maxWidth="max-w-xl"
    >
      <div className="p-6 space-y-4">
        {observations.map((obs) => (
          <ObservationSignOffCard
            key={obs.id}
            observation={obs}
            source={source}
            record={record}
          />
        ))}
      </div>
    </ModalShell>
  );
}

/** One observation with issue / why / how-to-act + sign-off. */
function ObservationSignOffCard({
  observation,
  source,
  record,
}: {
  observation: ClinicalObservation;
  source: string;
  record: ReturnType<typeof useChartLedger>["record"];
}) {
  const style = SEVERITY_STYLE[observation.severity];
  const isCritical = observation.severity === "urgent";
  const [comment, setComment] = React.useState("");
  const [resolved, setResolved] = React.useState<{
    action: ResolveAction;
    justification?: string;
    at: string;
  } | null>(null);
  const [landedAt, setLandedAt] = React.useState<string | null>(null);

  function handleResolve(action: ResolveAction, justification?: string) {
    const note = [justification, comment.trim()].filter(Boolean).join(" — ");
    record({
      kind: action,
      source,
      subject: observation.summary,
      justification: note || undefined,
    });
    const at = new Date().toISOString();
    setResolved({ action, justification: note || undefined, at });
    // AI suggestion of where this lands in the chart.
    setLandedAt(landingFor(observation));
  }

  return (
    <Card className="border border-border p-4">
      <div className="flex items-center gap-2 flex-wrap mb-2">
        <Badge tone={style.tone} className="text-[10px]">
          {style.label}
        </Badge>
        <Badge tone="neutral" className="text-[10px]">
          {CATEGORY_LABEL[observation.category]}
        </Badge>
        <span className="text-[11px] text-text-subtle">
          {formatRelative(observation.createdAt.toISOString())}
        </span>
      </div>

      {/* The issue */}
      <div className="mb-2">
        <p className="text-[10px] uppercase tracking-wider text-text-subtle mb-0.5">
          The issue
        </p>
        <p className="text-sm text-text leading-relaxed">
          {observation.summary}
        </p>
      </div>

      {/* The why */}
      <div className="mb-2">
        <p className="text-[10px] uppercase tracking-wider text-text-subtle mb-0.5">
          Why it matters
        </p>
        <p className="text-[13px] text-text-muted leading-relaxed">
          {whyFor(observation)}
        </p>
      </div>

      {/* How to act */}
      {observation.actionSuggested && (
        <div className="mb-3 rounded-md bg-accent-soft/40 border border-accent/15 px-3 py-2">
          <p className="text-[10px] uppercase tracking-wider text-accent mb-0.5">
            How to act
          </p>
          <p className="text-[12px] text-text">{observation.actionSuggested}</p>
        </div>
      )}

      {/* Comment + sign-off */}
      {!resolved ? (
        <div className="space-y-2">
          <textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            rows={2}
            placeholder="Add a comment (optional)…"
            className="w-full text-xs rounded-md border border-border bg-surface px-2.5 py-1.5 text-text focus:outline-none focus:border-accent resize-none"
          />
          <div className="flex justify-end">
            <AckDismissControls
              isCritical={isCritical}
              onResolve={handleResolve}
            />
          </div>
        </div>
      ) : (
        <div className="rounded-md bg-success/[0.06] border border-success/25 px-3 py-2">
          <p className="text-[12px] text-text">
            <span className="font-medium text-success">
              {resolved.action === "acknowledge"
                ? "✓ Acknowledged"
                : "Dismissed"}
            </span>{" "}
            and time-stamped into the chart record.
          </p>
          {landedAt && (
            <p className="text-[11px] text-text-muted mt-0.5">
              Cindy suggests this lands under{" "}
              <span className="font-medium text-text">{landedAt}</span>.
            </p>
          )}
        </div>
      )}
    </Card>
  );
}

// ---------------------------------------------------------------------------
// EMR-858 — Recent observations from Cindy
// ---------------------------------------------------------------------------

const OBS_BUCKETS: Array<{ key: ObsBucket; label: string; emoji: string }> = [
  { key: "urgent", label: "Urgent", emoji: "🚨" },
  { key: "concern", label: "Concern", emoji: "⚠️" },
  { key: "info", label: "Info", emoji: "💬" },
  { key: "consider", label: "Suggested Action", emoji: "💡" },
];

const OBS_BUCKET_TONE: Record<ObsBucket, FilterBubble["tone"]> = {
  urgent: "severe",
  concern: "mild",
  info: "info",
  consider: "active",
};

function CindyObservationsPanel({
  observations,
  record,
}: {
  observations: ClinicalObservation[];
  record: ReturnType<typeof useChartLedger>["record"];
}) {
  const [filter, setFilter] = React.useState<string | null>(null);
  // Locally-resolved rows (so dismiss-all / per-row sign-off update the UI).
  const [resolvedIds, setResolvedIds] = React.useState<
    Record<string, { action: ResolveAction; at: string }>
  >({});

  const counts = React.useMemo(() => {
    const c: Record<ObsBucket, number> = {
      urgent: 0,
      concern: 0,
      info: 0,
      consider: 0,
    };
    for (const o of observations) c[bucketOf(o)] += 1;
    return c;
  }, [observations]);

  const bubbles: FilterBubble[] = OBS_BUCKETS.filter(
    (b) => counts[b.key] > 0,
  ).map((b) => ({
    key: b.key,
    label: b.label,
    emoji: b.emoji,
    tone: OBS_BUCKET_TONE[b.key],
    count: counts[b.key],
  }));

  const visible = observations.filter(
    (o) => !filter || bucketOf(o) === filter,
  );
  const consider = visible.filter((o) => bucketOf(o) === "consider");
  const regular = visible.filter((o) => bucketOf(o) !== "consider");
  const openRows = observations.filter((o) => !resolvedIds[o.id]);

  function resolveRow(
    obs: ClinicalObservation,
    action: ResolveAction,
    justification?: string,
  ) {
    record({
      kind: action,
      source: "Memory",
      subject: obs.summary,
      justification,
    });
    setResolvedIds((prev) => ({
      ...prev,
      [obs.id]: { action, at: new Date().toISOString() },
    }));
  }

  function dismissAll() {
    const at = new Date().toISOString();
    setResolvedIds((prev) => {
      const next = { ...prev };
      for (const o of openRows) {
        record({ kind: "dismiss", source: "Memory", subject: o.summary });
        next[o.id] = { action: "dismiss", at };
      }
      return next;
    });
  }

  return (
    <CollapsibleSection
      storageKey="memory:cindy-observations"
      title="Recent observations from Cindy — review and acknowledge."
      meta={`${openRows.length} open`}
      right={
        openRows.length > 0 ? (
          <button
            type="button"
            onClick={dismissAll}
            className="px-2 py-1 text-[11px] rounded-md font-medium border border-border text-text-muted hover:bg-surface-muted"
          >
            Dismiss all
          </button>
        ) : undefined
      }
    >
      <div className="pt-1 space-y-3">
        {/* EMR-858 — filter bubbles: urgent/concern/info/consider. */}
        {bubbles.length > 0 && (
          <BubbleStrip
            bubbles={bubbles}
            selected={filter}
            onSelect={setFilter}
          />
        )}

        {/* Regular observations as terse bullets. */}
        {regular.length > 0 && (
          <ul className="divide-y divide-border/60">
            {regular.map((obs) => (
              <ObservationBulletRow
                key={obs.id}
                observation={obs}
                resolved={resolvedIds[obs.id] ?? null}
                onResolve={(a, j) => resolveRow(obs, a, j)}
              />
            ))}
          </ul>
        )}

        {/* EMR-858 — "consider…" text moves into its own Suggested Action box. */}
        {consider.length > 0 && (
          <div className="rounded-lg border border-accent/20 bg-accent-soft/30 p-3">
            <p className="text-[10px] uppercase tracking-wider text-accent mb-1.5">
              💡 Suggested Action
            </p>
            <ul className="divide-y divide-accent/10">
              {consider.map((obs) => (
                <ObservationBulletRow
                  key={obs.id}
                  observation={obs}
                  resolved={resolvedIds[obs.id] ?? null}
                  onResolve={(a, j) => resolveRow(obs, a, j)}
                />
              ))}
            </ul>
          </div>
        )}

        {visible.length === 0 && (
          <p className="text-[12px] text-text-subtle italic py-2">
            No observations in this filter.
          </p>
        )}
      </div>
    </CollapsibleSection>
  );
}

/** Terse bullet observation row with inline acknowledge/dismiss/comment. */
function ObservationBulletRow({
  observation,
  resolved,
  onResolve,
}: {
  observation: ClinicalObservation;
  resolved: { action: ResolveAction; at: string } | null;
  onResolve: (action: ResolveAction, justification?: string) => void;
}) {
  const [comment, setComment] = React.useState("");
  const [showComment, setShowComment] = React.useState(false);
  const isCritical = observation.severity === "urgent";

  return (
    <li className="py-2.5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 flex-wrap mb-1">
            <SourceAvatar
              source={observation.observedBy}
              sourceKind={observation.observedByKind}
            />
            <Badge tone="neutral" className="text-[9px]">
              {CATEGORY_LABEL[observation.category]}
            </Badge>
            <span className="text-[10px] text-text-subtle">
              {formatRelative(observation.createdAt.toISOString())}
            </span>
          </div>
          <p className="text-[13px] text-text leading-snug">
            {observation.summary}
          </p>
        </div>
        <AckDismissControls
          isCritical={isCritical}
          resolved={
            resolved
              ? { action: resolved.action, at: resolved.at }
              : null
          }
          onResolve={(action, justification) => {
            const note = [justification, comment.trim()]
              .filter(Boolean)
              .join(" — ");
            onResolve(action, note || undefined);
          }}
          size="xs"
        />
      </div>
      {!resolved && (
        <div className="mt-1.5">
          {showComment ? (
            <textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              rows={2}
              placeholder="Comment (folded into the sign-off note)…"
              className="w-full text-xs rounded-md border border-border bg-surface px-2 py-1.5 text-text focus:outline-none focus:border-accent resize-none"
            />
          ) : (
            <button
              type="button"
              onClick={() => setShowComment(true)}
              className="text-[11px] text-accent hover:underline"
            >
              + Add comment
            </button>
          )}
        </div>
      )}
    </li>
  );
}

// ---------------------------------------------------------------------------
// EMR-859 + EMR-860 — What we remember (trend bubbles + one window)
// ---------------------------------------------------------------------------

/** EMR-859 — trend filter bubbles, in display order. */
type TrendKey =
  | "medications"
  | "symptoms"
  | "positives"
  | "side_effects"
  | "vitals"
  | "labs"
  | "lifestyle"
  | "cannabis"
  | "psilocybin";

const TREND_BUBBLES: Array<{
  key: TrendKey;
  label: string;
  emoji: string;
  /** Which observation categories this trend bubble matches. */
  categories: ObservationCategory[];
}> = [
  {
    key: "medications",
    label: "Medications",
    emoji: "💊",
    categories: ["medication_response"],
  },
  {
    key: "symptoms",
    label: "Symptoms",
    emoji: "🩺",
    categories: ["symptom_trend"],
  },
  {
    key: "positives",
    label: "Positives",
    emoji: "🌟",
    categories: ["positive_signal"],
  },
  {
    key: "side_effects",
    label: "Side effects",
    emoji: "⚠️",
    categories: ["side_effect"],
  },
  { key: "vitals", label: "Vitals", emoji: "❤️", categories: [] },
  { key: "labs", label: "Labs/tests", emoji: "🧪", categories: [] },
  {
    key: "lifestyle",
    label: "Lifestyle",
    emoji: "🌿",
    categories: ["lifestyle_shift"],
  },
  { key: "cannabis", label: "Cannabis", emoji: "🍃", categories: [] },
  { key: "psilocybin", label: "Psilocybin", emoji: "🍄", categories: [] },
];

function WhatWeRememberPanel({
  memories,
  observations,
  patientFirstName,
  moduleFlags,
  ledgerKey,
}: {
  memories: PatientMemory[];
  observations: ClinicalObservation[];
  patientFirstName: string;
  moduleFlags: ModuleFlags;
  ledgerKey: string;
}) {
  const [trendFilter, setTrendFilter] = React.useState<string | null>(null);
  const grouped = React.useMemo(
    () => groupMemoriesByKind(memories),
    [memories],
  );

  // EMR-859 — hide cannabis/psilocybin bubbles when the module is opted out.
  const trendBubbleDefs = TREND_BUBBLES.filter((b) => {
    if (b.key === "cannabis") return moduleFlags.cannabis;
    if (b.key === "psilocybin") return moduleFlags.psilocybin;
    return true;
  });

  const trendBubbles: FilterBubble[] = trendBubbleDefs.map((b) => ({
    key: b.key,
    label: b.label,
    emoji: b.emoji,
    tone: "info",
  }));

  // EMR-860 — saved subsection order per provider (persistent).
  const defaultOrder = KIND_GROUPS.map((g) => g.key);
  const [order, setOrder] = usePersistentState<MemoryKind[]>(
    `memory:section-order:${ledgerKey}`,
    defaultOrder,
  );
  // Reconcile in case the kind set ever changes (never drop, append new).
  const safeOrder = React.useMemo(() => {
    const known = new Set(defaultOrder);
    const fromSaved = order.filter((k) => known.has(k));
    const missing = defaultOrder.filter((k) => !fromSaved.includes(k));
    return [...fromSaved, ...missing];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [order]);

  // EMR-860 — minimised (never deletable) subsections, persistent.
  const [minimized, setMinimized] = usePersistentState<MemoryKind[]>(
    `memory:section-min:${ledgerKey}`,
    [],
  );

  const [detail, setDetail] = React.useState<{
    group: (typeof KIND_GROUPS)[number];
    items: PatientMemory[];
  } | null>(null);

  // EMR-859 — filter the visible memory groups by selected trend bubble.
  const activeDef = trendFilter
    ? trendBubbleDefs.find((b) => b.key === trendFilter)
    : null;
  const filterCategories = activeDef?.categories ?? null;

  function passesTrendFilter(key: MemoryKind): boolean {
    if (!filterCategories) return true;
    // Map observation categories → which memory kinds light up. Trajectory and
    // the matching narrative kinds stay visible; everything else dims out.
    if (filterCategories.includes("medication_response"))
      return key === "working" || key === "not_working" || key === "trajectory";
    if (filterCategories.includes("symptom_trend"))
      return key === "trajectory" || key === "concern" || key === "observation";
    if (filterCategories.includes("positive_signal"))
      return key === "working" || key === "milestone";
    if (filterCategories.includes("side_effect"))
      return key === "not_working" || key === "concern";
    if (filterCategories.includes("lifestyle_shift"))
      return key === "context" || key === "observation";
    return true;
  }

  const orderedGroups = safeOrder
    .map((k) => KIND_GROUPS.find((g) => g.key === k))
    .filter((g): g is (typeof KIND_GROUPS)[number] => Boolean(g));

  // Build a trend series for the "How things are trending" visual.
  const trendSeries = buildTrendSeries(observations);

  return (
    <>
      <CollapsibleSection
        storageKey={`memory:what-we-remember:${ledgerKey}`}
        title={`What we remember about ${patientFirstName}`}
        meta={`${memories.length} memor${memories.length === 1 ? "y" : "ies"}`}
      >
        <div className="pt-1 space-y-4">
          {/* EMR-859 — trend bubbles (filter the window below). */}
          <div>
            <p className="text-[10px] uppercase tracking-wider text-text-subtle mb-1.5">
              Filter by trend
            </p>
            <BubbleStrip
              bubbles={trendBubbles}
              selected={trendFilter}
              onSelect={setTrendFilter}
            />
          </div>

          {/* EMR-860 — "How things are trending" graphical visual. */}
          <TrendingVisual series={trendSeries} />

          {memories.length === 0 ? (
            <p className="text-sm text-text-muted italic">
              No memories recorded yet. Cindy and the care team will start
              capturing what they learn as they interact with{" "}
              {patientFirstName}.
            </p>
          ) : (
            // EMR-860 — ONE big window with internal dividers.
            <div className="rounded-xl border border-border divide-y divide-border overflow-hidden">
              {orderedGroups.map((group, idx) => {
                const items = grouped.get(group.key) ?? [];
                const dimmed = !passesTrendFilter(group.key);
                const isMin = minimized.includes(group.key);
                return (
                  <MemorySubsection
                    key={group.key}
                    group={group}
                    items={items}
                    firstName={patientFirstName}
                    dimmed={dimmed}
                    minimized={isMin}
                    isFirst={idx === 0}
                    isLast={idx === orderedGroups.length - 1}
                    onToggleMin={() =>
                      setMinimized((prev) =>
                        prev.includes(group.key)
                          ? prev.filter((k) => k !== group.key)
                          : [...prev, group.key],
                      )
                    }
                    onMove={(dir) =>
                      setOrder(() => moveKind(safeOrder, group.key, dir))
                    }
                    onOpenDetail={() => setDetail({ group, items })}
                  />
                );
              })}
            </div>
          )}
        </div>
      </CollapsibleSection>

      {/* EMR-860 — subsection click → detail popup. */}
      <ModalShell
        open={detail != null}
        onClose={() => setDetail(null)}
        eyebrow="What we remember"
        title={detail ? detail.group.title(patientFirstName) : ""}
        placement="center"
        maxWidth="max-w-xl"
      >
        <div className="p-6 space-y-3">
          {detail?.items.length === 0 ? (
            <p className="text-sm text-text-muted italic">
              Nothing recorded here yet.
            </p>
          ) : (
            detail?.items.map((m) => (
              <MemoryDetailRow key={m.id} memory={m} />
            ))
          )}
        </div>
      </ModalShell>
    </>
  );
}

/** One subsection inside the single "What we remember" window (EMR-860). */
function MemorySubsection({
  group,
  items,
  firstName,
  dimmed,
  minimized,
  isFirst,
  isLast,
  onToggleMin,
  onMove,
  onOpenDetail,
}: {
  group: (typeof KIND_GROUPS)[number];
  items: PatientMemory[];
  firstName: string;
  dimmed: boolean;
  minimized: boolean;
  isFirst: boolean;
  isLast: boolean;
  onToggleMin: () => void;
  onMove: (dir: -1 | 1) => void;
  onOpenDetail: () => void;
}) {
  return (
    <div
      className={`border-l-4 ${group.accent} ${dimmed ? "opacity-40" : ""} transition-opacity`}
    >
      <div className="flex items-center gap-2 px-4 py-3">
        {/* Reorder handles (saved per provider). */}
        <div className="flex flex-col -my-1 shrink-0">
          <button
            type="button"
            onClick={() => onMove(-1)}
            disabled={isFirst}
            aria-label="Move section up"
            className="text-[10px] leading-none text-text-subtle hover:text-text disabled:opacity-20"
          >
            ▲
          </button>
          <button
            type="button"
            onClick={() => onMove(1)}
            disabled={isLast}
            aria-label="Move section down"
            className="text-[10px] leading-none text-text-subtle hover:text-text disabled:opacity-20"
          >
            ▼
          </button>
        </div>

        <button
          type="button"
          onClick={onOpenDetail}
          className="flex-1 text-left min-w-0"
        >
          <span className="flex items-center gap-2">
            <span aria-hidden="true">{group.emoji}</span>
            {/* EMR-860 — no "1" badge; firstName-aware titles. */}
            <span className="font-display text-base text-text leading-tight truncate">
              {group.title(firstName)}
            </span>
            <span className="text-[11px] text-text-subtle tabular-nums shrink-0">
              {items.length}
            </span>
          </span>
          <span className="block text-[10px] uppercase tracking-wider text-text-subtle mt-0.5">
            {group.blurb}
          </span>
        </button>

        {/* EMR-860 — "-"/"+" minimise (never delete). */}
        <button
          type="button"
          onClick={onToggleMin}
          aria-label={minimized ? "Expand section" : "Minimise section"}
          className="shrink-0 h-6 w-6 rounded-md border border-border text-text-muted hover:bg-surface-muted flex items-center justify-center text-sm leading-none"
        >
          {minimized ? "+" : "–"}
        </button>
      </div>

      {!minimized && (
        <div className="px-4 pb-3">
          {items.length === 0 ? (
            <p className="text-[12px] text-text-subtle italic">
              Nothing recorded here yet.
            </p>
          ) : (
            <ul className="space-y-2.5">
              {items.slice(0, 4).map((m) => (
                <li
                  key={m.id}
                  className="text-[13px] text-text leading-relaxed"
                >
                  {/* EMR-860 — avoid em-dash splits in the body copy. */}
                  <p className="mb-1">{m.content}</p>
                  <div className="flex items-center gap-1.5 text-[10px] text-text-subtle flex-wrap">
                    <SourceBadge
                      source={m.source}
                      sourceKind={m.sourceKind}
                    />
                    <span>·</span>
                    <span>{formatRelative(m.createdAt.toISOString())}</span>
                    {m.confidence < 0.7 && (
                      <>
                        <span>·</span>
                        <span className="italic">
                          {Math.round(m.confidence * 100)}% confidence
                        </span>
                      </>
                    )}
                  </div>
                </li>
              ))}
              {items.length > 4 && (
                <li>
                  <button
                    type="button"
                    onClick={onOpenDetail}
                    className="text-[11px] text-accent hover:underline"
                  >
                    + {items.length - 4} more — open detail
                  </button>
                </li>
              )}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

function MemoryDetailRow({ memory }: { memory: PatientMemory }) {
  return (
    <Card className="border border-border p-3">
      <p className="text-[13px] text-text leading-relaxed mb-1.5">
        {memory.content}
      </p>
      <div className="flex items-center gap-1.5 text-[10px] text-text-subtle flex-wrap">
        <SourceBadge source={memory.source} sourceKind={memory.sourceKind} />
        <span>·</span>
        <span>{formatRelative(memory.createdAt.toISOString())}</span>
        {memory.confidence < 0.7 && (
          <>
            <span>·</span>
            <span className="italic">
              {Math.round(memory.confidence * 100)}% confidence
            </span>
          </>
        )}
        {memory.tags.length > 0 && (
          <>
            <span>·</span>
            <span>{memory.tags.slice(0, 4).join(" · ")}</span>
          </>
        )}
      </div>
    </Card>
  );
}

/** EMR-860 — "How things are trending" graphical visual (sparkline + bars). */
function TrendingVisual({
  series,
}: {
  series: { positives: number[]; concerns: number[]; total: number };
}) {
  const cindy = cindyListSummary(
    [
      {
        title: `${series.total} observations charted`,
        meta: `${series.positives.reduce((a, b) => a + b, 0)} positive signals`,
      },
    ],
    { voice: "summary", noun: "trend points" },
  );

  const hasData = series.positives.length >= 2 || series.concerns.length >= 2;

  return (
    <div className="rounded-lg border border-border bg-surface-muted/30 p-3">
      <p className="text-[10px] uppercase tracking-wider text-text-subtle mb-2">
        📈 How things are trending
      </p>
      {hasData ? (
        <div className="grid grid-cols-2 gap-4">
          <TrendCell label="Positive signals" data={series.positives} />
          <TrendCell label="Concerns raised" data={series.concerns} />
        </div>
      ) : (
        <div className="flex items-end gap-1.5 h-12">
          {/* Fallback inline bars when there's too little for a sparkline. */}
          {[series.positives.length, series.concerns.length, series.total].map(
            (v, i) => (
              <div
                key={i}
                className="flex-1 rounded-t bg-accent/40"
                style={{ height: `${Math.min(100, v * 12 + 8)}%` }}
                title={`${["positives", "concerns", "total"][i]}: ${v}`}
              />
            ),
          )}
        </div>
      )}
      <p className="text-[11px] text-text-subtle mt-2">{cindy.bullets[0]}</p>
    </div>
  );
}

function TrendCell({ label, data }: { label: string; data: number[] }) {
  return (
    <div>
      <p className="text-[10px] text-text-subtle mb-1">{label}</p>
      {data.length >= 2 ? (
        <Sparkline data={data} width={180} height={40} />
      ) : (
        <p className="text-[11px] text-text-subtle italic">Not enough data</p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Shared avatar/badge bits
// ---------------------------------------------------------------------------

function SourceBadge({
  source,
  sourceKind,
}: {
  source: string;
  sourceKind: string;
}) {
  if (sourceKind === "agent") {
    const meta = resolveAgentMeta(source);
    return (
      <span className="inline-flex items-center gap-1">
        <AgentAvatar meta={meta} size="xs" />
        <span>{meta.displayName}</span>
      </span>
    );
  }
  return <span>{source}</span>;
}

function SourceAvatar({
  source,
  sourceKind,
}: {
  source: string;
  sourceKind: string;
}) {
  if (sourceKind === "agent") {
    const meta = resolveAgentMeta(source);
    return <AgentAvatar meta={meta} size="xs" />;
  }
  return (
    <div
      aria-hidden="true"
      className="h-5 w-5 rounded-full bg-surface-muted border border-border flex items-center justify-center text-[10px] text-text-subtle shrink-0"
    >
      U
    </div>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function groupMemoriesByKind(
  memories: PatientMemory[],
): Map<MemoryKind, PatientMemory[]> {
  const out = new Map<MemoryKind, PatientMemory[]>();
  for (const m of memories) {
    const bucket = out.get(m.kind) ?? [];
    bucket.push(m);
    out.set(m.kind, bucket);
  }
  return out;
}

function moveKind(
  order: MemoryKind[],
  key: MemoryKind,
  dir: -1 | 1,
): MemoryKind[] {
  const idx = order.indexOf(key);
  if (idx < 0) return order;
  const target = idx + dir;
  if (target < 0 || target >= order.length) return order;
  const next = [...order];
  [next[idx], next[target]] = [next[target], next[idx]];
  return next;
}

/** Plain-language "why this matters" derived from category/severity. */
function whyFor(obs: ClinicalObservation): string {
  const sev =
    obs.severity === "urgent"
      ? "needs attention now"
      : obs.severity === "concern"
        ? "worth a closer look"
        : "useful context";
  const cat = CATEGORY_LABEL[obs.category].toLowerCase();
  return `Flagged under ${cat}; ${sev}. Reviewing keeps the longitudinal picture honest and the next visit better-prepared.`;
}

/** AI suggestion of where a sign-off lands in the chart. */
function landingFor(obs: ClinicalObservation): string {
  switch (obs.category) {
    case "medication_response":
    case "side_effect":
      return "the Rx / medications timeline";
    case "symptom_trend":
      return "the symptoms trend on the chart";
    case "red_flag":
      return "the safety flags on the chart header";
    case "positive_signal":
      return "the “what's working” memory section";
    case "lifestyle_shift":
      return "the lifestyle context section";
    case "adherence":
    case "engagement":
      return "the care-coordination notes";
    case "emotional_state":
      return "the longitudinal memory";
    default:
      return "the longitudinal memory";
  }
}

/** Build positive/concern counts over time for the trending visual. */
function buildTrendSeries(observations: ClinicalObservation[]): {
  positives: number[];
  concerns: number[];
  total: number;
} {
  // Bucket by day (oldest → newest) so the sparkline reads left-to-right.
  const sorted = [...observations].sort(
    (a, b) => a.createdAt.getTime() - b.createdAt.getTime(),
  );
  const byDay = new Map<string, { pos: number; con: number }>();
  for (const o of sorted) {
    const day = o.createdAt.toISOString().slice(0, 10);
    const cur = byDay.get(day) ?? { pos: 0, con: 0 };
    if (o.category === "positive_signal" || o.severity === "info") cur.pos += 1;
    if (o.severity === "urgent" || o.severity === "concern") cur.con += 1;
    byDay.set(day, cur);
  }
  const days = [...byDay.values()];
  return {
    positives: days.map((d) => d.pos),
    concerns: days.map((d) => d.con),
    total: observations.length,
  };
}
