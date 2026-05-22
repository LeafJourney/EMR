// Activity tab — per-practice ControllerAuditLog rows, most recent 100.
// Each row shows actor + action + target + timestamp. The intent is a
// dense, scannable feed that matches the operations rhythm of the rest
// of the super-admin surface.
//
// Lazy-loaded: only invoked when ?tab=activity is in the URL.

import { Badge } from "@/components/ui/badge";
import { loadPracticeAuditLog, type PracticeAuditRow } from "../loaders";

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
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function relative(iso: string): string {
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

export async function ActivityTab({
  organizationId,
}: {
  organizationId: string;
}) {
  const rows = await loadPracticeAuditLog(organizationId, 100);

  if (rows.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border px-6 py-12 text-center">
        <div className="text-sm text-text-muted">
          No controller activity logged for this practice yet.
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="text-[11px] uppercase tracking-wider text-text-muted mb-3">
        Most recent {rows.length} events
      </div>
      <ul className="grid gap-2">
        {rows.map((row) => (
          <ActivityRow key={row.id} row={row} />
        ))}
      </ul>
    </div>
  );
}

function ActivityRow({ row }: { row: PracticeAuditRow }) {
  const actorLabel = row.actorEmail ?? row.actorUserId;
  return (
    <li className="rounded-lg border border-border/70 bg-surface px-4 py-3 flex items-start gap-4">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <code className="text-[12px] font-mono text-text bg-surface-muted px-1.5 py-0.5 rounded">
            {row.action}
          </code>
          {row.actorRoles.map((role) => (
            <Badge key={role} tone={ROLE_TONE[role] ?? "neutral"}>
              {role.replace(/_/g, " ")}
            </Badge>
          ))}
        </div>
        <div className="mt-1.5 text-[12px] text-text-muted truncate">
          <span className="text-text">{actorLabel}</span>
          <span className="mx-1.5">·</span>
          {row.subjectType}
          <span className="mx-1">:</span>
          <code className="font-mono">{row.subjectId}</code>
        </div>
        {row.reason && (
          <div className="mt-1.5 text-[12px] text-text-muted italic truncate">
            {row.reason}
          </div>
        )}
      </div>
      <div className="text-right shrink-0">
        <div
          className="text-[12px] text-text"
          title={formatTimestamp(row.at)}
        >
          {relative(row.at)}
        </div>
        <div className="text-[10px] text-text-muted mt-0.5">
          {new Date(row.at).toLocaleDateString()}
        </div>
      </div>
    </li>
  );
}
