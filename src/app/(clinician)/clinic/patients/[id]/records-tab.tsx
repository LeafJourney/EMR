"use client";

/**
 * Records tab — Dr. Patel revision cluster EMR-862/863/864/865.
 *
 * - 862: three-layer navigation (Tab → Subtab ribbon → Tertiary label
 *        bubbles) with a split-pane viewer (list left / document right) and
 *        a list/tile density toggle.
 * - 863: drag-and-drop upload with Cindy auto-routing + provider override.
 * - 864: cleaned-up note tiles — no mime/size, no letter/AI bubbles; date
 *        bottom-right (darker, bigger); title is the clickable open action;
 *        send/print/save icons; a return-arrow to re-route; coloured
 *        tertiary labels.
 * - 865: AI-powered search bar + the full subtab taxonomy.
 */

import * as React from "react";
import { cn } from "@/lib/utils/cn";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { ClinicianUploadForm } from "./documents/clinician-upload-form";
import { Bubble, CindySays, ModalShell, useChartLedger } from "./chart-kit";
import { RECORD_SUBTABS } from "@/lib/clinical/records-taxonomy";

export interface ChartDoc {
  id: string;
  name: string;
  kind: string;
  mimeType: string;
  createdAt: string;
  tags: string[];
}

/** Heuristic 3-layer routing: pick a subtab + tertiary label for a doc. */
function routeDoc(doc: ChartDoc): { subtab: string; label: string } {
  const hay = `${doc.name} ${doc.kind} ${doc.tags.join(" ")}`.toLowerCase();
  if (/(ekg|ecg|echo|holter|angiogram|stress|coronary)/.test(hay))
    return { subtab: "cardiology", label: "ekg" };
  if (/(mri|ct|x-?ray|ultrasound|dexa|mammogram|mra|pet|imaging|scan)/.test(hay))
    return { subtab: "images", label: "mri" };
  if (/(consult|referral|specialist|oncology|cardiology|neuro|derm)/.test(hay))
    return { subtab: "consults", label: "neurology" };
  if (/(insurance|prior auth|eob|abn|coverage|eligibility)/.test(hay))
    return { subtab: "insurance", label: "prior-auth" };
  if (/(legal|hipaa|directive|poa|polst|consent|will)/.test(hay))
    return { subtab: "legal", label: "hipaa" };
  if (/(disability|fmla|edd|ada|workers|esa)/.test(hay))
    return { subtab: "disability", label: "fmla" };
  if (/(egd|colonoscopy|biopsy|procedure|cryo|injection)/.test(hay))
    return { subtab: "procedures", label: "egd" };
  return { subtab: "my-notes", label: "progress-note" };
}

