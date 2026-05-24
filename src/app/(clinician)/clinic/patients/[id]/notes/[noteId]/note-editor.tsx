"use client";

import { useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  saveNoteBlocks,
  saveAndFinalizeNote,
  refineSection,
  saveEmotionalVital,
  type RefineMode,
} from "./actions";
import {
  APSO_ORDER,
  NOTE_BLOCK_LABELS,
  PATIENT_DEMEANOR_OPTIONS,
  type PatientDemeanor,
  type NoteBlockType,
} from "@/lib/domain/notes";
import { LeafSprig } from "@/components/ui/ornament";
import { DictateButton } from "@/components/ui/dictation";
import { MarkdownEditor } from "@/components/ui/markdown-editor";
import { NoteTemplatePicker, type PickerBlock } from "@/components/clinical/note-template-picker";
import { NOTE_BLOCK_LABELS as NB_LABELS } from "@/lib/domain/notes";

interface NoteBlock {
  type?: NoteBlockType;
  heading: string;
  body: string;
}

interface NoteEditorProps {
  noteId: string;
  patientId: string;
  encounterId: string;
  initialBlocks: NoteBlock[];
  status: string;
  aiDrafted: boolean;
  aiConfidence: number | null;
  codingSuggestion: {
    icd10: { code: string; label: string; confidence: number }[];
    emLevel: string | null;
    rationale: string | null;
  } | null;
  initialDemeanor?: PatientDemeanor | null;
}

const REFINE_OPTIONS: { mode: RefineMode; label: string; icon: string }[] = [
  { mode: "expand", label: "Expand", icon: "+" },
  { mode: "clinical", label: "Clinical", icon: "Rx" },
  { mode: "concise", label: "Concise", icon: "-" },
  { mode: "dosing", label: "Dosing", icon: "mg" },
  { mode: "clarify", label: "Clarify", icon: "?" },
];

/**
 * Defensive scrub for anything displayed in the Save/Finalize status slot.
 *
 * If a raw provider error body somehow slips in (for example from a legacy
 * code path that pre-dates our ModelError classification), collapse it to
 * a single human-friendly sentence. We never want to see `{"error":{...}}`
 * JSON next to the Save and Finalize buttons again.
 */
function scrubMessage(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return "";
  // Detect a JSON-looking error dump
  if (trimmed.startsWith("{") && trimmed.includes('"error"')) {
    return "Something went wrong. Please try again.";
  }
  // Detect the legacy `OpenRouter error NNN: {...}` prefix
  if (/OpenRouter error \d+/i.test(trimmed)) {
    return "AI is temporarily unavailable. Please try again in a moment.";
  }
  return trimmed;
}

