"use client";

// EMR-588 — Confidential clinician-only notes tab.
//
// Lives inside the chart, but everything in this surface screams "not
// in the legal chart": shield-lock icon, danger-tinted header banner,
// inline reminder above the composer, "Private — not in chart" badge
// on every entry. The composer is a single textarea (no formatting
// chrome, no AI autofill button) — Doc 1/Doc 3 rule: Objective and
// private notes are human-authored only.
//
// Authoring requires notes.edit; the parent page also gates the entire
// tab render on canViewSection(notes), so a front-office user never
// reaches this client component.

import * as React from "react";
import { ShieldAlert, Lock } from "lucide-react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DictationTextarea } from "@/components/ui/dictation-input";
import { EmptyState } from "@/components/ui/empty-state";
import { LinkifiedText } from "@/components/ui/linkified-text";
import { formatRelative } from "@/lib/utils/format";
import { addPrivateNote, type PrivateNote } from "./private-notes-actions";

interface PrivateNotesTabProps {
  patientId: string;
  notes: PrivateNote[];
  /** True when the current user has notes.edit. Read-only callers (back-office) see view-only. */
  canAuthor: boolean;
  patientFirstName: string;
}

const MAX_LEN = 4000;

export function PrivateNotesTab({
  patientId,
  notes: initialNotes,
  canAuthor,
  patientFirstName,
}: PrivateNotesTabProps) {
  const [notes, setNotes] = React.useState<PrivateNote[]>(initialNotes);
  const [draft, setDraft] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [isPending, startTransition] = React.useTransition();

  const submit = () => {
    const body = draft.trim();
    if (!body) {
      setError("Note can't be empty.");
      return;
    }
    setError(null);
    startTransition(async () => {
      const res = await addPrivateNote(patientId, body);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      // Optimistically prepend so the new entry is visible before the
      // next server render lands. The revalidate in the action will
      // overwrite this with the canonical row on refresh.
      setNotes((prev) => [
        {
          id: `temp-${Date.now()}`,
          body,
          authorName: "You",
          createdAt: new Date().toISOString(),
        },
        ...prev,
      ]);
      setDraft("");
    });
  };

  return (
    <section className="space-y-6">
      {/* Confidentiality banner — load-bearing UI affordance. Renders
          first and uses the danger token so a clinician opening the tab
          can't mistake this for a regular chart section. */}
      <div
        className="flex items-start gap-3 rounded-lg border border-danger/40 bg-danger/5 px-4 py-3"
        role="note"
        aria-label="Confidentiality notice"
      >
        <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-danger" aria-hidden />
        <div className="text-sm leading-relaxed">
          <p className="font-medium text-text">
            Private provider notes — not in {patientFirstName || "this patient"}'s chart
          </p>
          <p className="mt-1 text-text-subtle">
            Visible to providers only. Never shown on the patient portal and
            excluded from chart exports and records-release packets. Use for
            safety, interpersonal context, and private impressions that should
            stay out of the legal record. All access is audit-logged.
          </p>
        </div>
      </div>

      {canAuthor && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Lock className="h-4 w-4 text-text-subtle" aria-hidden />
              Add a private note
            </CardTitle>
            <CardDescription>
              Human-authored only. No AI autofill. Stays out of the chart.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {/* Dictation is the clinician's own voice → still
                strictly human-authored, which is the load-bearing rule
                here ("No AI autofill"). The mic button hands raw
                transcription back; no model rewrites the text. */}
            <DictationTextarea
              value={draft}
              onChange={(next) => {
                setDraft(next);
                if (error) setError(null);
              }}
              placeholder="e.g. Patient has shown escalating verbal aggression toward intake staff — flag for safety pairing on next visit."
              rows={4}
              maxLength={MAX_LEN}
              className="w-full rounded-md border border-border bg-surface px-3 py-2 text-sm focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
              aria-label="Private clinician note"
              aria-invalid={error ? "true" : "false"}
              disabled={isPending}
              dictateLabel="Dictate private note"
            />
            <div className="flex items-center justify-between gap-3">
              <span className="text-xs text-text-subtle">
                {draft.length}/{MAX_LEN}
              </span>
              <Button onClick={submit} disabled={isPending || draft.trim().length === 0}>
                {isPending ? "Saving…" : "Save private note"}
              </Button>
            </div>
            {error && (
              <p role="alert" className="text-sm text-danger">
                {error}
              </p>
            )}
          </CardContent>
        </Card>
      )}

      <div className="space-y-3">
        <h3 className="text-sm font-medium text-text-subtle">
          {notes.length === 0
            ? "No private notes"
            : `${notes.length} private note${notes.length === 1 ? "" : "s"}`}
        </h3>
        {notes.length === 0 ? (
          <EmptyState
            title="Nothing here yet"
            description={
              canAuthor
                ? "Add safety context or private impressions above. They stay outside the legal chart."
                : "No private notes have been added for this patient."
            }
          />
        ) : (
          <ul className="space-y-2">
            {notes.map((n) => (
              <li
                key={n.id}
                className="rounded-lg border border-border bg-surface px-4 py-3"
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2 text-xs text-text-subtle">
                    <Badge tone="danger">
                      <Lock className="h-3 w-3" aria-hidden />
                      Private — not in chart
                    </Badge>
                    <span>{n.authorName}</span>
                    <span aria-hidden>·</span>
                    <span>{formatRelative(n.createdAt)}</span>
                  </div>
                </div>
                <LinkifiedText
                  as="p"
                  className="mt-2 whitespace-pre-wrap text-sm text-text"
                  text={n.body}
                />
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