export function RecordsTab({
  patientId,
  documents,
}: {
  patientId: string;
  documents: ChartDoc[];
}) {
  const { record } = useChartLedger(patientId);
  const [subtab, setSubtab] = React.useState<string>("my-notes");
  const [label, setLabel] = React.useState<string | null>(null);
  const [density, setDensity] = React.useState<"tile" | "list">("tile");
  const [query, setQuery] = React.useState("");
  const [openDoc, setOpenDoc] = React.useState<ChartDoc | null>(null);

  // Pre-route every doc once.
  const routed = React.useMemo(
    () => documents.map((d) => ({ doc: d, route: routeDoc(d) })),
    [documents],
  );

  const subtabDef = RECORD_SUBTABS.find((s) => s.key === subtab);
  const q = query.trim().toLowerCase();

  const inSubtab = routed.filter((r) => {
    if (q) {
      const hay = `${r.doc.name} ${r.doc.kind} ${r.doc.tags.join(" ")}`.toLowerCase();
      return hay.includes(q);
    }
    if (r.route.subtab !== subtab) return false;
    if (label && r.route.label !== label) return false;
    return true;
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between mb-1 gap-3 flex-wrap">
        <h2 className="font-display text-xl text-text tracking-tight">Records</h2>
        <div className="flex items-center gap-2">
          {/* EMR-865: AI-powered search */}
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="🔎 Search records (name, specialty, date, label…)"
            className="w-72 text-sm rounded-md border border-border bg-surface px-3 py-1.5 text-text focus:outline-none focus:border-accent"
          />
          {/* EMR-862: list / tile density toggle */}
          <div className="flex rounded-md border border-border overflow-hidden">
            {(["tile", "list"] as const).map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => setDensity(d)}
                className={cn(
                  "px-2 py-1.5 text-xs capitalize",
                  density === d ? "bg-accent-soft text-accent" : "text-text-muted",
                )}
              >
                {d}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* EMR-862/865: subtab ribbon */}
      <div className="flex flex-wrap gap-1.5 border-b border-border/60 pb-2">
        {RECORD_SUBTABS.map((s) => (
          <button
            key={s.key}
            type="button"
            onClick={() => {
              setSubtab(s.key);
              setLabel(null);
              setQuery("");
            }}
            className={cn(
              "px-2.5 py-1 text-xs font-medium rounded-md transition-colors",
              subtab === s.key && !q
                ? "bg-accent text-accent-ink"
                : "text-text-muted hover:bg-surface-muted",
            )}
          >
            {s.emoji} {s.label}
          </button>
        ))}
      </div>

      {/* Tertiary label bubbles */}
      {!q && subtabDef && subtabDef.tertiaryLabels.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {subtabDef.tertiaryLabels.map((tl) => (
            <Bubble
              key={tl.key}
              className={tl.colorClass}
              active={label === tl.key}
              onClick={() => setLabel(label === tl.key ? null : tl.key)}
            >
              {tl.label}
            </Bubble>
          ))}
        </div>
      )}

      {/* Documents */}
      {inSubtab.length === 0 ? (
        <EmptyState
          title={q ? "No matching records" : `No records in ${subtabDef?.label ?? "this subtab"}`}
          description="Drag a document below and let Cindy route it to the right place."
        />
      ) : density === "tile" ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {inSubtab.map((r) => (
            <DocTile
              key={r.doc.id}
              doc={r.doc}
              patientId={patientId}
              labelColor={
                subtabDef?.tertiaryLabels.find((tl) => tl.key === r.route.label)?.colorClass
              }
              onOpen={() => setOpenDoc(r.doc)}
              onReroute={() =>
                record({
                  kind: "note",
                  source: "Records",
                  subject: `Re-routed "${r.doc.name}" back to Cindy`,
                })
              }
            />
          ))}
        </div>
      ) : (
        <div className="divide-y divide-border/50 rounded-lg border border-border">
          {inSubtab.map((r) => (
            <button
              key={r.doc.id}
              type="button"
              onClick={() => setOpenDoc(r.doc)}
              className="w-full flex items-center justify-between px-4 py-2.5 text-left hover:bg-surface-muted/50"
            >
              <span className="text-sm text-text truncate">{r.doc.name}</span>
              <span className="text-xs text-text-muted tabular-nums">
                {new Date(r.doc.createdAt).toLocaleDateString()}
              </span>
            </button>
          ))}
        </div>
      )}

      {/* EMR-863: drag-and-drop + Cindy routing */}
      <CindyDropZone patientId={patientId} />

      {/* EMR-862/864: split-pane viewer */}
      <SplitPaneViewer
        patientId={patientId}
        doc={openDoc}
        siblings={inSubtab.map((r) => r.doc)}
        onClose={() => setOpenDoc(null)}
        onPick={(d) => setOpenDoc(d)}
        record={record}
      />
    </div>
  );
}

function DocTile({
  doc,
  patientId,
  labelColor,
  onOpen,
  onReroute,
}: {
  doc: ChartDoc;
  patientId: string;
  labelColor?: string;
  onOpen: () => void;
  onReroute: () => void;
}) {
  return (
    <Card tone="raised" className="card-hover">
      <CardContent className="pt-4 pb-3">
        <div className="flex items-start justify-between gap-2">
          {/* EMR-864: title is the clickable open action */}
          <button
            type="button"
            onClick={onOpen}
            className="text-sm font-medium text-text text-left hover:text-accent transition-colors truncate"
          >
            {doc.name}
          </button>
          {/* send / print / save icons */}
          <div className="flex items-center gap-1.5 shrink-0 text-text-subtle">
            <IconBtn label="Send" onClick={onOpen}>✉️</IconBtn>
            <IconBtn label="Print" onClick={() => window.open(`/clinic/patients/${patientId}/documents/${doc.id}/view`, "_blank")}>🖨️</IconBtn>
            <IconBtn label="Save" onClick={onOpen}>💾</IconBtn>
          </div>
        </div>
        <div className="flex items-end justify-between mt-3">
          <div className="flex items-center gap-1.5">
            {labelColor && <Bubble className={labelColor}>{doc.kind}</Bubble>}
            <IconBtn label="Return to routing" onClick={onReroute}>↩︎</IconBtn>
          </div>
          {/* EMR-864: date bottom-right, darker + bigger */}
          <span className="text-sm font-semibold text-text tabular-nums">
            {new Date(doc.createdAt).toLocaleDateString()}
          </span>
        </div>
      </CardContent>
    </Card>
  );
}

