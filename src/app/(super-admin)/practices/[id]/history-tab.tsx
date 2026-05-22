// EMR-743 — History tab. Vertical timeline of ControllerAuditLog rows for a
// single practice, most-recent first, cursor-paged via the URL.
//
// Server component. The loader (`loadPracticeHistoryPage`) lives in
// practices/loaders.ts so the cursor query stays out of the React tree.
// Pagination is plain `?historyCursor=…` on the same page route — no
// client fetch, no React state. "Load more" is a `<Link>` that the parent
// page resolves on the next request.
//
// Field-level diffs live behind a native `<details>` so we don't need any
// client JS to expand them. The "open diff viewer" + "compare arbitrary
// versions" affordances are referenced as TODOs (EMR-744) — we stub the
// targets so the UI converges on the same anchor when that ticket ships.

import Link from "next/link";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils/cn";

import {
  loadPracticeHistoryPage,
  type PracticeHistoryRow,
} from "../loaders";
import { humanizeAction, summarizeChange } from "./history-humanize";
import { RollbackButton } from "./rollback-button";

const ROLE_TONE: Record<string, "accent" | "info" | "neutral" | "warning"> = {
  super_admin: "accent",
  practice_admin: "info",
  practice_owner: "info",
  operator: "neutral",
  implementation_admin: "warning",
  clinician: "neutral",
  patient: "neutral",
  system: "neutral",
};

