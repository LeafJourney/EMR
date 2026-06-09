"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { flagRefillForProvider, type RefillActionResult } from "./actions";

export interface RefillRow {
  id: string;
  patientId: string;
  patientName: string;
  medicationName: string;
  medicationDosage: string | null;
  requestedQty: number;
  requestedDays: number | null;
  pharmacyName: string;
  status: string;
  copilotSuggestion: string | null;
  rationale: string | null;
  safetyFlags: string[];
  receivedAt: string;
}

const STATUS_TONE: Record<string, React.ComponentProps<typeof Badge>["tone"]> = {
  new: "accent",
  flagged: "warning",
  approved: "success",
  sent: "success",
  denied: "neutral",
};

const SUGGESTION_TONE: Record<string, React.ComponentProps<typeof Badge>["tone"]> = {
  approve: "success",
  deny: "danger",
  review: "warning",
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function RefillsBoard({
  rows,
  canManage,
}: {
  rows: RefillRow[];
  canManage: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();
  const [busyId, setBusyId] = React.useState<string | null>(null);
  const [errors, setErrors] = React.useState<Record<string, string>>({});

  function run(id: string, fn: () => Promise<RefillActionResult>) {
    setBusyId(id);
    setErrors((e) => ({ ...e, [id]: "" }));
    startTransition(async () => {
      const res = await fn();
      if (!res.ok) setErrors((e) => ({ ...e, [id]: res.error }));
      else router.refresh();
      setBusyId(null);
    });
  }

  if (rows.length === 0) {
    return (
      <EmptyState
        title="Queue clear"
        description="No refill requests in this view. New requests appear here as they arrive."
      />
    );
  }

  return (
    <div className="space-y-2">
      {rows.map((r) => {
        const rowBusy = pending && busyId === r.id;
        return (
          <div
            key={r.id}
            className="flex flex-col gap-3 rounded-lg border border-border/60 p-4 md:flex-row md:items-start md:justify-between"
          >
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-medium text-text">
                  {r.medicationName}
                  {r.medicationDosage ? ` · ${r.medicationDosage}` : ""}
                </span>
                <Badge tone={STATUS_TONE[r.status] ?? "neutral"}>{r.status}</Badge>
                {r.copilotSuggestion && (
                  <Badge tone={SUGGESTION_TONE[r.copilotSuggestion] ?? "neutral"}>
                    Copilot: {r.copilotSuggestion}
                  </Badge>
                )}
                {r.safetyFlags.map((flag) => (
                  <Badge key={flag} tone="danger">
                    {flag}
                  </Badge>
                ))}
              </div>
              {r.rationale && (
                <p className="mt-1 text-sm text-text-muted line-clamp-2">{r.rationale}</p>
              )}
              <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-text-subtle">
                <Link
                  href={`/clinic/patients/${r.patientId}`}
                  className="text-accent hover:underline"
                >
                  {r.patientName}
                </Link>
                <span>
                  Qty {r.requestedQty}
                  {r.requestedDays ? ` · ${r.requestedDays}d` : ""}
                </span>
                <span>{r.pharmacyName}</span>
                <span>Received {formatDate(r.receivedAt)}</span>
              </div>
              {errors[r.id] && (
                <p className="mt-2 text-xs text-danger">{errors[r.id]}</p>
              )}
            </div>

            {canManage && r.status === "new" && (
              <div className="shrink-0">
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={rowBusy}
                  onClick={() => run(r.id, () => flagRefillForProvider({ refillId: r.id }))}
                >
                  Flag for provider
                </Button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