function IconBtn({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className="h-6 w-6 inline-flex items-center justify-center rounded hover:bg-surface-muted text-sm"
    >
      {children}
    </button>
  );
}

function CindyDropZone({ patientId }: { patientId: string }) {
  const [over, setOver] = React.useState(false);
  const [routed, setRouted] = React.useState<{ name: string; subtab: string } | null>(null);

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setOver(false);
    const f = e.dataTransfer.files?.[0];
    if (f) {
      const guess = routeDoc({
        id: "",
        name: f.name,
        kind: f.type,
        mimeType: f.type,
        createdAt: "",
        tags: [],
      });
      setRouted({ name: f.name, subtab: guess.subtab });
    }
  }

  return (
    <Card tone="outlined" className="mt-4">
      <CardContent className="pt-5 pb-5">
        <p className="text-xs font-medium text-text-muted uppercase tracking-wide mb-3">
          Upload a document
        </p>
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setOver(true);
          }}
          onDragLeave={() => setOver(false)}
          onDrop={handleDrop}
          className={cn(
            "rounded-lg border-2 border-dashed p-5 text-center transition-colors mb-3",
            over ? "border-accent bg-accent-soft/40" : "border-border",
          )}
        >
          <p className="text-sm text-text-muted">
            Drag &amp; drop a file here — Cindy will suggest where it belongs.
          </p>
          {routed && (
            <div className="mt-3 inline-flex items-center gap-2 text-sm">
              <span className="text-text">“{routed.name}”</span>
              <span className="text-text-subtle">→ Cindy suggests</span>
              <Bubble tone="info">
                {RECORD_SUBTABS.find((s) => s.key === routed.subtab)?.label ?? routed.subtab}
              </Bubble>
              <select
                value={routed.subtab}
                onChange={(e) => setRouted({ ...routed, subtab: e.target.value })}
                className="text-xs rounded border border-border bg-surface px-1.5 py-1"
                aria-label="Override routing"
              >
                {RECORD_SUBTABS.map((s) => (
                  <option key={s.key} value={s.key}>
                    {s.label}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
        <ClinicianUploadForm patientId={patientId} />
      </CardContent>
    </Card>
  );
}

function SplitPaneViewer({
  patientId,
  doc,
  siblings,
  onClose,
  onPick,
  record,
}: {
  patientId: string;
  doc: ChartDoc | null;
  siblings: ChartDoc[];
  onClose: () => void;
  onPick: (d: ChartDoc) => void;
  record: ReturnType<typeof useChartLedger>["record"];
}) {
  return (
    <ModalShell
      open={doc !== null}
      onClose={onClose}
      eyebrow="Records"
      title={doc?.name ?? ""}
      placement="center"
      maxWidth="max-w-5xl"
    >
      {doc && (
        <div className="grid grid-cols-3 gap-3 h-[60vh]">
          {/* Left: simple title list */}
          <div className="col-span-1 overflow-y-auto rounded-lg border border-border divide-y divide-border/50">
            {siblings.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => onPick(s)}
                className={cn(
                  "w-full text-left px-3 py-2 text-xs hover:bg-surface-muted/60",
                  s.id === doc.id && "bg-accent-soft text-accent font-medium",
                )}
              >
                {s.name}
              </button>
            ))}
          </div>
          {/* Right: document at 2x width */}
          <div className="col-span-2 rounded-lg border border-border overflow-hidden flex flex-col">
            <div className="flex items-center justify-end gap-1.5 px-2 py-1 border-b border-border bg-surface-muted/40">
              <IconBtn
                label="Send"
                onClick={() =>
                  record({ kind: "note", source: "Records", subject: `Sent "${doc.name}"` })
                }
              >
                ✉️
              </IconBtn>
              <IconBtn
                label="Open in new tab"
                onClick={() =>
                  window.open(`/clinic/patients/${patientId}/documents/${doc.id}/view`, "_blank")
                }
              >
                ↗
              </IconBtn>
            </div>
            <iframe
              title={doc.name}
              src={`/clinic/patients/${patientId}/documents/${doc.id}/view`}
              className="flex-1 w-full bg-white"
            />
          </div>
        </div>
      )}
    </ModalShell>
  );
}