export function NoteEditor({
  noteId,
  patientId,
  encounterId,
  initialBlocks,
  status,
  aiDrafted,
  aiConfidence,
  codingSuggestion,
  initialDemeanor,
}: NoteEditorProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const fromBriefing = searchParams.get("from") === "briefing";
  const [refiningIndex, setRefiningIndex] = useState<number | null>(null);
  // Refine errors are per-section so a single failed refinement never
  // contaminates the Save/Finalize button row. Map of blockIndex -> friendly
  // message. The message is pre-scrubbed by the server action — raw provider
  // JSON never reaches here.
  const [refineErrors, setRefineErrors] = useState<Record<number, string>>({});
  const [blocks, setBlocks] = useState<NoteBlock[]>(() => {
    // Defensive: a malformed JSON payload could deliver a non-array here
    // (the parent already filters `_guardrails`, but we don't trust the
    // wire shape). Treat anything non-array as empty so the editor renders
    // an empty state rather than crashing the patient chart.
    const safe: NoteBlock[] = Array.isArray(initialBlocks) ? initialBlocks : [];
    // Sort initial blocks in APSO order
    const sorted = [...safe].sort((a, b) => {
      const aIdx = a.type ? APSO_ORDER.indexOf(a.type) : APSO_ORDER.length;
      const bIdx = b.type ? APSO_ORDER.indexOf(b.type) : APSO_ORDER.length;
      return (aIdx === -1 ? APSO_ORDER.length : aIdx) - (bIdx === -1 ? APSO_ORDER.length : bIdx);
    });
    // Apply APSO display labels to headings + coerce `body` to a string so
    // downstream `body.split` / template-string concatenation never hit
    // null/undefined.
    return sorted.map((block) => ({
      ...block,
      body: typeof block.body === "string" ? block.body : "",
      heading: block.type && NOTE_BLOCK_LABELS[block.type]
        ? NOTE_BLOCK_LABELS[block.type]
        : block.heading,
    }));
  });
  const [isPending, startTransition] = useTransition();
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [currentStatus, setCurrentStatus] = useState(status);
  const [demeanor, setDemeanor] = useState<PatientDemeanor | null>(initialDemeanor ?? null);
  const [demeanorPending, setDemeanorPending] = useState(false);

  function handleDemeanor(value: PatientDemeanor) {
    if (demeanorPending) return;
    const previous = demeanor;
    setDemeanor(value);
    setDemeanorPending(true);
    void saveEmotionalVital(encounterId, value)
      .then((res) => {
        if (!res.ok) {
          setDemeanor(previous);
          setSaveMessage(res.error);
        }
      })
      .finally(() => setDemeanorPending(false));
  }

  const isEditable = currentStatus === "draft" || currentStatus === "needs_review";

  function updateBlock(index: number, field: "heading" | "body", value: string) {
    setBlocks((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], [field]: value };
      return next;
    });
  }

  // EMR-174 — applying a template overwrites the current blocks. Picker
  // shows a confirm dialog before calling this when there's content to
  // preserve, so we trust the call here. APSO-sort and APSO-label, same
  // as the initial mount.
  function applyTemplate(_templateName: string, incoming: PickerBlock[]) {
    const sorted = [...incoming].sort((a, b) => {
      const aIdx = a.type ? APSO_ORDER.indexOf(a.type) : APSO_ORDER.length;
      const bIdx = b.type ? APSO_ORDER.indexOf(b.type) : APSO_ORDER.length;
      return (aIdx === -1 ? APSO_ORDER.length : aIdx) - (bIdx === -1 ? APSO_ORDER.length : bIdx);
    });
    setBlocks(
      sorted.map((b) => ({
        type: b.type,
        body: b.body,
        heading: b.type && NB_LABELS[b.type] ? NB_LABELS[b.type] : b.heading,
      })),
    );
    setSaveMessage(null);
  }

  function handleSave() {
    startTransition(async () => {
      const result = await saveNoteBlocks(noteId, blocks);
      if (result.ok) {
        setSaveMessage("Saved successfully");
        setTimeout(() => setSaveMessage(null), 2000);
      } else {
        setSaveMessage(result.error);
      }
    });
  }

  function handleFinalize() {
    startTransition(async () => {
      const result = await saveAndFinalizeNote(noteId, blocks);
      if (result.ok) {
        setCurrentStatus("finalized");
        setSaveMessage("Note finalized and signed");
        router.refresh();
      } else {
        setSaveMessage(result.error);
      }
    });
  }

  async function handleRefine(index: number, mode: RefineMode) {
    setRefiningIndex(index);
    // Clear any prior error for this section before we try again.
    setRefineErrors((prev) => {
      if (!(index in prev)) return prev;
      const next = { ...prev };
      delete next[index];
      return next;
    });
    const block = blocks[index];
    const result = await refineSection(noteId, block.heading, block.body, mode);
    if (result.ok) {
      updateBlock(index, "body", result.refined);
      setSaveMessage(`${block.heading} refined`);
      setTimeout(() => setSaveMessage(null), 2000);
    } else {
      // Scoped per-section error — never leaks into the Save/Finalize row.
      setRefineErrors((prev) => ({ ...prev, [index]: result.error }));
    }
    setRefiningIndex(null);
  }

  function dismissRefineError(index: number) {
    setRefineErrors((prev) => {
      if (!(index in prev)) return prev;
      const next = { ...prev };
      delete next[index];
      return next;
    });
  }

  return (
    <div className="space-y-4">
      {/* Briefing banner */}
      {fromBriefing && aiDrafted && isEditable && (
        <Card className="border-l-4 border-l-accent bg-accent/5">
          <CardContent className="py-4 flex items-start gap-3">
            <div className="h-8 w-8 rounded-lg bg-accent flex items-center justify-center shrink-0">
              <span className="text-sm">🧠</span>
            </div>
            <div>
              <p className="text-sm font-medium text-text">
                This note was pre-seeded from your intelligence briefing
              </p>
              <p className="text-xs text-text-muted mt-1 leading-relaxed">
                The Assessment and Plan already incorporate your talking points
                and risk flags. Review each section, use the AI refine buttons to
                adjust, then sign when ready.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Visit Snapshot — EMR-131: quick summary so the provider
          doesn't have to read through the entire prior note */}
      {aiDrafted && isEditable && (
        <Card className="border-l-4 border-l-accent bg-accent/[0.03]">
          <CardContent className="py-3">
            <p className="text-[10px] uppercase tracking-[0.12em] text-accent font-medium mb-1.5">
              Visit snapshot
            </p>
            <p className="text-xs text-text-muted leading-relaxed">
              This note was pre-drafted by the AI scribe using the patient&apos;s
              chart, recent outcomes, and your pre-visit briefing. Review
              each section — the Assessment and Plan already incorporate
              your talking points. Use the AI refine buttons to adjust
              tone, expand, or add dosing detail. Sign when ready.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Status + AI badges + template picker (EMR-174) */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap">
          <Badge
            tone={
              currentStatus === "finalized"
                ? "success"
                : currentStatus === "needs_review"
                  ? "warning"
                  : "neutral"
            }
          >
            {currentStatus}
          </Badge>
          {aiDrafted && <Badge tone="highlight">AI-drafted</Badge>}
          {aiConfidence !== null && (
            <Badge tone="info">
              Confidence {Math.round(aiConfidence * 100)}%
            </Badge>
          )}
          {fromBriefing && <Badge tone="accent">Briefing-seeded</Badge>}
        </div>
        <NoteTemplatePicker
          disabled={!isEditable}
          hasExistingContent={blocks.some((b) => b.body.trim().length > 0)}
          onApply={(template, incoming) => applyTemplate(template.name, incoming)}
        />
      </div>

      {/* Emotional vitals — EMR-134: emoji demeanor scale persisted to encounter */}
      {isEditable && (
        <div className="flex items-center gap-3 flex-wrap">
          <span className="text-[10px] uppercase tracking-[0.12em] text-text-subtle">
            Patient demeanor:
          </span>
          {PATIENT_DEMEANOR_OPTIONS.map((mood) => {
            const selected = demeanor === mood.value;
            return (
              <button
                key={mood.value}
                type="button"
                title={mood.label}
                onClick={() => handleDemeanor(mood.value)}
                disabled={demeanorPending}
                aria-pressed={selected}
                className={`text-2xl rounded-lg p-1 transition-all focus:outline-none focus:ring-2 focus:ring-accent/40 ${
                  selected
                    ? "scale-125 bg-accent-soft ring-2 ring-accent/40"
                    : "hover:scale-110 opacity-70 hover:opacity-100"
                } disabled:opacity-50`}
              >
                {mood.emoji}
              </button>
            );
          })}
          {demeanor && (
            <span className="text-[11px] text-text-subtle">
              Recorded as {PATIENT_DEMEANOR_OPTIONS.find((o) => o.value === demeanor)?.label.toLowerCase()}
            </span>
          )}
        </div>
      )}

      {/* Note blocks */}
      <div className="space-y-3">
        {blocks.map((block, i) => (
          <Card key={i}>
            <CardContent className="pt-5 pb-5 space-y-2">
              {isEditable ? (
                <>
                  <input
                    type="text"
                    value={block.heading}
                    onChange={(e) => updateBlock(i, "heading", e.target.value)}
                    className="w-full font-display text-lg font-medium text-text tracking-tight bg-transparent border-0 border-b border-border/60 pb-1.5 focus:outline-none focus:border-accent transition-colors"
                    placeholder="Section heading"
                  />
                  <div className="relative">
                    {/* EMR-135 + UX dictation + UX markdown editor: rich
                        markdown surface (toolbar + slash menu + preview)
                        for narrative SOAP/APSO sections, with the dictate
                        button anchored top-right.

                        CRITICAL: the Objective block (NoteBlockType
                        "findings") is human-authored only per Dr. Patel
                        and Doc 1 / Doc 3 in EMR/docs/product-feedback —
                        the MarkdownEditor still renders (the user needs
                        to write structured text!), but we (a) pass
                        omitForObjective so the editor stamps the
                        data-objective-gated attribute and future AI
                        toolbar actions are suppressed, and (b) hide the
                        DictateButton entirely. The AI Refine buttons row
                        below is also conditionally hidden for findings. */}
                    <MarkdownEditor
                      value={block.body}
                      onChange={(v) => updateBlock(i, "body", v)}
                      rows={Math.max(4, block.body.split("\n").length + 1)}
                      omitForObjective={block.type === "findings"}
                      placeholder="Note content. Use the toolbar or type / for block commands."
                      aria-label={`${block.heading} body`}
                      textareaClassName={block.type === "findings" ? "" : "pr-10"}
                    />
                    {block.type !== "findings" && (
                      <DictateButton
                        onText={(text) => {
                          const sep = block.body && !/\s$/.test(block.body) ? " " : "";
                          updateBlock(i, "body", `${block.body}${sep}${text.trim()}`);
                        }}
                        className="absolute top-12 right-2"
                      />
                    )}
                  </div>
                  {/* AI Refine buttons — gated for Objective per Dr. Patel
                      and Doc 1 / Doc 3: the SOAP/APSO Objective ("findings")
                      block is human-authored only, so no AI affordance is
                      offered for it. */}
                  {block.type !== "findings" ? (
                    <div className="flex items-center gap-1.5 pt-1">
                      <span className="text-[10px] text-text-subtle uppercase tracking-wider mr-1">
                        AI:
                      </span>
                      {REFINE_OPTIONS.map((opt) => (
                        <button
                          key={opt.mode}
                          onClick={() => handleRefine(i, opt.mode)}
                          disabled={refiningIndex !== null}
                          className={`inline-flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-medium transition-all ${
                            refiningIndex === i
                              ? "bg-accent/20 text-accent animate-pulse"
                              : "bg-surface-muted text-text-subtle hover:bg-accent/10 hover:text-accent border border-border/40"
                          } disabled:opacity-50`}
                        >
                          <span className="font-mono text-[9px]">{opt.icon}</span>
                          {opt.label}
                        </button>
                      ))}
                      {refiningIndex === i && (
                        <span className="text-[10px] text-accent ml-1 animate-pulse">
                          Refining...
                        </span>
                      )}
                    </div>
                  ) : (
                    <p className="pt-1 text-[10px] text-text-subtle italic">
                      Human-authored only — no AI refine for Objective findings.
                    </p>
                  )}
                  {refineErrors[i] && (
                    <div
                      role="alert"
                      className="mt-2 flex items-start gap-2 rounded-md border border-highlight/30 bg-highlight-soft/50 px-3 py-2 text-[11px] text-[color:var(--highlight-hover)]"
                    >
                      <span aria-hidden="true" className="shrink-0 mt-0.5">⚠</span>
                      <span className="flex-1 leading-relaxed">
                        {refineErrors[i]}
                      </span>
                      <button
                        type="button"
                        onClick={() => dismissRefineError(i)}
                        aria-label="Dismiss"
                        className="shrink-0 text-text-subtle hover:text-text transition-colors"
                      >
                        ✕
                      </button>
                    </div>
                  )}
                </>
              ) : (
                <>
                  <h3 className="font-display text-lg font-medium text-text tracking-tight">
                    {block.heading}
                  </h3>
                  <p className="text-sm text-text-muted leading-relaxed whitespace-pre-wrap">
                    {block.body}
                  </p>
                </>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Action buttons */}
      {isEditable && (
        <div className="flex items-center gap-3 pt-2">
          <Button variant="secondary" onClick={handleSave} disabled={isPending}>
            {isPending ? "Saving..." : "Save draft"}
          </Button>
          <Button variant="primary" onClick={handleFinalize} disabled={isPending}>
            {isPending ? "Finalizing..." : "Finalize & sign"}
          </Button>
          {saveMessage && (
            <span className="text-sm text-text-muted">
              {scrubMessage(saveMessage)}
            </span>
          )}
        </div>
      )}

      {/* Finalized success state with coding suggestions */}
      {currentStatus === "finalized" && codingSuggestion && (
        <Card tone="ambient" className="mt-6">
          <CardContent className="pt-6">
            <h3 className="font-display text-lg font-medium text-text tracking-tight mb-3">
              Coding Suggestions
            </h3>
            {codingSuggestion.icd10 &&
              Array.isArray(codingSuggestion.icd10) &&
              codingSuggestion.icd10.length > 0 && (
                <div className="mb-4">
                  <p className="text-xs font-medium text-text-subtle uppercase tracking-wider mb-2">
                    ICD-10 Codes
                  </p>
                  <ul className="space-y-1.5">
                    {codingSuggestion.icd10.map(
                      (
                        code: { code: string; label: string; confidence: number },
                        i: number
                      ) => (
                        <li key={i} className="flex items-center gap-2 text-sm">
                          <Badge tone="accent">{code.code}</Badge>
                          <span className="text-text">{code.label}</span>
                          <span className="text-text-subtle text-xs">
                            ({Math.round(code.confidence * 100)}%)
                          </span>
                        </li>
                      )
                    )}
                  </ul>
                </div>
              )}
            {codingSuggestion.emLevel && (
              <div className="mb-3">
                <p className="text-xs font-medium text-text-subtle uppercase tracking-wider mb-1">
                  E/M Level
                </p>
                <Badge tone="info">{codingSuggestion.emLevel}</Badge>
              </div>
            )}
            {codingSuggestion.rationale && (
              <div>
                <p className="text-xs font-medium text-text-subtle uppercase tracking-wider mb-1">
                  Rationale
                </p>
                <p className="text-sm text-text-muted leading-relaxed">
                  {codingSuggestion.rationale}
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {currentStatus === "finalized" && !codingSuggestion && (
        <Card className="mt-6">
          <CardContent className="pt-6 text-center">
            <p className="text-sm text-text-muted">
              Note finalized. Coding suggestions will appear once the Coding Readiness Agent processes this note.
            </p>
          </CardContent>
        </Card>
      )}

      {/* ── Generate Leaflet (after finalization) ──── */}
      {currentStatus === "finalized" && (
        <Card className="mt-6 border-l-4 border-l-accent">
          <CardContent className="pt-6 pb-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <LeafSprig size={20} className="text-accent" />
                <div>
                  <p className="text-sm font-medium text-text">Generate Leaflet</p>
                  <p className="text-xs text-text-muted">Print a branded after-visit summary for the patient</p>
                </div>
              </div>
              <a href={`/clinic/patients/${patientId}/leaflet?encounter=${encounterId}`}>
                <Button size="sm">Create Leaflet</Button>
              </a>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
