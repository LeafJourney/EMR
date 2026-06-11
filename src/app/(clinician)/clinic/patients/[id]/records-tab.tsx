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
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { ClinicianUploadForm } from "./documents/clinician-upload-form";
import { Bubble, ModalShell, useChartLedger } from "./chart-kit";
import {
  searchDirectory,
  fullName,
  IdentityAvatar,
  type DirectoryEntry,
} from "./correspondence-composer";
import { RECORD_SUBTABS, IMAGING_MODALITIES } from "@/lib/clinical/records-taxonomy";

export interface ChartDoc {
  id: string;
  name: string;
  kind: string;
  mimeType: string;
  createdAt: string;
  tags: string[];
}

/**
 * E-signed subtab filter (directive line 572): a small options button filters
 * the e-signed documents by type, distinct from the shared tertiary-label
 * bubbles. The keys map onto the e-signed subtab's tertiary labels so a chosen
 * type narrows to its routing bucket.
 */
const ESIGNED_FILTERS = [
  { key: "all", label: "All e-signed" },
  { key: "medication-overrides", label: "Overrides" },
  { key: "cures", label: "CURES" },
  { key: "warning-acknowledgements", label: "Acknowledgments" },
  { key: "controlled-substance-checks", label: "Notes" },
] as const;

