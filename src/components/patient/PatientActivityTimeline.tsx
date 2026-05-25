"use client";

// PatientActivityTimeline — Linear/Notion-grade chronological feed for the
// patient chart. One vertical rail, circular icon nodes joined by a
// hairline, sticky day headers, color-coded by event kind. Designed to
// drop into the Timeline chart tab; consumers feed it the array returned
// by `loadPatientActivity()` and the component owns all filter state.

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils/cn";
import { formatRelative } from "@/lib/utils/format";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton, SkeletonCircle } from "@/components/ui/skeleton";
import {
  FreshnessIndicator,
  useStaleRefresh,
} from "@/components/ui/freshness-indicator";
import {
  groupActivityByDay,
  type PatientActivityEvent,
  type PatientActivityKind,
} from "@/lib/domain/patient-activity";

interface PatientActivityTimelineProps {
  events: PatientActivityEvent[];
  /** Optional initial filter — handy when deep-linking from another surface. */
  initialKind?: ChipKey;
  /** Render the skeleton view instead of `events`. Used during streaming SSR. */
  loading?: boolean;
  /** ISO timestamp of when `events` were fetched. When provided, the timeline
   *  renders a FreshnessIndicator so the clinician can see how stale the view
   *  is and re-pull on demand. */
  loadedAt?: string;
}

type ChipKey =
  | "all"
  | "visit"
  | "message"
  | "note"
  | "lab"
  | "refill"
  | "task";

interface ChipDef {
  key: ChipKey;
  label: string;
  /** Kind(s) this chip activates. `all` is the empty-set escape hatch. */
  match: (e: PatientActivityEvent) => boolean;
}

const CHIPS: ChipDef[] = [
  { key: "all", label: "All", match: () => true },
  { key: "visit", label: "Visits", match: (e) => e.kind === "visit" },
  { key: "message", label: "Messages", match: (e) => e.kind === "message" },
  { key: "note", label: "Notes", match: (e) => e.kind === "note" },
  { key: "lab", label: "Labs", match: (e) => e.kind === "lab" },
  { key: "refill", label: "Refills", match: (e) => e.kind === "refill" },
  { key: "task", label: "Tasks", match: (e) => e.kind === "task" },
];

interface KindStyle {
  /** Background for the circular icon node. */
  nodeBg: string;
  /** Foreground icon color. */
  nodeFg: string;
  /** A subtle accent stripe on the left edge of the card on hover. */
  accent: string;
  icon: React.ReactNode;
}

// Apple-iOS-y palette: muted, single-pop saturation per kind. We lean on
// Tailwind color tokens so the rail looks at home next to the rest of the
// chart cards without inventing new design tokens.
const KIND_STYLES: Record<PatientActivityKind, KindStyle> = {
  visit: {
    nodeBg: "bg-emerald-100 dark:bg-emerald-950/40",
    nodeFg: "text-emerald-700 dark:text-emerald-300",
    accent: "bg-emerald-400/60",
    icon: <Icon path="M9 12l2 2 4-4" circle />,
  },
  message: {
    nodeBg: "bg-sky-100 dark:bg-sky-950/40",
    nodeFg: "text-sky-700 dark:text-sky-300",
    accent: "bg-sky-400/60",
    icon: <Icon path="M4 5h16v11H7l-3 3V5z" />,
  },
  note: {
    nodeBg: "bg-stone-100 dark:bg-stone-800/60",
    nodeFg: "text-stone-700 dark:text-stone-200",
    accent: "bg-stone-400/60",
    icon: <Icon path="M5 4h11l3 3v13H5V4zM8 9h8M8 13h8M8 17h5" />,
  },
  lab: {
    nodeBg: "bg-amber-100 dark:bg-amber-950/40",
    nodeFg: "text-amber-700 dark:text-amber-300",
    accent: "bg-amber-400/60",
    icon: <Icon path="M9 3v6l-4 8a3 3 0 002.7 4.3h8.6A3 3 0 0019 17l-4-8V3M9 3h6" />,
  },
  refill: {
    nodeBg: "bg-violet-100 dark:bg-violet-950/40",
    nodeFg: "text-violet-700 dark:text-violet-300",
    accent: "bg-violet-400/60",
    icon: <Icon path="M4 12a8 8 0 0114-5l2-2v6h-6l2-2a5 5 0 100 7" />,
  },
  task: {
    nodeBg: "bg-zinc-100 dark:bg-zinc-800/60",
    nodeFg: "text-zinc-700 dark:text-zinc-200",
    accent: "bg-zinc-400/60",
    icon: <Icon path="M5 12l4 4 10-10" />,
  },
  system: {
    nodeBg: "bg-zinc-100 dark:bg-zinc-800/60",
    nodeFg: "text-zinc-500 dark:text-zinc-400",
    accent: "bg-zinc-300/60",
    icon: <Icon path="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />,
  },
};

