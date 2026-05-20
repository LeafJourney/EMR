// Server-rendered tab bar driven by the `?tab=` URL search param.
//
// We intentionally keep this server-only so the drill-in page can use
// server components throughout and each tab can lazy-load its data on
// selection rather than fetching everything up front (per AC). EMR-743
// promoted the History tab from a "Soon" placeholder to a real link.

import Link from "next/link";
import { cn } from "@/lib/utils/cn";

export type TabKey =
  | "overview"
  | "providers"
  | "activity"
  | "billing"
  | "costs"
  | "history";

export const TAB_KEYS: TabKey[] = [
  "overview",
  "providers",
  "activity",
  "billing",
  "costs",
  "history",
];

const TAB_LABELS: Record<TabKey, string> = {
  overview: "Overview",
  providers: "Providers",
  activity: "Activity",
  billing: "Billing",
  costs: "Costs",
  history: "History",
};

export function isTabKey(value: string | undefined): value is TabKey {
  return !!value && (TAB_KEYS as string[]).includes(value);
}

export function TabBar({
  practiceId,
  active,
}: {
  practiceId: string;
  active: TabKey;
}) {
  return (
    <div
      className="flex items-center gap-1 border-b border-border mb-6 overflow-x-auto"
      role="tablist"
      aria-label="Practice tabs"
    >
      {TAB_KEYS.map((key) => {
        const isActive = key === active;
        const base =
          "relative px-4 py-3 text-sm font-medium transition-colors whitespace-nowrap focus:outline-none focus-visible:ring-2 focus-visible:ring-accent rounded-t-md";

        return (
          <Link
            key={key}
            href={`/practices/${practiceId}?tab=${key}`}
            role="tab"
            aria-selected={isActive}
            scroll={false}
            className={cn(
              base,
              isActive
                ? "text-accent"
                : "text-text-muted hover:text-text",
            )}
          >
            {TAB_LABELS[key]}
            {isActive && (
              <span className="absolute bottom-0 left-3 right-3 h-0.5 bg-accent rounded-full" />
            )}
          </Link>
        );
      })}
    </div>
  );
}
