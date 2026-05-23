"use client";

import * as React from "react";
import { useState } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { ModalShell } from "@/components/ui/modal-shell";
import { formatRelative } from "@/lib/utils/format";

export type CallRow = {
  id: string;
  counterparty: string;
  patientId?: string;
  channel: string;
  direction: string;
  startedAt: string;
  status: string;
};

export type FaxRow = {
  id: string;
  toNumber: string;
  patientId?: string;
  patientName?: string;
  direction: string;
  pageCount: number | null;
  createdAt: string;
  status: string;
};

export type BroadcastRow = {
  id: string;
  name: string;
  channel: string;
  recipientCount: number;
  createdAt: string;
  status: string;
};

type ModalItem =
  | { kind: "call"; data: CallRow }
  | { kind: "fax"; data: FaxRow }
  | { kind: "broadcast"; data: BroadcastRow };

function badgeTone(status: string): "success" | "warning" | "danger" | "neutral" | "info" {
  switch (status) {
    case "completed": case "delivered": case "received": return "success";
    case "in_progress": case "ringing": case "initiated": case "queued": case "sending": case "scheduled": return "info";
    case "missed": case "cancelled": return "warning";
    case "failed": return "danger";
    default: return "neutral";
  }
}

const DETAIL_TITLES: Record<ModalItem["kind"], string> = {
  call: "Call details",
  fax: "Fax details",
  broadcast: "Broadcast details",
};

function DetailModal({ item, onClose }: { item: ModalItem; onClose: () => void }) {
  return (
    <ModalShell
      open={true}
      onClose={onClose}
      title={DETAIL_TITLES[item.kind]}
      placement="center"
      maxWidth="max-w-md"
    >
      <div className="px-6 py-5 space-y-4">
        <dl className="space-y-2 text-sm">
          {item.kind === "call" && (
            <>
              <Row label="Party" value={item.data.counterparty} />
              <Row label="Channel" value={item.data.channel} />
              <Row label="Direction" value={item.data.direction} />
              <Row label="Status" value={<Badge tone={badgeTone(item.data.status)}>{item.data.status.replace("_", " ")}</Badge>} />
              <Row label="Time" value={formatRelative(item.data.startedAt)} />
            </>
          )}
          {item.kind === "fax" && (
            <>
              <Row label="Number" value={`${item.data.direction === "outbound" ? "→" : "←"} ${item.data.toNumber}`} />
              {item.data.patientName && <Row label="Patient" value={item.data.patientName} />}
              <Row label="Pages" value={item.data.pageCount ?? "Unknown"} />
              <Row label="Status" value={<Badge tone={badgeTone(item.data.status)}>{item.data.status}</Badge>} />
              <Row label="Time" value={formatRelative(item.data.createdAt)} />
            </>
          )}
          {item.kind === "broadcast" && (
            <>
              <Row label="Name" value={item.data.name} />
              <Row label="Channel" value={item.data.channel.toUpperCase()} />
              <Row label="Recipients" value={item.data.recipientCount} />
              <Row label="Status" value={<Badge tone={badgeTone(item.data.status)}>{item.data.status}</Badge>} />
              <Row label="Created" value={formatRelative(item.data.createdAt)} />
            </>
          )}
        </dl>

        <div className="flex items-center gap-2 pt-2 flex-wrap">
          {item.kind === "call" && item.data.patientId && (
            <Link href={`/clinic/patients/${item.data.patientId}`}>
              <Button size="sm" variant="secondary">View chart</Button>
            </Link>
          )}
          {item.kind === "call" && (
            <Link href="/clinic/communications/transcripts">
              <Button size="sm" variant="secondary">Transcripts</Button>
            </Link>
          )}
          {item.kind === "fax" && (
            <Link href="/clinic/communications/fax">
              <Button size="sm" variant="secondary">Open fax</Button>
            </Link>
          )}
          {item.kind === "broadcast" && (
            <Link href="/clinic/communications/broadcasts">
              <Button size="sm" variant="secondary">Open broadcast</Button>
            </Link>
          )}
          <Button size="sm" variant="ghost" onClick={onClose}>Close</Button>
        </div>
      </div>
    </ModalShell>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2">
      <dt className="w-24 shrink-0 text-text-subtle">{label}</dt>
      <dd className="text-text">{value}</dd>
    </div>
  );
}