function Icon({ path, circle }: { path: string; circle?: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-3.5 w-3.5"
      aria-hidden="true"
    >
      {circle ? <circle cx="12" cy="12" r="9" /> : null}
      <path d={path} />
    </svg>
  );
}

function toInputDate(d?: Date): string {
  if (!d) return "";
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function parseInputDate(s: string): Date | undefined {
  if (!s) return undefined;
  // Avoid the UTC-midnight gotcha: build a local-tz date so the range
  // lines up with what the clinician picked in the picker.
  const [y, m, d] = s.split("-").map(Number);
  if (!y || !m || !d) return undefined;
  return new Date(y, m - 1, d);
}

export function PatientActivityTimeline({
  events,
  initialKind = "all",
  loading = false,
  loadedAt,
}: PatientActivityTimelineProps) {
  const router = useRouter();
  const [activeChip, setActiveChip] = React.useState<ChipKey>(initialKind);
  const [since, setSince] = React.useState<Date | undefined>(undefined);
  const [until, setUntil] = React.useState<Date | undefined>(undefined);
  const [refreshing, setRefreshing] = React.useState(false);

  // Pull the latest events from the server. The timeline already lives
  // inside the chart's `force-dynamic` server tree, so router.refresh()
  // re-runs the loader and replays `events` from the top.
  const refresh = React.useCallback(() => {
    setRefreshing(true);
    router.refresh();
    setTimeout(() => setRefreshing(false), 300);
  }, [router]);

  // Auto-pull when the clinician comes back to the tab after 5+ min away.
  useStaleRefresh({
    since: loadedAt ?? new Date().toISOString(),
    thresholdMs: 5 * 60 * 1000,
    onRefresh: refresh,
    enabled: !!loadedAt,
  });

  const counts = React.useMemo(() => {
    const out: Record<ChipKey, number> = {
      all: events.length,
      visit: 0,
      message: 0,
      note: 0,
      lab: 0,
      refill: 0,
      task: 0,
    };
    for (const e of events) {
      if (e.kind in out) (out as any)[e.kind]++;
    }
    return out;
  }, [events]);

  const filtered = React.useMemo(() => {
    const chip = CHIPS.find((c) => c.key === activeChip) ?? CHIPS[0];
    return events.filter((e) => {
      if (!chip.match(e)) return false;
      const t = new Date(e.occurredAt).getTime();
      if (since && t < since.getTime()) return false;
      // Until is inclusive of the picked day — bump to end-of-day.
      if (until) {
        const end = new Date(until);
        end.setHours(23, 59, 59, 999);
        if (t > end.getTime()) return false;
      }
      return true;
    });
  }, [events, activeChip, since, until]);

  const groups = React.useMemo(() => groupActivityByDay(filtered), [filtered]);

  const clearFilters = () => {
    setActiveChip("all");
    setSince(undefined);
    setUntil(undefined);
  };
  const filtersActive =
    activeChip !== "all" || since !== undefined || until !== undefined;

  return (
    <section
      aria-label="Patient activity timeline"
      className="flex flex-col gap-4"
    >
      {/* ── Filters ──────────────────────────────────────────── */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div role="tablist" aria-label="Filter timeline by event kind" className="flex flex-wrap gap-1.5">
          {CHIPS.map((chip) => {
            const isActive = chip.key === activeChip;
            const count = counts[chip.key];
            return (
              <button
                key={chip.key}
                type="button"
                role="tab"
                aria-selected={isActive}
                onClick={() => setActiveChip(chip.key)}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                  "focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/60",
                  isActive
                    ? "border-text bg-text text-surface"
                    : "border-border-strong/40 bg-surface text-text-muted hover:border-border-strong hover:text-text",
                )}
              >
                <span>{chip.label}</span>
                {count > 0 && (
                  <span
                    className={cn(
                      "rounded-full px-1.5 text-[10px] tabular-nums leading-4",
                      isActive ? "bg-surface/20" : "bg-surface-muted text-text-muted",
                    )}
                  >
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        <div className="flex items-center gap-2 text-xs text-text-muted">
          <label className="flex items-center gap-1.5">
            <span className="sr-only">From</span>
            <input
              type="date"
              value={toInputDate(since)}
              max={toInputDate(until) || undefined}
              onChange={(e) => setSince(parseInputDate(e.target.value))}
              className="rounded-md border border-border-strong/40 bg-surface px-2 py-1 text-xs text-text focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
              aria-label="From date"
            />
          </label>
          <span aria-hidden>—</span>
          <label className="flex items-center gap-1.5">
            <span className="sr-only">To</span>
            <input
              type="date"
              value={toInputDate(until)}
              min={toInputDate(since) || undefined}
              onChange={(e) => setUntil(parseInputDate(e.target.value))}
              className="rounded-md border border-border-strong/40 bg-surface px-2 py-1 text-xs text-text focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
              aria-label="To date"
            />
          </label>
          {filtersActive && (
            <button
              type="button"
              onClick={clearFilters}
              className="rounded-md px-2 py-1 text-xs text-text-muted hover:bg-surface-muted hover:text-text"
            >
              Clear
            </button>
          )}
          {loadedAt && (
            <FreshnessIndicator
              since={loadedAt}
              onRefresh={refresh}
              status={refreshing ? "refreshing" : "idle"}
              compact
            />
          )}
        </div>
      </div>

      {/* ── Body ────────────────────────────────────────────── */}
      {loading ? (
        <TimelineSkeleton />
      ) : filtered.length === 0 ? (
        <EmptyState
          title="Nothing on this slice of the timeline"
          description={
            filtersActive
              ? "Try widening the date range or switching back to All."
              : "Events will appear here as visits, messages, notes, labs, and refills land on this chart."
          }
          primaryAction={
            filtersActive ? (
              <button
                type="button"
                onClick={clearFilters}
                className="rounded-md border border-border-strong/40 bg-surface px-3 py-1.5 text-xs font-medium text-text hover:bg-surface-muted"
              >
                Reset filters
              </button>
            ) : undefined
          }
        />
      ) : (
        <ol className="relative flex flex-col gap-6" aria-live="polite">
          {groups.map((group) => (
            <li key={group.dayKey} className="flex flex-col gap-2">
              <div className="sticky top-0 z-10 -mx-2 bg-surface/85 px-2 py-1 backdrop-blur supports-[backdrop-filter]:bg-surface/70">
                <h3 className="font-display text-[11px] uppercase tracking-[0.12em] text-text-muted">
                  {group.label}
                </h3>
              </div>
              <ul className="relative flex flex-col">
                {/* The hairline rail — sits behind the icon nodes. */}
                <div
                  aria-hidden="true"
                  className="pointer-events-none absolute left-[15px] top-2 bottom-2 w-px bg-border-strong/30"
                />
                {group.items.map((evt) => (
                  <TimelineRow key={evt.id} event={evt} />
                ))}
              </ul>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

function TimelineRow({ event }: { event: PatientActivityEvent }) {
  const style = KIND_STYLES[event.kind] ?? KIND_STYLES.system;
  const body = (
    <div className="group relative flex gap-3 py-2">
      <div
        className={cn(
          "relative z-[1] flex h-[31px] w-[31px] shrink-0 items-center justify-center rounded-full ring-4 ring-surface",
          style.nodeBg,
          style.nodeFg,
        )}
        aria-hidden="true"
      >
        {style.icon}
      </div>
      <div className="min-w-0 flex-1 rounded-lg px-3 py-1.5 transition-colors group-hover:bg-surface-muted/60">
        <div className="flex items-baseline justify-between gap-3">
          <p className="truncate text-sm font-medium text-text">{event.title}</p>
          <time
            dateTime={event.occurredAt}
            title={new Date(event.occurredAt).toLocaleString()}
            className="shrink-0 text-[11px] tabular-nums text-text-muted"
          >
            {formatRelative(event.occurredAt)}
          </time>
        </div>
        {event.description && (
          <p className="mt-0.5 truncate text-xs text-text-muted">{event.description}</p>
        )}
        <p className="mt-0.5 text-[11px] text-text-muted/80">{event.actorLabel}</p>
      </div>
    </div>
  );
  return (
    <li className="list-none">
      {event.href ? (
        <Link
          href={event.href}
          className="block rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
        >
          {body}
        </Link>
      ) : (
        body
      )}
    </li>
  );
}

function TimelineSkeleton() {
  return (
    <div className="flex flex-col gap-6" aria-hidden="true">
      {[0, 1].map((g) => (
        <div key={g} className="flex flex-col gap-2">
          <Skeleton className="h-3 w-20" />
          <div className="relative flex flex-col">
            <div className="pointer-events-none absolute left-[15px] top-2 bottom-2 w-px bg-border-strong/30" />
            {[0, 1, 2].map((i) => (
              <div key={i} className="flex gap-3 py-2">
                <SkeletonCircle size={31} className="ring-4 ring-surface" />
                <div className="flex-1 space-y-1.5 px-3 py-1.5">
                  <Skeleton className="h-3.5 w-2/3" />
                  <Skeleton className="h-3 w-1/2" />
                  <Skeleton className="h-2.5 w-1/4" />
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
