"use client";

import { useRouter } from "next/navigation";

interface ToolbarProps {
  practiceId: string;
  versions: { version: number; publishedAt: Date }[];
  fromVersion: number;
  toVersion: number;
  layout: "split" | "unified";
}

export function DiffToolbar({
  practiceId,
  versions,
  fromVersion,
  toVersion,
  layout,
}: ToolbarProps) {
  const router = useRouter();

  function updateQuery(newFrom: number, newTo: number, newLayout: "split" | "unified") {
    router.push(`/practices/${practiceId}/history/diff?from=v${newFrom}&to=v${newTo}&layout=${newLayout}`);
  }

  return (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-xl border border-border/60 bg-surface/80 backdrop-blur-md shadow-sm mb-6">
      <div className="flex items-center gap-2 flex-wrap text-[13px] text-text">
        <span className="font-medium text-text-muted">Compare:</span>
        <select
          value={fromVersion}
          onChange={(e) => updateQuery(Number(e.target.value), toVersion, layout)}
          className="rounded-md border border-border bg-surface px-2 py-1 text-[13px] text-text focus:outline-none focus:ring-1 focus:ring-accent"
        >
          {versions.map((v) => (
            <option key={`from-${v.version}`} value={v.version}>
              v{v.version} ({new Date(v.publishedAt).toLocaleDateString()})
            </option>
          ))}
        </select>
        <span className="text-text-muted">&rarr;</span>
        <select
          value={toVersion}
          onChange={(e) => updateQuery(fromVersion, Number(e.target.value), layout)}
          className="rounded-md border border-border bg-surface px-2 py-1 text-[13px] text-text focus:outline-none focus:ring-1 focus:ring-accent"
        >
          {versions.map((v) => (
            <option key={`to-${v.version}`} value={v.version}>
              v{v.version} ({new Date(v.publishedAt).toLocaleDateString()})
            </option>
          ))}
        </select>
      </div>

      <div className="flex items-center gap-1 bg-surface-muted/50 p-0.5 rounded-lg border border-border/40">
        <button
          type="button"
          onClick={() => updateQuery(fromVersion, toVersion, "split")}
          className={`px-3 py-1 text-[12px] font-medium rounded-md transition-all ${
            layout === "split"
              ? "bg-surface shadow-sm text-text border border-border/40"
              : "text-text-muted hover:text-text"
          }`}
        >
          Side-by-Side
        </button>
        <button
          type="button"
          onClick={() => updateQuery(fromVersion, toVersion, "unified")}
          className={`px-3 py-1 text-[12px] font-medium rounded-md transition-all ${
            layout === "unified"
              ? "bg-surface shadow-sm text-text border border-border/40"
              : "text-text-muted hover:text-text"
          }`}
        >
          Unified
        </button>
      </div>
    </div>
  );
}