type EsignedFilter = (typeof ESIGNED_FILTERS)[number]["key"];

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
  // EMR-865: per-subtab search — filters within the active subtab only,
  // distinct from the global `query` above.
  const [subtabQuery, setSubtabQuery] = React.useState("");
  const [openDoc, setOpenDoc] = React.useState<ChartDoc | null>(null);
  // Gap 1 (directive 512): the document a clinician is composing a "send" for.
  const [sendDoc, setSendDoc] = React.useState<ChartDoc | null>(null);
  // Gap 2 (directive 572): options/filter for the E-signed subtab, by type.
  const [esignedFilter, setEsignedFilter] = React.useState<EsignedFilter>("all");
  const [esignedMenuOpen, setEsignedMenuOpen] = React.useState(false);

  // Pre-route every doc once.
  const routed = React.useMemo(
    () => documents.map((d) => ({ doc: d, route: routeDoc(d) })),
    [documents],
  );

  const subtabDef = RECORD_SUBTABS.find((s) => s.key === subtab);
  const q = query.trim().toLowerCase();
  const sq = subtabQuery.trim().toLowerCase();

  const inSubtab = routed.filter((r) => {
    if (q) {
      const hay = `${r.doc.name} ${r.doc.kind} ${r.doc.tags.join(" ")}`.toLowerCase();
      return hay.includes(q);
    }
    if (r.route.subtab !== subtab) return false;
    if (label && r.route.label !== label) return false;
    // Gap 2: in the E-signed subtab, the options filter narrows by type.
    if (subtab === "e-signed" && esignedFilter !== "all" && r.route.label !== esignedFilter)
      return false;
    if (sq) {
      const hay = `${r.doc.name} ${r.doc.kind} ${r.doc.tags.join(" ")}`.toLowerCase();
      if (!hay.includes(sq)) return false;
    }
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
              setSubtabQuery("");
              setEsignedFilter("all");
              setEsignedMenuOpen(false);
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

      {/* Subtab header: tertiary label bubbles + per-subtab search */}
      {!q && subtabDef && (
        <div className="flex items-start justify-between gap-3 flex-wrap">
          {subtabDef.tertiaryLabels.length > 0 ? (
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
          ) : (
            <span />
          )}
          <div className="flex items-center gap-2">
            {/* Gap 2 (directive 572): E-signed options/filter button — filters
                the e-signed documents by type, distinct from the tertiary
                bubbles above. */}
            {subtab === "e-signed" && (
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setEsignedMenuOpen((v) => !v)}
                  aria-haspopup="menu"
                  aria-expanded={esignedMenuOpen}
                  title="Filter e-signed documents by type"
                  className={cn(
                    "inline-flex items-center gap-1 rounded-md border border-border px-2.5 py-1.5 text-xs font-medium transition-colors",
                    esignedFilter !== "all"
                      ? "bg-accent-soft text-accent"
                      : "text-text-muted hover:bg-surface-muted",
                  )}
                >
                  <span aria-hidden="true">⚙️</span>
                  {ESIGNED_FILTERS.find((f) => f.key === esignedFilter)?.label ??
                    "Options"}
                </button>
                {esignedMenuOpen && (
                  <>
                    <div
                      className="fixed inset-0 z-10"
                      onClick={() => setEsignedMenuOpen(false)}
                    />
                    <div
                      role="menu"
                      className="absolute right-0 z-20 mt-1 w-52 rounded-lg border border-border bg-surface shadow-lg py-1"
                    >
                      {ESIGNED_FILTERS.map((f) => (
                        <button
                          key={f.key}
                          type="button"
                          role="menuitemradio"
                          aria-checked={esignedFilter === f.key}
                          onClick={() => {
                            setEsignedFilter(f.key);
                            setEsignedMenuOpen(false);
                          }}
                          className={cn(
                            "w-full flex items-center justify-between px-3 py-1.5 text-left text-sm hover:bg-surface-muted",
                            esignedFilter === f.key
                              ? "text-accent font-medium"
                              : "text-text",
                          )}
                        >
                          {f.label}
                          {esignedFilter === f.key && (
                            <span aria-hidden="true">✓</span>
                          )}
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>
            )}
            {/* EMR-865: per-subtab search — filters within this subtab only */}
            <input
              type="search"
              value={subtabQuery}
              onChange={(e) => setSubtabQuery(e.target.value)}
              placeholder={`🔎 Search ${subtabDef.label}`}
              className="w-56 text-sm rounded-md border border-border bg-surface px-3 py-1.5 text-text focus:outline-none focus:border-accent"
            />
          </div>
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
              subtab={r.route.subtab}
              routeLabel={r.route.label}
              labelColor={
                subtabDef?.tertiaryLabels.find((tl) => tl.key === r.route.label)?.colorClass
              }
              onOpen={() => setOpenDoc(r.doc)}
              onSend={() => setSendDoc(r.doc)}
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

      {/* EMR-863: drag-and-drop + Cindy routing (clinician-approval gated) */}
      <CindyDropZone patientId={patientId} record={record} />

      {/* EMR-862/864: split-pane viewer */}
      <SplitPaneViewer
        patientId={patientId}
        doc={openDoc}
        siblings={inSubtab.map((r) => r.doc)}
        onClose={() => setOpenDoc(null)}
        onPick={(d) => setOpenDoc(d)}
        record={record}
      />

      {/* Gap 1 (directive 512): send-document composer popup */}
      <SendDocModal
        doc={sendDoc}
        patientId={patientId}
        onClose={() => setSendDoc(null)}
        record={record}
      />
    </div>
  );
}

/**
 * Gap 1 (directive 512): the Send (✉️) icon on a DocTile opens this composer
 * popup — mirroring the Correspondence message box — with a Subject field, a
 * Message field, and a fully searchable "Patient" field (the recipient). On
 * send it logs to the chart ledger; nothing is actually transmitted (client
 * presentation only, no real delivery).
 */
function SendDocModal({
  doc,
  patientId,
  onClose,
  record,
}: {
  doc: ChartDoc | null;
  patientId: string;
  onClose: () => void;
  record: ReturnType<typeof useChartLedger>["record"];
}) {
  const [subject, setSubject] = React.useState("");
  const [message, setMessage] = React.useState("");
  const [query, setQuery] = React.useState("");
  const [recipient, setRecipient] = React.useState<DirectoryEntry | null>(null);
  const [showResults, setShowResults] = React.useState(false);

  // Reset the form whenever a new document is opened for sending.
  React.useEffect(() => {
    if (doc) {
      setSubject(doc.name);
      setMessage("");
      setQuery("");
      setRecipient(null);
      setShowResults(false);
    }
  }, [doc]);

  const results = React.useMemo(() => searchDirectory(query), [query]);
  const dirty = Boolean(
    doc && (message.trim() || recipient || subject.trim() !== (doc.name ?? "")),
  );
  const canSend = Boolean(recipient && subject.trim());

  function handleSend() {
    if (!doc || !recipient) return;
    record({
      kind: "note",
      source: "Records",
      subject: `Sent “${doc.name}” to ${fullName(recipient)} — “${subject.trim()}”`,
    });
    onClose();
  }

  return (
    <ModalShell
      open={doc !== null}
      onClose={onClose}
      isDirty={dirty}
      eyebrow="Send document"
      title={doc?.name ?? ""}
      placement="center"
      maxWidth="max-w-lg"
      footer={
        <div className="px-5 py-3 flex items-center justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button size="sm" disabled={!canSend} onClick={handleSend}>
            Send
          </Button>
        </div>
      }
    >
      <div className="px-5 py-4 space-y-4">
        {/* Patient / recipient — fully searchable directory. */}
        <div className="relative">
          <label className="text-xs font-medium text-text mb-1.5 inline-block">
            Patient
          </label>
          <div className="flex items-center gap-2">
            {recipient && (
              <IdentityAvatar
                seed={recipient.id}
                name={fullName(recipient)}
                size="sm"
              />
            )}
            <Input
              value={query}
              placeholder="Search patient by name, title, or department…"
              onFocus={() => setShowResults(true)}
              onChange={(e) => {
                setQuery(e.target.value);
                setShowResults(true);
                setRecipient(null);
              }}
            />
          </div>
          {showResults && !recipient && results.length > 0 && (
            <div className="absolute z-10 mt-1 w-full max-h-56 overflow-y-auto rounded-lg border border-border bg-surface shadow-lg">
              {results.map((e) => (
                <button
                  key={e.id}
                  type="button"
                  onClick={() => {
                    setRecipient(e);
                    setQuery(fullName(e));
                    setShowResults(false);
                  }}
                  className="w-full flex items-center gap-2.5 px-3 py-2 text-left hover:bg-surface-muted"
                >
                  <IdentityAvatar seed={e.id} name={fullName(e)} size="sm" />
                  <span className="min-w-0">
                    <span className="block text-sm text-text truncate">
                      {fullName(e)}{" "}
                      <span className="text-text-subtle">· {e.title}</span>
                    </span>
                    <span className="block text-[11px] text-text-subtle truncate">
                      {e.department}
                    </span>
                  </span>
                </button>
              ))}
            </div>
          )}
          {showResults && !recipient && results.length === 0 && (
            <p className="text-[11px] text-text-subtle mt-1">
              No match for “{query}”.
            </p>
          )}
        </div>

        {/* Subject. */}
        <div>
          <label className="text-xs font-medium text-text mb-1.5 inline-block">
            Subject
          </label>
          <Input
            value={subject}
            placeholder="Subject"
            onChange={(e) => setSubject(e.target.value)}
          />
        </div>

        {/* Message. */}
        <div>
          <label className="text-xs font-medium text-text mb-1.5 inline-block">
            Message
          </label>
          <Textarea
            value={message}
            rows={5}
            placeholder="Write a message to accompany this document…"
            onChange={(e) => setMessage(e.target.value)}
          />
        </div>
      </div>
    </ModalShell>
  );
}

function DocTile({
  doc,
  patientId,
  subtab,
  routeLabel,
  labelColor,
  onOpen,
  onSend,
  onReroute,
}: {
  doc: ChartDoc;
  patientId: string;
  subtab: string;
  routeLabel: string;
  labelColor?: string;
  onOpen: () => void;
  onSend: () => void;
  onReroute: () => void;
}) {
  // EMR-865/EMR-902: in the Images subtab, render a dual-bubble layout — a
  // coloured modality bubble plus a beige body-part secondary bubble.
  const modality =
    subtab === "images"
      ? IMAGING_MODALITIES.find((m) => m.key === routeLabel)
      : undefined;
  const bodyPart = modality
    ? modality.bodyParts.find((bp) => {
        const hay = `${doc.name} ${doc.tags.join(" ")}`.toLowerCase();
        return hay.includes(bp.toLowerCase());
      })
    : undefined;

  // EMR-864: Save triggers an actual download of the document file rather than
  // re-opening the viewer.
  function handleSave() {
    const href = `/clinic/patients/${patientId}/documents/${doc.id}/view`;
    const a = document.createElement("a");
    a.href = href;
    a.download = doc.name;
    a.rel = "noopener";
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

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
            <IconBtn label="Send" onClick={onSend}>✉️</IconBtn>
            <IconBtn label="Print" onClick={() => window.open(`/clinic/patients/${patientId}/documents/${doc.id}/view`, "_blank")}>🖨️</IconBtn>
            <IconBtn label="Save" onClick={handleSave}>💾</IconBtn>
          </div>
        </div>
        <div className="flex items-end justify-between mt-3">
          <div className="flex items-center gap-1.5">
            {modality ? (
              <>
                <Bubble className={modality.colorClass}>{modality.label}</Bubble>
                {bodyPart && <Bubble>{bodyPart}</Bubble>}
              </>
            ) : (
              labelColor && <Bubble className={labelColor}>{doc.kind}</Bubble>
            )}
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

function CindyDropZone({
  patientId,
  record,
}: {
  patientId: string;
  record: ReturnType<typeof useChartLedger>["record"];
}) {
  const [over, setOver] = React.useState(false);
  // EMR-863 governance: Cindy *suggests* a destination, but nothing is filed
  // until the clinician explicitly approves (or overrides) it — human-in-the-
  // loop. `pending` is the un-approved suggestion; `filed` is the confirmation.
  const [pending, setPending] = React.useState<
    { name: string; suggested: string; chosen: string } | null
  >(null);
  const [filed, setFiled] = React.useState<
    { name: string; subtab: string; overridden: boolean } | null
  >(null);

  const labelFor = (key: string) =>
    RECORD_SUBTABS.find((s) => s.key === key)?.label ?? key;

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
      setPending({ name: f.name, suggested: guess.subtab, chosen: guess.subtab });
      setFiled(null);
    }
  }

  function approve() {
    if (!pending) return;
    const overridden = pending.chosen !== pending.suggested;
    record({
      kind: "note",
      source: "Records",
      subject: `Filed “${pending.name}” → ${labelFor(pending.chosen)} ${
        overridden
          ? `(clinician override of Cindy’s “${labelFor(pending.suggested)}”)`
          : "(approved Cindy’s suggestion)"
      }`,
    });
    setFiled({ name: pending.name, subtab: pending.chosen, overridden });
    setPending(null);
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
            Drag &amp; drop a file here — Cindy will suggest where it belongs, then
            you approve.
          </p>

          {/* EMR-863: Cindy's routing is advisory — pending clinician approval. */}
          {pending && (
            <div className="mt-3 rounded-lg border border-accent/30 bg-accent-soft/20 p-3 text-left">
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <span className="text-text font-medium truncate max-w-[200px]">
                  “{pending.name}”
                </span>
                <span className="text-text-subtle">→ Cindy suggests</span>
                <Bubble tone="info">{labelFor(pending.suggested)}</Bubble>
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <label className="text-xs text-text-muted">File under</label>
                <select
                  value={pending.chosen}
                  onChange={(e) => setPending({ ...pending, chosen: e.target.value })}
                  className="text-xs rounded border border-border bg-surface px-1.5 py-1"
                  aria-label="Choose destination subtab"
                >
                  {RECORD_SUBTABS.map((s) => (
                    <option key={s.key} value={s.key}>
                      {s.label}
                    </option>
                  ))}
                </select>
                {pending.chosen !== pending.suggested && (
                  <span className="text-[11px] text-highlight">override</span>
                )}
                <div className="ml-auto flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setPending(null)}
                    className="text-xs px-2.5 py-1 rounded-md text-text-muted hover:bg-surface-muted"
                  >
                    Discard
                  </button>
                  <button
                    type="button"
                    onClick={approve}
                    className="text-xs px-2.5 py-1 rounded-md bg-accent text-accent-ink font-semibold"
                  >
                    Approve &amp; file
                  </button>
                </div>
              </div>
              <p className="mt-2 text-[11px] text-text-subtle">
                Cindy’s routing is a suggestion only — the document is filed when
                you approve.
              </p>
            </div>
          )}

          {/* Post-approval confirmation */}
          {filed && (
            <div className="mt-3 inline-flex items-center gap-2 text-sm">
              <span className="text-emerald-600">✓ Filed</span>
              <span className="text-text">“{filed.name}”</span>
              <span className="text-text-subtle">→</span>
              <Bubble tone="info">{labelFor(filed.subtab)}</Bubble>
              {filed.overridden && (
                <span className="text-[11px] text-text-subtle">(your override)</span>
              )}
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
