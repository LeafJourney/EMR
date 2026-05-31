"use client";

import { useState, useRef, useCallback, useTransition } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils/cn";
import type { ConsentTemplate, ConsentField } from "@/lib/domain/consent-forms";
import { DEFAULT_TEMPLATES } from "@/lib/domain/consent-forms";
import { lobbySubmitConsent } from "../actions";

// Phone-friendly consent capture for the lobby. Adapted from the portal
// ConsentView: same templates + signature pad, but each completed form is
// STAGED for staff review via lobbySubmitConsent (no SignedConsent write, no
// client patientId). Locally tracks which forms are done so the list reflects
// progress within this session.

function SignaturePad({ onSign }: { onSign: (dataUrl: string) => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [drawing, setDrawing] = useState(false);
  const [has, setHas] = useState(false);

  const pos = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    const c = canvasRef.current;
    if (!c) return { x: 0, y: 0 };
    const r = c.getBoundingClientRect();
    const cx = "touches" in e ? e.touches[0].clientX : e.clientX;
    const cy = "touches" in e ? e.touches[0].clientY : e.clientY;
    return { x: cx - r.left, y: cy - r.top };
  }, []);

  const start = useCallback(
    (e: React.MouseEvent | React.TouchEvent) => {
      const ctx = canvasRef.current?.getContext("2d");
      if (!ctx) return;
      const { x, y } = pos(e);
      ctx.beginPath();
      ctx.moveTo(x, y);
      setDrawing(true);
    },
    [pos],
  );

  const move = useCallback(
    (e: React.MouseEvent | React.TouchEvent) => {
      if (!drawing) return;
      const ctx = canvasRef.current?.getContext("2d");
      if (!ctx) return;
      const { x, y } = pos(e);
      ctx.lineTo(x, y);
      ctx.strokeStyle = "#1a1a1a";
      ctx.lineWidth = 2;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.stroke();
      setHas(true);
    },
    [drawing, pos],
  );

  const end = useCallback(() => {
    if (drawing && has && canvasRef.current) onSign(canvasRef.current.toDataURL());
    setDrawing(false);
  }, [drawing, has, onSign]);

  function clear() {
    const c = canvasRef.current;
    const ctx = c?.getContext("2d");
    if (!ctx || !c) return;
    ctx.clearRect(0, 0, c.width, c.height);
    setHas(false);
    onSign("");
  }

  return (
    <div>
      <div className="relative border-2 border-dashed border-border-strong/60 rounded-lg overflow-hidden bg-white">
        <canvas
          ref={canvasRef}
          width={500}
          height={150}
          className="w-full h-[150px] touch-none"
          onMouseDown={start}
          onMouseMove={move}
          onMouseUp={end}
          onMouseLeave={end}
          onTouchStart={start}
          onTouchMove={move}
          onTouchEnd={end}
        />
        {!has && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <p className="text-sm text-text-subtle">Sign here</p>
          </div>
        )}
      </div>
      {has && (
        <button type="button" onClick={clear} className="text-xs text-text-muted mt-1.5">
          Clear signature
        </button>
      )}
    </div>
  );
}

function Field({
  field,
  value,
  onChange,
}: {
  field: ConsentField;
  value: string | boolean;
  onChange: (v: string | boolean) => void;
}) {
  switch (field.type) {
    case "paragraph":
      return (
        <div className="p-4 rounded-lg bg-surface-muted/50 border border-border/60">
          <p className="text-sm text-text leading-relaxed">{field.content}</p>
        </div>
      );
    case "acknowledgment":
      return (
        <label
          className={cn(
            "flex items-start gap-3 p-4 rounded-lg border cursor-pointer transition-colors",
            value ? "bg-accent/5 border-accent/20" : "bg-surface-muted/30 border-border/60",
          )}
        >
          <input
            type="checkbox"
            checked={!!value}
            onChange={(e) => onChange(e.target.checked)}
            className="mt-0.5 h-4 w-4 rounded border-border-strong text-accent focus:ring-accent/20 shrink-0"
          />
          <div>
            <p className="text-sm font-medium text-text mb-1">{field.label}</p>
            {field.content && (
              <p className="text-sm text-text-muted leading-relaxed">{field.content}</p>
            )}
          </div>
        </label>
      );
    case "text":
      return (
        <div>
          <label className="text-sm font-medium text-text mb-1.5 inline-block">
            {field.label}
            {field.required && <span className="text-danger ml-0.5">*</span>}
          </label>
          <Input value={(value as string) || ""} onChange={(e) => onChange(e.target.value)} />
        </div>
      );
    case "date":
      return (
        <div>
          <label className="text-sm font-medium text-text mb-1.5 inline-block">
            {field.label}
            {field.required && <span className="text-danger ml-0.5">*</span>}
          </label>
          <Input
            type="date"
            value={(value as string) || ""}
            onChange={(e) => onChange(e.target.value)}
          />
        </div>
      );
    case "signature":
      return (
        <div>
          <label className="text-sm font-medium text-text mb-1.5 inline-block">
            {field.label}
            {field.required && <span className="text-danger ml-0.5">*</span>}
          </label>
          <SignaturePad onSign={(d) => onChange(d)} />
        </div>
      );
    default:
      return null;
  }
}

