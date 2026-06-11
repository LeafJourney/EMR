"use client";

/**
 * Images tab — Dr. Patel revision cluster EMR-899/900/901/902.
 *
 * - 902: Images / Cardiology subtabs with the modality + body-part taxonomy
 *        and a "Cindy Says" AI read on the right pane.
 * - 900: right-click recategorize, hover-to-favourite star, drag-and-drop
 *        upload restricted to imaging file types.
 * - 901: DICOM viewer with a tools ribbon, share, dark-mode, fullscreen,
 *        inline comments, and MM-DD-YYYY dates.
 * - 899: "LeafAnatomy" — a layered anatomical model with annotation and a
 *        "Cindy Sees" interpretation.
 */

import * as React from "react";
import { cn } from "@/lib/utils/cn";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { DicomViewer } from "./dicom-viewer";
import { Bubble, CindySays, ModalShell, usePersistentState, useChartLedger } from "./chart-kit";
import type { ChartDoc } from "./records-tab";
import {
  IMAGING_MODALITIES,
  CARDIOLOGY_STUDIES,
} from "@/lib/clinical/records-taxonomy";
import { cindyImageRead } from "@/lib/clinical/cindy-says";

const IMAGE_EXT = [".png", ".jpg", ".jpeg", ".pdf", ".tiff", ".heic", ".dcm", ".dicom"];

function guessModality(doc: ChartDoc): string {
  const hay = `${doc.name} ${doc.tags.join(" ")}`.toLowerCase();
  for (const m of IMAGING_MODALITIES) {
    if (hay.includes(m.label.toLowerCase()) || hay.includes(m.key)) return m.key;
  }
  return "ct";
}

