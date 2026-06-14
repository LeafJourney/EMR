"use client";

import * as React from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AvsSummaryView } from "@/components/avs/AvsSummaryView";
import {
  getAvsForNote,
  regenerateAvsForNote,
  releaseAvsForNote,
  type AvsSummaryData,
} from "./avs-actions";

const LANGUAGE_LABEL: Record<string, string> = { en: "English", es: "Spanish", vi: "Vietnamese" };

// EMR-1152 — inline (no-popup) provider surface: side-by-side source-note vs
// generated summary, with a release that's blocked until the provider affirms
// the summary matches the note. One click after that delivers it to the portal.
export function AvsReviewPanel({ noteId }: { noteId: string }) {
  const [summary, setSummary] = React.useState<AvsSummaryData | null>(null);
  const [loaded, setLoaded] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [verified, setVerified] = React.useState(false);
  const [pending, startTransition] = React.useTransition();

  React.useEffect(() => {
    let active = true;
    getAvsForNote(noteId).then((res) => {
      if (!active) return;
      if (res.ok) setSummary(res.summary);
      else setError(res.error);
      setLoaded(true);
    });
    return () => {
      active = false;
    };
  }, [noteId]);

  function regenerate() {
    setError(null);
    startTransition(async () => {
      const res = await regenerateAvsForNote(noteId);
      if (res.ok) {
        setSummary(res.summary);
        setVerified(false);
      } else {
        setError(res.error);
      }
    });
  }

  function release() {
    setError(null);
    startTransition(async () => {
      const res = await releaseAvsForNote(noteId, verified);
      if (res.ok) {
        const reloaded = await getAvsForNote(noteId);
        if (reloaded.ok) setSummary(reloaded.summary);
      } else {
        setError(res.error);
      }
    });
  }

  const isReleased = summary?.status === "released";

  return (
    <section
      aria-labelledby="avs-review-heading"
      className="mt-8 overflow-hidden rounded-lg border border-border bg-surface shadow-sm"
    >
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/70 bg-surface-muted/60 px-5 py-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent">
            Patient after-visit summary
          </p>
          <h2 id="avs-review-heading" className="mt-1 font-display text-xl font-semibold tracking-tight text-text">
            Plain-language summary
          </h2>
        </div>
        {summary && (
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone="neutral">{LANGUAGE_LABEL[summary.language] ?? summary.language}</Badge>
            {summary.readabilityGrade != null && (
              <Badge tone={summary.doc.readability.meetsTarget ? "success" : "warning"}>
                Reading level {summary.readabilityGrade.toFixed(1)}
                {summary.doc.readability.meetsTarget ? " ✓" : " — review"}
              </Badge>
            )}
            <Badge tone={isReleased ? "success" : "highlight"}>{isReleased ? "Released" : "Draft"}</Badge>
          </div>
        )}
      </div>

      <div className="px-5 py-5">
        {!loaded && <p className="text-sm text-text-muted">Loading summary…</p>}

        {loaded && error && (
          <div className="rounded-lg border border-danger/30 bg-red-50/40 px-4 py-3 text-sm text-danger">
            {error}
          </div>
        )}

        {loaded && !summary && !error && (
          <div className="flex flex-col items-start gap-3 rounded-lg border border-border bg-surface-muted/35 px-4 py-5">
            <p className="text-sm text-text-muted">
              No after-visit summary yet. Generate a plain-language summary from this signed note.
            </p>
            <Button type="button" size="sm" variant="secondary" onClick={regenerate} disabled={pending}>
              {pending ? "Generating…" : "Generate summary"}
            </Button>
          </div>
        )}

        {loaded && summary && (
          <div className="space-y-5">
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <div className="rounded-lg border border-border bg-surface-muted/30 p-4">
                <p className="mb-2 text-xs font-semibold uppercase tracking-[0.12em] text-text-subtle">
                  Your signed note
                </p>
                <pre className="max-h-[420px] overflow-auto whitespace-pre-wrap font-sans text-sm leading-relaxed text-text-muted">
                  {summary.doc.sourceNote || "No note text available."}
                </pre>
              </div>
              <div className="rounded-lg border border-accent/25 bg-surface p-4">
                <p className="mb-2 text-xs font-semibold uppercase tracking-[0.12em] text-accent">
                  Patient will see
                </p>
                <div className="max-h-[420px] overflow-auto">
                  <AvsSummaryView doc={summary.doc} />
                </div>
              </div>
            </div>

            {isReleased ? (
              <div className="flex items-center justify-between gap-3 rounded-lg border border-highlight/35 bg-highlight-soft px-4 py-3">
                <p className="text-sm font-medium text-text">
                  Released to the patient portal
                  {summary.releasedAt
                    ? ` on ${new Date(summary.releasedAt).toLocaleDateString("en-US")}`
                    : ""}
                  .
                </p>
                <Badge tone="success">Delivered</Badge>
              </div>
            ) : (
              <div className="flex flex-col gap-3 rounded-lg border border-border bg-surface-muted/35 px-4 py-3 md:flex-row md:items-center md:justify-between">
                <label className="flex cursor-pointer items-start gap-2 text-sm text-text">
                  <input
                    type="checkbox"
                    className="mt-0.5 h-4 w-4 rounded border-border text-accent focus:ring-accent"
                    checked={verified}
                    onChange={(e) => setVerified(e.target.checked)}
                  />
                  <span>I reviewed this summary and it accurately reflects my note.</span>
                </label>
                <div className="flex shrink-0 flex-wrap gap-2">
                  <Button type="button" size="sm" variant="ghost" onClick={regenerate} disabled={pending}>
                    Regenerate
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="primary"
                    onClick={release}
                    disabled={!verified || pending}
                    title={verified ? "Release to patient" : "Confirm review first"}
                  >
                    {pending ? "Releasing…" : "Release to patient"}
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
