"use client";

import { useMemo, useState, useTransition } from "react";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { cn } from "@/lib/utils/cn";
import { offerSlotAction, removeFromWaitlistAction } from "./actions";

export interface WaitlistRow {
  id: string;
  name: string;
  firstName: string;
  lastName: string;
  location: string;
  joinedAt: string;
  waitDays: number;
  preferredDays: number[];
  preferredWindows: Array<{ startHour: number; endHour: number }>;
  modality: "video" | "phone" | "in_person" | "any";
  urgency: "urgent" | "normal" | "casual";
  lastVisitAt: string | null;
  lastVisitStatus: string | null;
  notifiedAt: string | null;
  attemptCount: number;
}

const URGENCY_TONE: Record<WaitlistRow["urgency"], "danger" | "neutral" | "info"> = {
  urgent: "danger",
  normal: "neutral",
  casual: "info",
};

const DAY_LABEL = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function WaitlistTable({ rows }: { rows: WaitlistRow[] }) {
  const [filter, setFilter] = useState<"all" | "urgent" | "stale">("all");
  const visible = useMemo(() => {
    switch (filter) {
      case "urgent": return rows.filter((r) => r.urgency === "urgent");
      case "stale": return rows.filter((r) => r.waitDays >= 14);
      default: return rows;
    }
  }, [rows, filter]);

  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <FilterChip active={filter === "all"} onClick={() => setFilter("all")} label={`All (${rows.length})`} />
        <FilterChip
          active={filter === "urgent"}
          onClick={() => setFilter("urgent")}
          label={`Urgent (${rows.filter((r) => r.urgency === "urgent").length})`}
        />
        <FilterChip
          active={filter === "stale"}
          onClick={() => setFilter("stale")}
          label={`Waiting 14+ days (${rows.filter((r) => r.waitDays >= 14).length})`}
        />
      </div>
      <div className="rounded-xl border border-border bg-surface overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-surface-muted/50 text-xs uppercase tracking-wider text-text-subtle">
              <Th>Patient</Th>
              <Th>Urgency</Th>
              <Th>Waited</Th>
              <Th>Preferences</Th>
              <Th>Last contact</Th>
              <Th align="right">Actions</Th>
            </tr>
          </thead>
          <tbody>
            {visible.map((r, i) => (
              <Row key={r.id} row={r} stripe={i % 2 === 1} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Th({ children, align }: { children: React.ReactNode; align?: "left" | "right" }) {
  return (
    <th className={cn("px-4 py-2.5 font-medium", align === "right" ? "text-right" : "text-left")}>
      {children}
    </th>
  );
}

function Row({ row, stripe }: { row: WaitlistRow; stripe: boolean }) {
  const [pending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<string | null>(null);

  const confirm = useConfirm();
  const handleOffer = () => {
    setFeedback(null);
    startTransition(async () => {
      const r = await offerSlotAction({ patientId: row.id });
      setFeedback(r.ok ? `Offer sent (${r.batchSize} in this stagger)` : r.error);
    });
  };
  const handleRemove = async () => {
    const ok = await confirm({
      title: `Remove ${row.name} from the waitlist?`,
      description:
        "They'll be taken off the waitlist. You can re-add them later if needed.",
      severity: "danger",
      confirmLabel: "Remove",
    });
    if (!ok) return;
    startTransition(async () => {
      const r = await removeFromWaitlistAction({ patientId: row.id });
      if (!r.ok) setFeedback(r.error);
    });
  };

  return (
    <tr className={cn("border-t border-border/60", stripe && "bg-surface-muted/20")}>
      <td className="px-4 py-3">
        <div className="flex items-center gap-3">
          <Avatar firstName={row.firstName} lastName={row.lastName} size="sm" />
          <div>
            <p className="text-sm text-text font-medium">{row.name}</p>
            <p className="text-[11px] text-text-subtle">{row.location}</p>
          </div>
        </div>
      </td>
      <td className="px-4 py-3">
        <Badge tone={URGENCY_TONE[row.urgency]}>{row.urgency}</Badge>
      </td>
      <td className="px-4 py-3 tabular-nums">
        <p className="text-sm text-text">{row.waitDays}d</p>
        <p className="text-[11px] text-text-subtle">since {formatShortDate(row.joinedAt)}</p>
      </td>
      <td className="px-4 py-3">
        <div className="flex flex-wrap gap-1 mb-1">
          {row.preferredDays.length === 0 ? (
            <span className="text-[11px] text-text-subtle">Any day</span>
          ) : (
            row.preferredDays.map((d) => (
              <Badge key={d} tone="neutral" className="text-[9px]">
                {DAY_LABEL[d]}
              </Badge>
            ))
          )}
        </div>
        <p className="text-[11px] text-text-subtle">
          {row.modality === "any" ? "Any modality" : row.modality.replace("_", " ")}
        </p>
      </td>
      <td className="px-4 py-3">
        {row.notifiedAt ? (
          <>
            <p className="text-xs text-text">{formatShortDate(row.notifiedAt)}</p>
            <p className="text-[11px] text-text-subtle">attempt #{row.attemptCount}</p>
          </>
        ) : (
          <span className="text-[11px] text-text-subtle">Never offered</span>
        )}
      </td>
      <td className="px-4 py-3 text-right">
        <div className="flex items-center justify-end gap-2">
          <Button size="sm" variant="secondary" onClick={handleRemove} disabled={pending}>
            Remove
          </Button>
          <Button size="sm" onClick={handleOffer} disabled={pending}>
            {pending ? "…" : "Offer next slot"}
          </Button>
        </div>
        {feedback && <p className="text-[11px] text-text-subtle mt-1.5">{feedback}</p>}
      </td>
    </tr>
  );
}

function FilterChip({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "px-3 h-8 rounded-full border text-xs transition-colors",
        active
          ? "bg-accent text-accent-ink border-accent"
          : "bg-surface text-text-muted border-border-strong/50 hover:border-accent/40",
      )}
    >
      {label}
    </button>
  );
}

function formatShortDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}