function formatTimestamp(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatRelative(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const sec = Math.floor(diffMs / 1000);
  if (sec < 60) return `${sec}s ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day < 30) return `${day}d ago`;
  const mo = Math.floor(day / 30);
  if (mo < 12) return `${mo}mo ago`;
  return `${Math.floor(mo / 12)}y ago`;
}

export async function HistoryTab({
  practiceRouteId,
  organizationId,
  configurationId,
  practiceName,
  alsoSubjectIds,
  cursor,
}: {
  /** The `[id]` from the URL (config id OR org id) — used to build paging links. */
  practiceRouteId: string;
  organizationId: string;
  /** PracticeConfiguration id used by the rollback action. May be null
   *  for orgs that don't yet have a configuration row. */
  configurationId: string | null;
  /** Verbatim practice name — used by the rollback double-confirm. */
  practiceName: string;
  alsoSubjectIds?: string[];
  cursor?: string | null;
}) {
  const { rows, nextCursor } = await loadPracticeHistoryPage({
    organizationId,
    alsoSubjectIds,
    cursor: cursor ?? null,
  });

  if (rows.length === 0 && !cursor) {
    return (
      <div className="rounded-xl border border-dashed border-border px-6 py-12 text-center">
        <div className="font-display text-base text-text tracking-tight">
          No changes yet
        </div>
        <div className="mt-1.5 text-[12px] text-text-muted">
          This practice has only the initial configuration. New mutations
          will surface here as a versioned timeline.
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-baseline justify-between gap-4 mb-3">
        <div className="text-[11px] uppercase tracking-wider text-text-muted">
          Configuration history
        </div>
        {/* EMR-746 — entry point into the semantic diff viewer.
            Defaults to v1 → v2; the diff route renders a "No semantic
            differences" empty state when either side doesn't exist. */}
        <Link
          href={`/practices/${practiceRouteId}/history/diff?from=v1&to=v2`}
          className="text-[11px] text-text-muted hover:text-text underline-offset-2 hover:underline"
        >
          Compare versions
        </Link>
      </div>

      <ol className="relative pl-5">
        <span
          aria-hidden="true"
          className="absolute left-1.5 top-1.5 bottom-1.5 w-px bg-border/70"
        />
        {rows.map((row) => (
          <HistoryEntry
            key={row.id}
            row={row}
            configurationId={configurationId}
            practiceName={practiceName}
          />
        ))}
      </ol>

      {nextCursor && (
        <div className="mt-6 flex justify-center">
          <Link
            href={`/practices/${practiceRouteId}?tab=history&historyCursor=${encodeURIComponent(
              nextCursor,
            )}`}
            scroll={false}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full border border-border bg-surface px-4 py-2",
              "text-[12px] text-text hover:bg-surface-muted transition-colors",
              "focus:outline-none focus-visible:ring-2 focus-visible:ring-accent",
            )}
          >
            Load earlier history
          </Link>
        </div>
      )}
    </div>
  );
}

function HistoryEntry({
  row,
  configurationId,
  practiceName,
}: {
  row: PracticeHistoryRow;
  configurationId: string | null;
  practiceName: string;
}) {
  const headline = humanizeAction(row.action);
  const summary = summarizeChange(
    row.before as Record<string, unknown> | null,
    row.after as Record<string, unknown> | null,
  );
  const actorLabel = row.actorEmail ?? row.actorUserId;
  const hasDetails = row.before != null || row.after != null;

  // EMR-748 — only publish events with a numeric version on the after
  // snapshot are rollback-targets.
  const after = row.after as { version?: unknown } | null | undefined;
  const targetVersion =
    row.action === "controller.config.publish" &&
    after &&
    typeof after.version === "number"
      ? (after.version as number)
      : null;
  const canRollback = Boolean(targetVersion && configurationId);

  return (
    <li className="relative pb-5 last:pb-0">
      <span
        aria-hidden="true"
        className="absolute -left-[14px] top-[6px] h-2 w-2 rounded-full bg-accent ring-4 ring-bg"
      />
      <div className="rounded-lg border border-border/70 bg-surface px-4 py-3">
        <div className="flex items-baseline justify-between gap-4 flex-wrap">
          <div className="min-w-0">
            <div className="font-display text-[14px] text-text tracking-tight">
              {headline}
            </div>
            {summary && (
              <div className="mt-1 text-[12px] text-text-muted">
                {summary}
              </div>
            )}
          </div>
          <div className="text-right shrink-0">
            <div
              className="text-[12px] text-text"
              title={formatTimestamp(row.at)}
            >
              {formatRelative(row.at)}
            </div>
            <div className="text-[10px] text-text-muted mt-0.5">
              {new Date(row.at).toLocaleDateString()}
            </div>
          </div>
        </div>

        <div className="mt-2 flex items-center gap-2 flex-wrap">
          <span className="text-[12px] text-text">{actorLabel}</span>
          {row.actorRoles.map((role) => (
            <Badge key={role} tone={ROLE_TONE[role] ?? "neutral"}>
              {role.replace(/_/g, " ")}
            </Badge>
          ))}
          <code className="text-[11px] font-mono text-text-muted bg-surface-muted px-1.5 py-0.5 rounded">
            {row.action}
          </code>
        </div>

        {row.reason && (
          <div className="mt-2 text-[12px] text-text-muted italic">
            “{row.reason}”
          </div>
        )}

        {canRollback && targetVersion != null && configurationId && (
          <div className="mt-2 flex justify-end">
            <RollbackButton
              configurationId={configurationId}
              targetVersion={targetVersion}
              practiceName={practiceName}
            />
          </div>
        )}

        {hasDetails && (
          <details className="mt-3 group">
            <summary className="cursor-pointer text-[11px] uppercase tracking-wider text-text-muted hover:text-text select-none list-none flex items-center gap-1.5">
              <span className="inline-block transition-transform group-open:rotate-90">
                ›
              </span>
              Expand details
            </summary>
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              <SnapshotBlock label="Before" value={row.before} />
              <SnapshotBlock label="After" value={row.after} />
            </div>
          </details>
        )}
      </div>
    </li>
  );
}

function SnapshotBlock({
  label,
  value,
}: {
  label: string;
  value: unknown;
}) {
  return (
    <div className="rounded-md border border-border/60 bg-surface-muted/40 p-2">
      <div className="text-[10px] uppercase tracking-wider text-text-muted mb-1">
        {label}
      </div>
      <pre className="text-[11px] font-mono text-text whitespace-pre-wrap break-words max-h-48 overflow-auto">
        {value == null ? "—" : JSON.stringify(value, null, 2)}
      </pre>
    </div>
  );
}
