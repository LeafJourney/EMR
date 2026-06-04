"use client";

import * as React from "react";
import { useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Popover } from "@/components/ui/popover";
import { cn } from "@/lib/utils/cn";

// ---------------------------------------------------------------------------
// Aging filter bubbles (EMR-961)
//
// Three click-dropdown "bubbles" that drive the server-rendered worklist via
// URL query params. All data fetching/filtering stays in the server page.tsx;
// this component only navigates.
//
//   • All        → type:  all | insurance | patient
//   • Days       → days:  <bucket key> (synced with ?bucket= bars)
//   • % recover. → recoverable: 0-25 | 26-50 | 51-75 | 76-100
//
// The Days bubble writes the canonical `days` param which the server treats
// as equivalent to `bucket`; selecting a bucket bar (?bucket=) is reflected
// back into this bubble's label via the resolved `days` prop.
// ---------------------------------------------------------------------------

export const RECOVERABLE_OPTIONS = [
  { value: "0-25", label: "0–25%", min: 0, max: 25 },
  { value: "26-50", label: "26–50%", min: 26, max: 50 },
  { value: "51-75", label: "51–75%", min: 51, max: 75 },
  { value: "76-100", label: "76–100%", min: 76, max: 100 },
] as const;

export type RecoverableValue = (typeof RECOVERABLE_OPTIONS)[number]["value"];

type DayOption = { value: string; label: string };

const TYPE_OPTIONS: { value: string; label: string }[] = [
  { value: "all", label: "All" },
  { value: "insurance", label: "Insurance only" },
  { value: "patient", label: "Patient only" },
];

export function AgingFilters({
  type,
  days,
  recoverable,
  dayOptions,
}: {
  /** all | insurance | patient (the non-"days" type focus) */
  type: string;
  /** active days/bucket key, or null */
  days: string | null;
  /** active % recoverable band, or null */
  recoverable: string | null;
  /** day range options sourced from the page's bucket labels */
  dayOptions: DayOption[];
}) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const navigate = useCallback(
    (mutate: (params: URLSearchParams) => void) => {
      const params = new URLSearchParams(searchParams.toString());
      mutate(params);
      const qs = params.toString();
      router.push(qs ? `/ops/aging?${qs}` : "/ops/aging");
    },
    [router, searchParams],
  );

  const setType = (value: string) =>
    navigate((p) => {
      if (value === "all") p.delete("type");
      else p.set("type", value);
    });

  const setDays = (value: string | null) =>
    navigate((p) => {
      // Days and bucket are the same dimension — keep them in lockstep.
      p.delete("bucket");
      if (value === null) p.delete("days");
      else p.set("days", value);
    });

  const setRecoverable = (value: string | null) =>
    navigate((p) => {
      if (value === null) p.delete("recoverable");
      else p.set("recoverable", value);
    });

  const typeLabel =
    type === "insurance"
      ? "Insurance only"
      : type === "patient"
        ? "Patient only"
        : "All";
  const daysLabel = days
    ? (dayOptions.find((d) => d.value === days)?.label ?? days)
    : "Days";
  const recoverableLabel = recoverable
    ? (RECOVERABLE_OPTIONS.find((o) => o.value === recoverable)?.label ??
      recoverable)
    : "% recoverable";

  return (
    <div className="flex flex-wrap items-center gap-2 mb-6">
      <span className="text-[10px] uppercase tracking-wider text-text-subtle mr-2">
        Filter:
      </span>

      {/* All / Insurance / Patient */}
      <Popover
        side="bottom"
        content={
          <MenuList>
            {TYPE_OPTIONS.map((opt) => (
              <MenuItem
                key={opt.value}
                label={opt.label}
                active={type === opt.value}
                onClick={() => setType(opt.value)}
              />
            ))}
          </MenuList>
        }
      >
        <Bubble active={type !== "all"} label={typeLabel} />
      </Popover>

      {/* Days */}
      <Popover
        side="bottom"
        content={
          <MenuList>
            <MenuItem
              label="Any age"
              active={!days}
              onClick={() => setDays(null)}
            />
            {dayOptions.map((opt) => (
              <MenuItem
                key={opt.value}
                label={opt.label}
                active={days === opt.value}
                onClick={() => setDays(opt.value)}
              />
            ))}
          </MenuList>
        }
      >
        <Bubble active={!!days} label={daysLabel} />
      </Popover>

      {/* % recoverable */}
      <Popover
        side="bottom"
        content={
          <MenuList>
            <MenuItem
              label="Any"
              active={!recoverable}
              onClick={() => setRecoverable(null)}
            />
            {RECOVERABLE_OPTIONS.map((opt) => (
              <MenuItem
                key={opt.value}
                label={opt.label}
                active={recoverable === opt.value}
                onClick={() => setRecoverable(opt.value)}
              />
            ))}
          </MenuList>
        }
      >
        <Bubble active={!!recoverable} label={recoverableLabel} />
      </Popover>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Presentational bits
// ---------------------------------------------------------------------------

function Bubble({ label, active }: { label: string; active: boolean }) {
  return (
    <button
      type="button"
      className={cn(
        "inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-medium transition-all",
        active
          ? "bg-accent text-accent-ink"
          : "bg-surface-muted text-text-muted hover:bg-surface-raised border border-border",
      )}
    >
      {label}
      <span aria-hidden className="text-[9px] opacity-70">
        ▾
      </span>
    </button>
  );
}

function MenuList({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-col gap-0.5 min-w-[10rem]">{children}</div>;
}

function MenuItem({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex items-center justify-between gap-3 rounded-md px-2.5 py-1.5 text-left text-xs transition-colors",
        active
          ? "bg-accent-soft text-text font-medium"
          : "text-text-muted hover:bg-surface-muted hover:text-text",
      )}
    >
      <span>{label}</span>
      {active && (
        <span aria-hidden className="text-accent text-[11px]">
          ✓
        </span>
      )}
    </button>
  );
}
