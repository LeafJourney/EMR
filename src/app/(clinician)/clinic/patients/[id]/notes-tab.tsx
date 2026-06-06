"use client";

/**
 * Notes tab (EMR-861).
 *
 * Only provider-authored LeafJourney notes — a quick place to clear drafts,
 * pending attestations, and chart notes. Two-pane layout: chronological list
 * on the left, the full note on the right (opened for section-by-section
 * editing via the note editor). The tab's hover summary (handled by the
 * chart rail) reports pending notes + pending attestations.
 */

import * as React from "react";
import Link from "next/link";
import { cn } from "@/lib/utils/cn";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Bubble } from "./chart-kit";

export interface NoteLite {
  id: string;
  status: string;
  aiDrafted: boolean;
  title: string;
  reason: string;
  createdAt: string;
  preview: string;
  pendingAttestation: boolean;
}

function statusTone(status: string): "active" | "mild" | "beige" {
  if (status === "finalized" || status === "amended") return "active";
  if (status === "needs_review") return "mild";
  return "beige";
}

export function NotesTab({
  patientId,
  notes,
  startVisitAction,
  scribeProcessing = false,
}: {
  patientId: string;
  notes: NoteLite[];
  startVisitAction: () => Promise<void>;
  scribeProcessing?: boolean;
}) {
  const [selectedId, setSelectedId] = React.useState<string | null>(
    notes[0]?.id ?? null,
  );
  const selected = notes.find((n) => n.id === selectedId) ?? null;

  const pendingNotes = notes.filter(
    (n) => n.status !== "finalized" && n.status !== "amended",
  ).length;
  const pendingAttestations = notes.filter((n) => n.pendingAttestation).length;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between mb-1 gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <h2 className="font-display text-xl text-text tracking-tight">Notes</h2>
          <span className="text-[11px] text-text-subtle">
            {pendingNotes} note{pendingNotes === 1 ? "" : "s"} pending ·{" "}
            {pendingAttestations} attestation{pendingAttestations === 1 ? "" : "s"} pending
          </span>
        </div>
        <form action={startVisitAction}>
          <Button type="submit" size="sm">
            Draft a note
          </Button>
        </form>
      </div>

      {scribeProcessing && notes.length === 0 && (
        <Card tone="raised" className="border-l-4 border-l-accent">
          <CardContent className="py-5 flex items-center gap-3">
            <div className="h-5 w-5 rounded-full border-2 border-accent border-t-transparent animate-spin shrink-0" />
            <p className="text-sm text-text">The scribe is drafting your note…</p>
          </CardContent>
        </Card>
      )}

      {notes.length === 0 ? (
        !scribeProcessing && (
          <EmptyState
            title="No clinical notes yet"
            description="Start a visit to generate the first draft."
          />
        )
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Left pane: chronological list */}
          <div className="md:col-span-1 rounded-lg border border-border divide-y divide-border/50 overflow-hidden max-h-[60vh] overflow-y-auto">
            {notes.map((n) => (
              <button
                key={n.id}
                type="button"
                onClick={() => setSelectedId(n.id)}
                className={cn(
                  "w-full text-left px-3 py-2.5 hover:bg-surface-muted/60 transition-colors",
                  selectedId === n.id && "bg-accent-soft",
                )}
              >
                <div className="flex items-center justify-between gap-2 mb-0.5">
                  <span className="text-sm font-medium text-text truncate">
                    {n.title}
                  </span>
                  <span className="text-[10px] text-text-subtle tabular-nums shrink-0">
                    {new Date(n.createdAt).toLocaleDateString()}
                  </span>
                </div>
                <div className="flex items-center gap-1">
                  <Bubble tone={statusTone(n.status)}>{n.status}</Bubble>
                  {n.aiDrafted && <Bubble tone="info">AI draft</Bubble>}
                </div>
              </button>
            ))}
          </div>

          {/* Right pane: full note */}
          <div className="md:col-span-2">
            {selected ? (
              <Card tone="raised">
                <CardContent className="pt-5 pb-5 space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h3 className="font-display text-lg text-text">{selected.title}</h3>
                      <p className="text-xs text-text-muted">
                        {selected.reason} ·{" "}
                        {new Date(selected.createdAt).toLocaleString()}
                      </p>
                    </div>
                    <Link href={`/clinic/patients/${patientId}/notes/${selected.id}`}>
                      <Button variant="secondary" size="sm">
                        Open to edit
                      </Button>
                    </Link>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Bubble tone={statusTone(selected.status)}>{selected.status}</Bubble>
                    {selected.pendingAttestation && (
                      <Bubble tone="mild">Attestation pending</Bubble>
                    )}
                  </div>
                  <p className="text-sm text-text-muted leading-relaxed whitespace-pre-wrap">
                    {selected.preview || "Open the note to view and edit each section."}
                  </p>
                </CardContent>
              </Card>
            ) : (
              <Card tone="outlined">
                <CardContent className="py-10 text-center text-sm text-text-muted">
                  Select a note from the list.
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