export function CommsRecentClient({
  calls,
  faxes,
  broadcasts,
}: {
  calls: CallRow[];
  faxes: FaxRow[];
  broadcasts: BroadcastRow[];
}) {
  const [modal, setModal] = useState<ModalItem | null>(null);

  return (
    <>
      {modal && <DetailModal item={modal} onClose={() => setModal(null)} />}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card tone="raised">
          <CardHeader>
            <CardTitle className="text-base">Recent calls</CardTitle>
            <CardDescription>Last 8 phone or video sessions across the practice.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-1">
            {calls.length === 0 ? (
              <EmptyState
                title="No calls yet today"
                description="Phone and video sessions launched from the inbox or any patient chart will land here automatically."
                className="p-6"
              />
            ) : (
              calls.map((call) => (
                <button
                  key={call.id}
                  type="button"
                  onClick={() => setModal({ kind: "call", data: call })}
                  className="w-full flex items-center justify-between rounded-lg px-3 py-2 text-left hover:bg-surface-muted transition-colors"
                >
                  <div className="min-w-0">
                    <p className="text-sm text-text truncate">{call.counterparty}</p>
                    <p className="text-[11px] text-text-subtle">{call.channel} · {call.direction} · {formatRelative(call.startedAt)}</p>
                  </div>
                  <Badge tone={badgeTone(call.status)}>{call.status.replace("_", " ")}</Badge>
                </button>
              ))
            )}
          </CardContent>
        </Card>

        <Card tone="raised">
          <CardHeader>
            <CardTitle className="text-base">Recent faxes</CardTitle>
            <CardDescription>Inbound + outbound fax activity.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-1">
            {faxes.length === 0 ? (
              <EmptyState
                title="No faxes in flight"
                description="Both inbound and outbound fax activity show up here, with page counts and delivery state."
                className="p-6"
              />
            ) : (
              faxes.map((fax) => (
                <button
                  key={fax.id}
                  type="button"
                  onClick={() => setModal({ kind: "fax", data: fax })}
                  className="w-full flex items-center justify-between rounded-lg px-3 py-2 text-left hover:bg-surface-muted transition-colors"
                >
                  <div className="min-w-0">
                    <p className="text-sm text-text truncate">
                      {fax.direction === "outbound" ? "→ " : "← "}{fax.toNumber}
                      {fax.patientName && <span className="text-text-subtle"> · {fax.patientName}</span>}
                    </p>
                    <p className="text-[11px] text-text-subtle">{fax.pageCount ?? "?"} pages · {formatRelative(fax.createdAt)}</p>
                  </div>
                  <Badge tone={badgeTone(fax.status)}>{fax.status}</Badge>
                </button>
              ))
            )}
          </CardContent>
        </Card>

        <Card tone="raised" className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Recent broadcasts</CardTitle>
            <CardDescription>Latest practice-wide outreach campaigns.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-1">
            {broadcasts.length === 0 ? (
              <EmptyState
                title="No broadcasts yet"
                description="Send your first cohort SMS or email and we'll log delivery, opens, and replies here."
                className="p-6"
              />
            ) : (
              broadcasts.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setModal({ kind: "broadcast", data: c })}
                  className="w-full flex items-center justify-between rounded-lg px-3 py-2 text-left hover:bg-surface-muted transition-colors"
                >
                  <div className="min-w-0">
                    <p className="text-sm text-text truncate">{c.name}</p>
                    <p className="text-[11px] text-text-subtle">{c.channel.toUpperCase()} · {c.recipientCount} recipients · {formatRelative(c.createdAt)}</p>
                  </div>
                  <Badge tone={badgeTone(c.status)}>{c.status}</Badge>
                </button>
              ))
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