export function ImagesTab({
  patientId,
  documents,
}: {
  patientId: string;
  documents: ChartDoc[];
}) {
  const [subtab, setSubtab] = React.useState<"images" | "cardiology">("images");
  const [modality, setModality] = React.useState<string | null>(null);
  const [anatomyOpen, setAnatomyOpen] = React.useState(false);
  const [recategorize, setRecategorize] = React.useState<ChartDoc | null>(null);
  const [favorites, setFavorites] = usePersistentState<string[]>(
    `image-favorites:${patientId}:v1`,
    [],
  );

  const cindy = cindyImageRead(
    documents[0]?.name ?? "Imaging on file",
    documents.map((d) => d.name).join("; "),
  );

  const filtered =
    subtab === "images"
      ? documents.filter((d) => !modality || guessModality(d) === modality)
      : documents;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between mb-1 gap-3 flex-wrap">
        <h2 className="font-display text-xl text-text tracking-tight">Images</h2>
        {/* EMR-899: LeafAnatomy launcher */}
        <button
          type="button"
          onClick={() => setAnatomyOpen(true)}
          className="text-xs px-2.5 py-1.5 rounded-md border border-accent/30 bg-accent-soft text-accent hover:bg-accent-soft/70 transition-colors"
          title="Open LeafAnatomy"
        >
          🧍 LeafAnatomy
        </button>
      </div>

      {/* EMR-902: subtab ribbon */}
      <div className="flex gap-1.5 border-b border-border/60 pb-2">
        {(["images", "cardiology"] as const).map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => {
              setSubtab(s);
              setModality(null);
            }}
            className={cn(
              "px-3 py-1 text-sm font-medium rounded-md capitalize transition-colors",
              subtab === s ? "bg-accent text-accent-ink" : "text-text-muted hover:bg-surface-muted",
            )}
          >
            {s}
          </button>
        ))}
      </div>

      {/* Modality / study bubbles + body parts */}
      {subtab === "images" ? (
        <div className="space-y-2">
          <div className="flex flex-wrap gap-1.5">
            {IMAGING_MODALITIES.map((m) => (
              <Bubble
                key={m.key}
                className={m.colorClass}
                active={modality === m.key}
                onClick={() => setModality(modality === m.key ? null : m.key)}
              >
                {m.label}
              </Bubble>
            ))}
          </div>
          {modality && (
            <div className="flex flex-wrap gap-1">
              {IMAGING_MODALITIES.find((m) => m.key === modality)?.bodyParts.map((bp) => (
                <Bubble key={bp} tone="beige">
                  {bp}
                </Bubble>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {CARDIOLOGY_STUDIES.map((c) => (
            <Bubble key={c.key} tone="info">
              {c.label}
            </Bubble>
          ))}
        </div>
      )}

      {/* Two-pane: image grid + Cindy Says */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2">
          {filtered.length === 0 ? (
            <EmptyState
              title="No images in this view"
              description="Drag imaging files below — DICOM, PNG, JPG, PDF, TIFF or HEIC only."
            />
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {filtered.map((doc) => (
                <ImageTile
                  key={doc.id}
                  doc={doc}
                  patientId={patientId}
                  favorite={favorites.includes(doc.id)}
                  onToggleFav={() =>
                    setFavorites((prev) =>
                      prev.includes(doc.id)
                        ? prev.filter((x) => x !== doc.id)
                        : [...prev, doc.id],
                    )
                  }
                  onRecategorize={() => setRecategorize(doc)}
                />
              ))}
            </div>
          )}
        </div>
        {/* EMR-902: Cindy Says pane */}
        <div className="space-y-3">
          <CindySays analysis={cindy} />
          <p className="text-[11px] text-text-subtle">
            Cindy Sees is an AI imaging read — a 3–5 bullet interpretation of the
            studies on file. Draft read; verify before charting.
          </p>
        </div>
      </div>

      {/* EMR-900: drag-and-drop upload, imaging types only */}
      <ImageDropZone />

      {/* EMR-901: DICOM viewer with tools */}
      <DicomViewerPro patientId={patientId} />

      {/* Recategorize popup */}
      <ModalShell
        open={recategorize !== null}
        onClose={() => setRecategorize(null)}
        eyebrow="Recategorize"
        title={recategorize?.name ?? ""}
        placement="center"
        maxWidth="max-w-sm"
      >
        <p className="text-sm text-text-muted mb-3">Set the correct image type:</p>
        <div className="flex flex-wrap gap-1.5">
          {IMAGING_MODALITIES.map((m) => (
            <Bubble
              key={m.key}
              className={m.colorClass}
              onClick={() => setRecategorize(null)}
            >
              {m.label}
            </Bubble>
          ))}
        </div>
      </ModalShell>

      {/* EMR-899: LeafAnatomy modal */}
      <LeafAnatomyModal open={anatomyOpen} onClose={() => setAnatomyOpen(false)} />
    </div>
  );
}

function ImageTile({
  doc,
  patientId,
  favorite,
  onToggleFav,
  onRecategorize,
}: {
  doc: ChartDoc;
  patientId: string;
  favorite: boolean;
  onToggleFav: () => void;
  onRecategorize: () => void;
}) {
  return (
    <div
      className="relative group"
      onContextMenu={(e) => {
        e.preventDefault();
        onRecategorize();
      }}
    >
      {/* Hover favourite star */}
      <button
        type="button"
        onClick={onToggleFav}
        title={favorite ? "Unfavourite" : "Favourite"}
        className={cn(
          "absolute top-1.5 right-1.5 z-10 h-6 w-6 rounded-full bg-surface/90 flex items-center justify-center text-sm transition-opacity",
          favorite ? "opacity-100" : "opacity-0 group-hover:opacity-100",
        )}
      >
        {favorite ? "⭐" : "☆"}
      </button>
      <a
        href={`/clinic/patients/${patientId}/documents/${doc.id}/view`}
        target="_blank"
        rel="noopener noreferrer"
        className="block"
      >
        <Card tone="raised" className="card-hover overflow-hidden">
          <div className="aspect-square bg-surface-muted flex items-center justify-center text-3xl">
            🩻
          </div>
          <CardContent className="pt-2 pb-2">
            <p className="text-xs font-medium text-text truncate">{doc.name}</p>
            <p className="text-[11px] font-semibold text-text tabular-nums mt-0.5">
              {mmddyyyy(doc.createdAt)}
            </p>
          </CardContent>
        </Card>
      </a>
    </div>
  );
}

function ImageDropZone() {
  const [over, setOver] = React.useState(false);
  const [rejected, setRejected] = React.useState<string | null>(null);

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setOver(false);
    const f = e.dataTransfer.files?.[0];
    if (!f) return;
    const ok = IMAGE_EXT.some((ext) => f.name.toLowerCase().endsWith(ext));
    setRejected(ok ? null : f.name);
  }

  return (
    <Card tone="outlined">
      <CardContent className="pt-5 pb-5">
        <p className="text-xs font-medium text-text-muted uppercase tracking-wide mb-3">
          Upload an image
        </p>
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setOver(true);
          }}
          onDragLeave={() => setOver(false)}
          onDrop={onDrop}
          className={cn(
            "rounded-lg border-2 border-dashed p-5 text-center mb-3 cursor-pointer transition-colors",
            over ? "border-accent bg-accent-soft/40" : "border-border",
          )}
        >
          <p className="text-sm text-text-muted">
            Drag &amp; drop imaging files — DICOM, PNG, JPG, PDF, TIFF, HEIC only.
          </p>
          {rejected && (
            <p className="text-xs text-danger mt-2">
              “{rejected}” is not an imaging file — rejected.
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

/** EMR-901: DICOM viewer wrapped with tools / share / dark-mode / comments. */
function DicomViewerPro({ patientId }: { patientId: string }) {
  const { record } = useChartLedger(patientId);
  const [dark, setDark] = React.useState(false);
  const [fullscreen, setFullscreen] = React.useState(false);
  const [tool, setTool] = React.useState<string | null>(null);
  const [shareOpen, setShareOpen] = React.useState(false);
  const [comment, setComment] = React.useState("");

  const tools = ["highlight", "color", "circle", "mark", "annotate"];

  const headerControls = (
    <div className="flex items-center gap-1.5">
      <button
        type="button"
        onClick={() => setShareOpen(true)}
        title="Share"
        className="px-2 py-1 text-[11px] rounded-md border border-border"
      >
        📤 Share
      </button>
      <button
        type="button"
        onClick={() => setDark((d) => !d)}
        title="Toggle dark mode"
        className="px-2 py-1 text-[11px] rounded-md border border-border"
      >
        {dark ? "🌙 Dark" : "💡 Light"}
      </button>
    </div>
  );

  const ribbon = (
    <div className="flex items-center gap-1.5 flex-wrap">
      {tools.map((t) => (
        <button
          key={t}
          type="button"
          onClick={() => setTool(tool === t ? null : t)}
          className={cn(
            "px-2 py-1 text-[11px] rounded-md border capitalize",
            tool === t ? "border-accent bg-accent-soft text-accent" : "border-border text-text-muted",
          )}
        >
          {t}
        </button>
      ))}
      <button
        type="button"
        onClick={() => setFullscreen((f) => !f)}
        title="Fullscreen"
        className="px-2 py-1 text-[11px] rounded-md border border-border"
      >
        ⛶
      </button>
    </div>
  );

  const viewer = (
    <div
      className={cn(
        "rounded-lg p-3 transition-colors",
        dark ? "bg-black" : "bg-[#f5efe2]",
      )}
    >
      <DicomViewer />
    </div>
  );

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <h3 className="font-display text-lg text-text tracking-tight">DICOM Viewer</h3>
          {headerControls}
        </div>
        <span className="text-[11px] text-text-subtle">Type categorized by modality</span>
      </div>
      {ribbon}
      {viewer}

      {/* Inline comments */}
      <div className="rounded-lg border border-border p-3">
        <p className="text-[11px] font-medium uppercase tracking-wide text-text-subtle mb-1.5">
          Comments
        </p>
        <textarea
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          rows={2}
          placeholder="Comment on this image…"
          className="w-full text-sm rounded-md border border-border bg-surface px-2 py-1.5 text-text focus:outline-none focus:border-accent resize-none"
        />
        <div className="flex justify-end gap-1.5 mt-1.5">
          <button
            type="button"
            onClick={() => setComment("")}
            className="px-2 py-1 text-[11px] rounded-md text-text-muted hover:bg-surface-muted"
          >
            Draft
          </button>
          <button
            type="button"
            disabled={!comment.trim()}
            onClick={() => {
              record({ kind: "note", source: "Imaging", subject: comment.trim() });
              setComment("");
            }}
            className="px-2 py-1 text-[11px] rounded-md font-medium bg-accent text-accent-ink disabled:opacity-40"
          >
            Save
          </button>
        </div>
      </div>

      {fullscreen && (
        <div className="fixed inset-0 z-50 bg-black/90 p-6 flex flex-col gap-3">
          <div className="flex items-center justify-between">
            {ribbon}
            <button
              type="button"
              onClick={() => setFullscreen(false)}
              className="px-3 py-1.5 text-sm rounded-md bg-surface text-text"
            >
              Exit fullscreen
            </button>
          </div>
          <div className="flex-1 overflow-auto">{viewer}</div>
        </div>
      )}

      <ModalShell
        open={shareOpen}
        onClose={() => setShareOpen(false)}
        eyebrow="Share image"
        title="Send to patient / staff / provider"
        placement="center"
        maxWidth="max-w-sm"
      >
        <div className="space-y-2">
          {["Actual image", "Image report", "Both"].map((opt) => (
            <button
              key={opt}
              type="button"
              onClick={() => {
                record({ kind: "note", source: "Imaging", subject: `Shared: ${opt}` });
                setShareOpen(false);
              }}
              className="w-full text-left px-3 py-2 rounded-md border border-border hover:bg-surface-muted text-sm"
            >
              {opt}
            </button>
          ))}
        </div>
      </ModalShell>
    </section>
  );
}

const ANATOMY_LAYERS = ["Skin", "Muscles", "Tendons", "Nerves", "Veins", "Arteries", "Bones", "Organs"];

function LeafAnatomyModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [layers, setLayers] = React.useState<string[]>(["Skin", "Bones"]);
  const [note, setNote] = React.useState("");

  return (
    <ModalShell
      open={open}
      onClose={onClose}
      eyebrow="LeafAnatomy"
      title="🧍 Anatomical model"
      placement="center"
      maxWidth="max-w-3xl"
    >
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Layer selector */}
        <div className="space-y-1.5">
          <p className="text-[11px] font-medium uppercase tracking-wide text-text-subtle mb-1">
            Layers
          </p>
          {ANATOMY_LAYERS.map((l) => (
            <label key={l} className="flex items-center gap-2 text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={layers.includes(l)}
                onChange={() =>
                  setLayers((prev) =>
                    prev.includes(l) ? prev.filter((x) => x !== l) : [...prev, l],
                  )
                }
              />
              {l}
            </label>
          ))}
        </div>
        {/* Body model placeholder */}
        <div className="md:col-span-2 space-y-3">
          <div className="rounded-xl border border-border bg-gradient-to-b from-surface-muted to-surface aspect-[3/4] max-h-72 flex flex-col items-center justify-center text-center">
            <span className="text-6xl" aria-hidden="true">🧍</span>
            <p className="text-xs text-text-muted mt-2">
              Active layers: {layers.join(", ") || "none"}
            </p>
            <p className="text-[10px] text-text-subtle mt-1 px-6">
              Mark / circle / highlight DICOM findings onto the model. Detailed
              3-D rendering renders here when the LeafAnatomy engine is enabled.
            </p>
          </div>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={2}
            placeholder="Annotate this anatomical view…"
            className="w-full text-sm rounded-md border border-border bg-surface px-2 py-1.5 text-text focus:outline-none focus:border-accent resize-none"
          />
          <CindySays analysis={cindyImageRead("Anatomical correlation", note)} />
        </div>
      </div>
    </ModalShell>
  );
}

function mmddyyyy(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${mm}-${dd}-${d.getFullYear()}`;
}