export function LobbyConsentView() {
  const [selected, setSelected] = useState<ConsentTemplate | null>(null);
  const [responses, setResponses] = useState<Record<string, string | boolean>>({});
  const [doneIds, setDoneIds] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [pending, startSubmit] = useTransition();

  const templates = DEFAULT_TEMPLATES;

  function open(t: ConsentTemplate) {
    if (doneIds.has(t.id)) return;
    setSelected(t);
    setResponses({});
    setError(null);
  }

  function complete(): boolean {
    if (!selected) return false;
    return selected.fields
      .filter((f) => f.required)
      .every((f) => {
        const v = responses[f.id];
        if (f.type === "paragraph") return true;
        if (f.type === "acknowledgment") return v === true;
        return !!v;
      });
  }

  function submit() {
    if (!selected || !complete()) return;
    setError(null);
    const sigField = selected.fields.find((f) => f.type === "signature");
    const signatureData = sigField ? (responses[sigField.id] as string) || undefined : undefined;
    const template = selected;
    startSubmit(async () => {
      const res = await lobbySubmitConsent({
        templateId: template.id,
        templateName: template.name,
        version: template.version,
        responses,
        signatureData,
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setDoneIds((prev) => new Set(prev).add(template.id));
      setSelected(null);
      setResponses({});
    });
  }

  // ── List view ──
  if (!selected) {
    const allDone = templates.every((t) => doneIds.has(t.id));
    return (
      <div className="space-y-3">
        {templates.map((t) => {
          const done = doneIds.has(t.id);
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => open(t)}
              disabled={done}
              className={cn(
                "w-full text-left rounded-2xl border px-5 py-4 transition-all",
                done
                  ? "border-emerald-200/60 bg-emerald-50/40 cursor-default"
                  : "border-border/60 bg-surface hover:border-accent hover:bg-accent/5",
              )}
            >
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-text">{t.name}</p>
                  <p className="text-xs text-text-muted mt-0.5">{t.description}</p>
                </div>
                <span aria-hidden="true" className={done ? "text-emerald-600 text-xl" : "text-text-subtle text-xl"}>
                  {done ? "✓" : "›"}
                </span>
              </div>
            </button>
          );
        })}

        {allDone && (
          <Link
            href="/kiosk/lobby"
            className="mt-4 inline-flex w-full items-center justify-center rounded-full bg-accent text-accent-ink px-6 py-3 text-sm font-medium"
          >
            Back to my check-in
          </Link>
        )}
      </div>
    );
  }

  // ── Form view ──
  return (
    <div className="space-y-5">
      <button
        type="button"
        onClick={() => setSelected(null)}
        className="text-sm text-accent flex items-center gap-1"
      >
        ‹ Back to all forms
      </button>

      <div>
        <h2 className="font-display text-xl text-text tracking-tight">{selected.name}</h2>
        <p className="text-xs text-text-muted mt-1">{selected.description}</p>
      </div>

      <div className="p-4 rounded-lg bg-amber-50/60 border border-amber-200/60">
        <p className="text-xs font-medium uppercase tracking-wider text-amber-700 mb-1">
          Legal notice
        </p>
        <p className="text-sm text-amber-900/80 leading-relaxed">{selected.legalText}</p>
      </div>

      <div className="space-y-4">
        {selected.fields.map((f) => (
          <Field
            key={f.id}
            field={f}
            value={responses[f.id] ?? (f.type === "acknowledgment" ? false : "")}
            onChange={(v) => setResponses((p) => ({ ...p, [f.id]: v }))}
          />
        ))}
      </div>

      {error && <p className="text-sm text-danger">{error}</p>}

      <Button onClick={submit} disabled={!complete() || pending} size="lg" className="w-full">
        {pending ? "Submitting…" : "Submit consent"}
      </Button>
    </div>
  );
}
