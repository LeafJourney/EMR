"use client";

// EMR-081 — OCR scan & auto-populate review surface.
//
// Paste OCR'd text from an outside record (intake form, hospital
// discharge, lab printout, fax, ID card); the pure engines in
// `@/lib/clinical/ocr-extract` + `ocr-chart-merge` pull structured
// fields and plan a collision-aware merge against the chart. The
// clinician reviews three buckets before anything is written.

import { useMemo, useState } from "react";
import {
  buildOcrReview,
  SAMPLE_DISCHARGE_TEXT,
  DEMO_CHART,
} from "@/lib/clinical/ocr-review";
import type { MergePlanItem } from "@/lib/clinical/ocr-chart-merge";
import type { ExtractedFieldKind } from "@/lib/clinical/ocr-extract";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea, Label } from "@/components/ui/input";
import { EmptyState } from "@/components/ui/empty-state";

type DocType =
  | "unknown"
  | "intake_form"
  | "discharge_summary"
  | "lab_report"
  | "id_card"
  | "fax";

const DOC_TYPES: Array<{ value: DocType; label: string }> = [
  { value: "unknown", label: "Auto-detect" },
  { value: "intake_form", label: "Intake form" },
  { value: "discharge_summary", label: "Discharge summary" },
  { value: "lab_report", label: "Lab report" },
  { value: "id_card", label: "Insurance / ID card" },
  { value: "fax", label: "Inbound fax" },
];

const KIND_LABEL: Record<ExtractedFieldKind, string> = {
  demographic: "Demographics",
  medication: "Medications",
  allergy: "Allergies",
  vital: "Vitals",
  problem: "Problems",
  immunization: "Immunizations",
  lab: "Labs",
  insurance: "Insurance",
  note: "Notes",
};

export function OcrReviewClient() {
  const [text, setText] = useState("");
  const [docType, setDocType] = useState<DocType>("unknown");
  const [compareToChart, setCompareToChart] = useState(true);

  const review = useMemo(
    () =>
      buildOcrReview(
        { text, documentType: docType },
        compareToChart ? DEMO_CHART : {},
      ),
    [text, docType, compareToChart],
  );

  const hasText = text.trim().length > 0;

  return (
    <div className="space-y-6">
      <Card tone="raised">
        <CardHeader>
          <CardTitle className="text-base">Scanned text</CardTitle>
          <CardDescription>
            Paste the OCR output from a scanned document. Nothing is written to
            the chart — this is a review-before-apply preview.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label htmlFor="ocr-text">Document text</Label>
            <Textarea
              id="ocr-text"
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={10}
              placeholder="Paste OCR'd text here…"
              className="mt-1 font-mono text-[13px]"
            />
          </div>

          <div className="flex flex-wrap items-end gap-4">
            <div>
              <Label htmlFor="ocr-doctype">Document type</Label>
              <select
                id="ocr-doctype"
                value={docType}
                onChange={(e) => setDocType(e.target.value as DocType)}
                className="mt-1 block rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text focus:outline-none focus:ring-2 focus:ring-accent/40"
              >
                {DOC_TYPES.map((d) => (
                  <option key={d.value} value={d.value}>
                    {d.label}
                  </option>
                ))}
              </select>
            </div>

            <label className="flex items-center gap-2 text-sm text-text-muted pb-2 cursor-pointer">
              <input
                type="checkbox"
                checked={compareToChart}
                onChange={(e) => setCompareToChart(e.target.checked)}
                className="accent-[color:var(--accent)]"
              />
              Compare against an existing chart (demo)
            </label>

            <div className="ml-auto flex gap-2">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => setText(SAMPLE_DISCHARGE_TEXT)}
              >
                Load sample
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setText("")}
                disabled={!hasText}
              >
                Clear
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {!hasText ? (
        <EmptyState
          title="No text to scan yet"
          description="Paste OCR output above or load the sample discharge summary to see how fields are extracted and reconciled against the chart."
        />
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm text-text-muted">
              {review.fieldsFound} field{review.fieldsFound === 1 ? "" : "s"}{" "}
              extracted:
            </span>
            {review.byKind.map((k) => (
              <Badge key={k.kind} tone="neutral">
                {KIND_LABEL[k.kind]} · {k.count}
              </Badge>
            ))}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <BucketCard
              title="Ready to apply"
              description="New values, no chart collision."
              tone="success"
              items={review.autoApply}
              emptyLabel="Nothing to auto-apply."
            />
            <BucketCard
              title="Needs review"
              description="Conflicts or low-confidence reads."
              tone="warning"
              items={review.needsReview}
              emptyLabel="No conflicts — clean import."
            />
            <BucketCard
              title="Already on chart"
              description="Matches an existing value — skip."
              tone="neutral"
              items={review.duplicates}
              emptyLabel="No duplicates detected."
            />
          </div>

          {review.noteAddendum && (
            <Card tone="outlined">
              <CardHeader>
                <CardTitle className="text-base">
                  Unparsed text → note addendum
                </CardTitle>
                <CardDescription>
                  Everything the extractors could not classify, kept verbatim so
                  it can be pasted into the visit note.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <pre className="whitespace-pre-wrap rounded-lg bg-surface-muted p-3 text-[12px] text-text-muted font-mono">
                  {review.noteAddendum}
                </pre>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}

function BucketCard({
  title,
  description,
  tone,
  items,
  emptyLabel,
}: {
  title: string;
  description: string;
  tone: "success" | "warning" | "neutral";
  items: MergePlanItem[];
  emptyLabel: string;
}) {
  return (
    <Card tone="raised">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">{title}</CardTitle>
          <Badge tone={tone}>{items.length}</Badge>
        </div>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {items.length === 0 ? (
          <p className="text-[13px] text-text-subtle">{emptyLabel}</p>
        ) : (
          items.map((item, i) => <MergeItemRow key={`${item.field.path}-${i}`} item={item} />)
        )}
      </CardContent>
    </Card>
  );
}

function MergeItemRow({ item }: { item: MergePlanItem }) {
  const { field } = item;
  const pct = Math.round(field.confidence * 100);
  return (
    <div className="rounded-lg border border-border/70 px-3 py-2">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm text-text font-medium truncate">{field.value}</p>
        <Badge tone={decisionTone(item.decision)} className="shrink-0">
          {item.decision}
        </Badge>
      </div>
      <p className="text-[11px] text-text-subtle">
        {field.path} · {pct}% confidence
      </p>
      {item.existingValue && (
        <p className="text-[11px] text-danger mt-0.5">
          On chart: {item.existingValue}
        </p>
      )}
      <p className="text-[11px] text-text-muted mt-1">{item.rationale}</p>
      <p
        className="text-[10px] text-text-subtle font-mono mt-1 truncate"
        title={field.source}
      >
        “{field.source}”
      </p>
    </div>
  );
}

function decisionTone(
  decision: MergePlanItem["decision"],
): "success" | "warning" | "danger" | "neutral" {
  switch (decision) {
    case "add":
      return "success";
    case "conflict":
      return "danger";
    case "review":
      return "warning";
    case "duplicate":
      return "neutral";
  }
}
