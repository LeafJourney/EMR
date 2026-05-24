"use client";

import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils/cn";
import { DataTable, type ColumnDef } from "@/components/ui/data-table";
import {
  type CmeCredit,
  type CmeBoard,
  type ResearchSession,
  type CmeLedgerSnapshot,
  attestCredit,
  submitCredit,
  formatCreditHours,
} from "@/lib/domain/provider-cme";

const BOARDS: CmeBoard[] = ["AMA", "AOA", "ACCME", "STATE"];

const STATUS_TONE: Record<CmeCredit["status"], "neutral" | "accent" | "warning" | "success"> = {
  pending: "warning",
  earned: "accent",
  submitted: "neutral",
  verified: "success",
  voided: "neutral",
};

export function CmeLedgerView({
  sessions,
  credits: initial,
  snapshot,
}: {
  sessions: ResearchSession[];
  credits: CmeCredit[];
  snapshot: CmeLedgerSnapshot;
}) {
  const [credits, setCredits] = useState<CmeCredit[]>(initial);

  const sessionById = useMemo(() => {
    const m = new Map<string, ResearchSession>();
    for (const s of sessions) m.set(s.id, s);
    return m;
  }, [sessions]);

  function attest(id: string) {
    setCredits((prev) => prev.map((c) => (c.id === id ? attestCredit(c) : c)));
  }
  function submit(id: string, board: CmeBoard) {
    setCredits((prev) => prev.map((c) => (c.id === id ? submitCredit(c, board) : c)));
  }

  const live = useMemo(() => {
    let earnedMin = 0;
    let submittedMin = 0;
    for (const c of credits) {
      if (c.status === "voided") continue;
      if (c.status === "submitted" || c.status === "verified") submittedMin += c.creditMinutes;
      if (c.status === "earned" || c.status === "pending") earnedMin += c.creditMinutes;
    }
    return { earnedMin, submittedMin };
  }, [credits]);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KpiTile label="YTD credits" value={`${snapshot.ytdCreditHours.toFixed(2)}`} hint="Year to date" />
        <KpiTile label="Lifetime credits" value={`${snapshot.totalCreditHours.toFixed(2)}`} />
        <KpiTile label="Pending attestation" value={(live.earnedMin / 60).toFixed(2)} hint="Click attest to earn" />
        <KpiTile label="Submitted to board" value={(live.submittedMin / 60).toFixed(2)} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Research sessions</CardTitle>
        </CardHeader>
        <CardContent className="px-0 sm:px-0">
          <CreditsTable
            credits={credits}
            sessionById={sessionById}
            attest={attest}
            submit={submit}
          />
        </CardContent>
      </Card>

      <Card tone="ambient">
        <CardContent className="py-6">
          <p className="text-xs uppercase tracking-wider text-text-subtle">Annual summary</p>
          <p className="text-sm text-text mt-1">
            We compile a year-end summary PDF of every credit earned, attested, and submitted — annotated with your NPI and
            state license — for license renewal documentation.
          </p>
          <div className="mt-3">
            <Button size="sm" variant="secondary" onClick={() => window.print()}>
              Download {new Date().getUTCFullYear()} summary
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------- credits table
//
// Pulled out into its own component so the column defs (and the
// per-credit derived fields like "engaged minutes") can live behind a
// single useMemo without crowding the host view.

function CreditsTable({
  credits,
  sessionById,
  attest,
  submit,
}: {
  credits: CmeCredit[];
  sessionById: Map<string, ResearchSession>;
  attest: (id: string) => void;
  submit: (id: string, board: CmeBoard) => void;
}) {
  type Row = CmeCredit & { _minutes: number; _refs: number | null };
  const rows: Row[] = useMemo(
    () =>
      credits.map((c) => {
        const s = sessionById.get(c.sessionId);
        const minutes = s
          ? Math.round(
              (new Date(s.endedAt).getTime() - new Date(s.startedAt).getTime()) / 60000,
            )
          : 0;
        return { ...c, _minutes: minutes, _refs: s?.referencesViewed ?? null };
      }),
    [credits, sessionById],
  );

  const columns: ColumnDef<Row>[] = [
    {
      key: "topic",
      label: "Topic",
      sortable: true,
      sortFn: (a, b) => a.topic.localeCompare(b.topic),
      cell: (c) => (
        <>
          <p className="text-text">{c.topic}</p>
          <p className="text-[11px] text-text-subtle font-mono">
            {c.attestationHash.slice(0, 12)}…
          </p>
        </>
      ),
    },
    {
      key: "_minutes",
      label: "Engaged",
      sortable: true,
      align: "right",
      cell: (c) => <span className="text-text-muted">{c._minutes}m</span>,
    },
    {
      key: "_refs",
      label: "Refs",
      sortable: true,
      align: "right",
      hideOnMobile: true,
      cell: (c) => (
        <span className="text-text-muted">{c._refs ?? "—"}</span>
      ),
    },
    {
      key: "creditMinutes",
      label: "Credit",
      sortable: true,
      align: "right",
      cell: (c) =>
        c.creditMinutes === 0 ? (
          <span className="text-[11px] text-text-subtle">below floor</span>
        ) : (
          <span className="text-text-muted">{formatCreditHours(c.creditMinutes)}</span>
        ),
    },
    {
      key: "status",
      label: "Status",
      sortable: true,
      sortFn: (a, b) => a.status.localeCompare(b.status),
      cell: (c) => <Badge tone={STATUS_TONE[c.status]}>{c.status}</Badge>,
    },
    {
      key: "action",
      label: "Action",
      align: "right",
      cell: (c) => (
        <>
          {c.status === "pending" && c.creditMinutes > 0 && (
            <Button size="sm" variant="secondary" onClick={() => attest(c.id)}>
              Attest
            </Button>
          )}
          {c.status === "earned" && (
            <SubmitMenu onSubmit={(b) => submit(c.id, b)} />
          )}
          {(c.status === "submitted" || c.status === "verified") && (
            <span className="text-[11px] text-text-subtle">to {c.submittedTo}</span>
          )}
        </>
      ),
    },
  ];

  return (
    <DataTable<Row>
      columns={columns}
      rows={rows}
      rowKey={(c) => c.id}
      ariaLabel="CME credits"
      className="border-0 rounded-none shadow-none"
    />
  );
}

function SubmitMenu({ onSubmit }: { onSubmit: (b: CmeBoard) => void }) {
  return (
    <select
      defaultValue=""
      onChange={(e) => {
        const v = e.target.value as CmeBoard | "";
        if (v) onSubmit(v);
      }}
      className={cn("rounded-md border border-border-strong bg-surface px-2 h-8 text-xs text-text-muted")}
    >
      <option value="">Submit to…</option>
      {BOARDS.map((b) => (
        <option key={b} value={b}>
          {b}
        </option>
      ))}
    </select>
  );
}

function KpiTile({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <Card>
      <CardContent className="py-4">
        <p className="text-[11px] uppercase tracking-wider text-text-subtle">{label}</p>
        <p className="font-display text-2xl text-text mt-1 tabular-nums">{value}</p>
        {hint && <p className="text-[11px] text-text-subtle mt-1">{hint}</p>}
      </CardContent>
    </Card>
  );
}
