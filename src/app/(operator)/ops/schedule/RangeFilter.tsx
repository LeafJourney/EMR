"use client";

import { useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Popover } from "@/components/ui/popover";
import { DateRangePicker, type DateRange } from "@/components/ui/date-picker";
import { cn } from "@/lib/utils/cn";

// ---------------------------------------------------------------------------
// EMR-930 — Week View date/time-frame filter control.
//
// Lives at the far right of the "Week view" header. Offers preset ranges plus
// a custom range picker. Selection drives the server query window via the URL
// searchParams (?range=… or ?from=&to=), so the server re-runs its appointment
// query for the chosen window.
// ---------------------------------------------------------------------------

export type RangeKey = "week" | "today" | "next-week" | "prev-week" | "custom";

const PRESETS: { key: RangeKey; label: string }[] = [
  { key: "today", label: "Today" },
  { key: "week", label: "This week" },
  { key: "next-week", label: "Next week" },
  { key: "prev-week", label: "Previous week" },
];

export function RangeFilter({
  activeRange,
  activeFrom,
  activeTo,
}: {
  /** Currently-applied range key (custom when explicit from/to in URL). */
  activeRange: RangeKey;
  /** ISO YYYY-MM-DD when a custom range is applied. */
  activeFrom: string | null;
  activeTo: string | null;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [custom, setCustom] = useState<DateRange>({
    from: activeRange === "custom" ? activeFrom : null,
    to: activeRange === "custom" ? activeTo : null,
  });

  function applyPreset(key: RangeKey) {
    const params = new URLSearchParams();
    if (key !== "week") params.set("range", key);
    const qs = params.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname);
    setOpen(false);
  }

  function applyCustom() {
    if (!custom.from || !custom.to) return;
    const params = new URLSearchParams();
    params.set("from", custom.from);
    params.set("to", custom.to);
    router.push(`${pathname}?${params.toString()}`);
    setOpen(false);
  }

  const content = (
    <div className="w-[19rem] space-y-3">
      <div className="grid grid-cols-2 gap-1.5">
        {PRESETS.map((p) => {
          const isActive = activeRange === p.key;
          return (
            <button
              key={p.key}
              type="button"
              onClick={() => applyPreset(p.key)}
              className={cn(
                "rounded-md border px-3 py-2 text-sm font-medium transition-colors text-left",
                isActive
                  ? "border-accent/50 bg-accent-soft text-accent"
                  : "border-border bg-surface text-text hover:bg-surface-muted",
              )}
            >
              {p.label}
            </button>
          );
        })}
      </div>

      <div className="border-t border-border pt-3">
        <p className="text-[11px] font-medium uppercase tracking-wider text-text-subtle mb-2">
          Custom range
        </p>
        <DateRangePicker
          value={custom}
          onChange={setCustom}
          className="w-full"
        />
        <div className="mt-2 flex justify-end">
          <Button
            size="sm"
            variant="primary"
            disabled={!custom.from || !custom.to}
            onClick={applyCustom}
          >
            Apply range
          </Button>
        </div>
      </div>
    </div>
  );

  return (
    <Popover open={open} onOpenChange={setOpen} side="bottom" content={content}>
      <Button
        size="sm"
        variant="secondary"
        leadingIcon={
          <svg
            viewBox="0 0 20 20"
            aria-hidden="true"
            className="h-4 w-4 text-text-subtle"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.75"
          >
            <rect x="3" y="4.5" width="14" height="13" rx="2" />
            <path d="M3 8h14M7 3v3M13 3v3" strokeLinecap="round" />
          </svg>
        }
      >
        Time frame
      </Button>
    </Popover>
  );
}
