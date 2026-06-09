"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { LeafSprig, EditorialRule } from "@/components/ui/ornament";
import { LogoMark } from "@/components/ui/logo";
import {
  generateLeafletNarrative,
  saveLeafletToChart,
  type LeafletTone,
} from "./actions";
import type { LeafletData } from "@/lib/domain/leaflet";

interface Props {
  data: LeafletData;
  encounterId: string;
  initialNarrative: string;
}

export function LeafletEditor({ data, encounterId, initialNarrative }: Props) {
  const [narrative, setNarrative] = useState(initialNarrative);
  const [discussed, setDiscussed] = useState(data.discussed);
  const [nextSteps, setNextSteps] = useState(data.nextSteps);
  const [carePlanNotes, setCarePlanNotes] = useState(data.carePlanNotes);
  const [tone, setTone] = useState<LeafletTone>("warm");
  const [saved, setSaved] = useState(false);
  const [isPending, startTransition] = useTransition();

  // Assemble the clinician's in-editor edits back onto the leaflet data.
  // Without this, regenerate/save used the ORIGINAL `data` and silently
  // discarded every correction the clinician just made.
  function editedData(): LeafletData {
    return { ...data, discussed, nextSteps, carePlanNotes };
  }

  function handleRegenerate() {
    startTransition(async () => {
      const result = await generateLeafletNarrative(editedData(), tone);
      if (result.ok) setNarrative(result.narrative);
    });
  }

  function handleSave() {
    startTransition(async () => {
      await saveLeafletToChart(encounterId, narrative, editedData());
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    });
  }

  return (
    <>
      {/* ── Print styles ────────────────────── */}
      <style dangerouslySetInnerHTML={{ __html: `
        @media print {
          nav, aside, [data-shell-sidebar], [data-shell-topbar], .leaflet-controls {
            display: none !important;
          }
          body {
            background: white !important;
            color: #1C1A15 !important;
            font-size: 11pt !important;
            line-height: 1.5 !important;
          }
          .leaflet-doc {
            max-width: 100% !important;
            padding: 0 !important;
            margin: 0 !important;
            box-shadow: none !important;
            border: none !important;
          }
          .leaflet-editable { border: none !important; background: transparent !important; padding: 0 !important; }
          .leaflet-watermark { opacity: 0.04 !important; }
          @page { margin: 0.75in; size: letter; }
        }
      `}} />

      {/* ── Controls bar ────────────────────── */}
      <div className="leaflet-controls flex items-center justify-between gap-3 mb-6 flex-wrap">
        <div className="flex items-center gap-2">
          <span className="text-sm text-text-muted">Tone:</span>
          {(["warm", "clinical", "brief"] as LeafletTone[]).map((t) => (
            <button
              key={t}
              onClick={() => { setTone(t); }}
              className={`text-xs px-3 py-1.5 rounded-full border transition-colors capitalize ${
                tone === t
                  ? "bg-accent-soft border-accent/30 text-accent font-medium"
                  : "border-border/50 text-text-muted hover:text-text"
              }`}
            >
              {t}
            </button>
          ))}
          <Button size="sm" variant="ghost" onClick={handleRegenerate} disabled={isPending}>
            {isPending ? "..." : "Regenerate"}
          </Button>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="secondary" onClick={handleSave} disabled={isPending}>
            {saved ? "Saved!" : "Save to chart"}
          </Button>
          <Button size="sm" variant="secondary" onClick={() => window.print()}>
            PDF
          </Button>
          <Button size="sm" onClick={() => window.print()}>
            Print
          </Button>
        </div>
      </div>

      {/* ── Leaflet document ────────────────── */}
      <div className="leaflet-doc relative bg-white rounded-2xl border border-border shadow-lg overflow-hidden max-w-[700px] mx-auto">
        {/* Watermark */}
        <div className="leaflet-watermark absolute inset-0 flex items-center justify-center pointer-events-none opacity-[0.03]">
          <LeafSprig size={300} className="text-accent" />
        </div>

        <div className="relative z-10 px-10 py-10 md:px-14 md:py-12">
          {/* ── Header ──────────────────── */}
          <div className="flex items-center justify-between mb-8 pb-6 border-b border-border/40">
            <div className="flex items-center gap-3">
              <LogoMark size={32} />
              <div>
                <p className="font-display text-lg text-text tracking-tight">Leafjourney</p>
                <p className="text-[10px] text-text-subtle uppercase tracking-wider">After Visit Summary</p>
              </div>
            </div>
            <div className="text-right">
              <p className="font-display text-sm text-text">{data.patientName}</p>
              {data.patientDOB && <p className="text-xs text-text-subtle">DOB: {data.patientDOB}</p>}
            </div>
          </div>

          {/* ── Allergies (always prominent) ── */}
          {data.allergies.length > 0 && (
            <div className="mb-6 px-4 py-3 rounded-lg bg-red-50 border border-red-200">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-red-700 mb-1">Allergies</p>
              <div className="flex flex-wrap gap-1">
                {data.allergies.map((a) => (
                  <Badge key={a} tone="danger">{a}</Badge>
                ))}
              </div>
            </div>
          )}

          {/* ── Today's Visit ───────────── */}
          <section className="mb-6">
            <h2 className="font-display text-base text-accent tracking-tight mb-2 flex items-center gap-2">
              <LeafSprig size={14} className="text-accent/60" />
              Today&apos;s Visit
            </h2>
            <p className="text-sm text-text">
              {data.visit.date} &middot; {data.visit.modality.replace("_", " ")} with {data.visit.provider}
              {data.visit.reason && <> &middot; {data.visit.reason}</>}
            </p>
          </section>

          {/* ── What We Discussed ────────── */}
          <section className="mb-6">
            <h2 className="font-display text-base text-accent tracking-tight mb-2 flex items-center gap-2">
              <LeafSprig size={14} className="text-accent/60" />
              What We Discussed
            </h2>
            <textarea
              value={discussed}
              onChange={(e) => setDiscussed(e.target.value)}
              className="leaflet-editable w-full text-sm text-text leading-relaxed bg-surface-muted/30 border border-border/30 rounded-lg px-3 py-2 min-h-[80px] resize-y focus:outline-none focus:ring-1 focus:ring-accent/30 print:border-none print:bg-transparent print:p-0"
            />
          </section>

          {/* ── Your Care Plan ───────────── */}
          <section className="mb-6">
            <h2 className="font-display text-base text-accent tracking-tight mb-2 flex items-center gap-2">
              <LeafSprig size={14} className="text-accent/60" />
              Your Care Plan
            </h2>
            {/* The authoritative care plan is the clinician's SIGNED Plan note
                (editable here) — shown first so the handout leads with what was
                actually decided today, not the standing medication list. */}
            <textarea
              value={carePlanNotes}
              onChange={(e) => setCarePlanNotes(e.target.value)}
              className="leaflet-editable w-full text-sm text-text leading-relaxed bg-surface-muted/30 border border-border/30 rounded-lg px-3 py-2 min-h-[60px] resize-y focus:outline-none focus:ring-1 focus:ring-accent/30 print:border-none print:bg-transparent print:p-0"
            />
            {data.carePlan.length > 0 ? (
              <div className="mt-3">
                <p className="text-[11px] uppercase tracking-wider text-text-subtle mb-1.5">
                  Current medications on file
                </p>
                <div className="space-y-2">
                  {data.carePlan.map((med, i) => (
                    <div key={i} className="flex items-start gap-2 text-sm">
                      <Badge tone={med.type === "cannabis" ? "accent" : "neutral"} className="text-[10px] mt-0.5 shrink-0">
                        {med.type === "cannabis" ? "Cannabis" : "Rx"}
                      </Badge>
                      <div>
                        <span className="font-medium text-text">{med.name}</span>
                        {med.dosage && <span className="text-text-muted"> — {med.dosage}</span>}
                        {med.instructions && <p className="text-xs text-text-muted mt-0.5">{med.instructions}</p>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </section>

          {/* ── What to Do Next ──────────── */}
          <section className="mb-6">
            <h2 className="font-display text-base text-accent tracking-tight mb-2 flex items-center gap-2">
              <LeafSprig size={14} className="text-accent/60" />
              What to Do Next
            </h2>
            <ul className="space-y-2">
              {nextSteps.map((step, i) => (
                <li key={i} className="flex items-start gap-2">
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent text-[10px] font-medium mt-0.5">
                    {i + 1}
                  </span>
                  <input
                    value={step}
                    onChange={(e) => {
                      const updated = [...nextSteps];
                      updated[i] = e.target.value;
                      setNextSteps(updated);
                    }}
                    className="leaflet-editable flex-1 text-sm text-text bg-surface-muted/30 border border-border/30 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-accent/30 print:border-none print:bg-transparent print:p-0"
                  />
                </li>
              ))}
            </ul>
          </section>

          {/* ── Follow-Up ───────────────── */}
          <section className="mb-6">
            <h2 className="font-display text-base text-accent tracking-tight mb-2 flex items-center gap-2">
              <LeafSprig size={14} className="text-accent/60" />
              Follow-Up
            </h2>
            <p className="text-sm text-text">{data.followUp}</p>
          </section>

          <EditorialRule className="my-6" />

          {/* ── Your Visit Story ─────────── */}
          <section className="mb-8">
            <h2 className="font-display text-base text-accent tracking-tight mb-2 flex items-center gap-2">
              <LeafSprig size={14} className="text-accent/60" />
              Your Visit Story
            </h2>
            <textarea
              value={narrative}
              onChange={(e) => setNarrative(e.target.value)}
              className="leaflet-editable w-full text-sm text-text leading-relaxed bg-accent-soft/20 border border-accent/10 rounded-lg px-4 py-3 min-h-[80px] resize-y focus:outline-none focus:ring-1 focus:ring-accent/30 italic print:border-none print:bg-transparent print:p-0"
              style={{ fontFamily: "'Iowan Old Style', 'Palatino Linotype', 'Book Antiqua', Palatino, Georgia, serif" }}
            />
          </section>

          {/* ── Footer ──────────────────── */}
          <div className="pt-6 border-t border-border/40 text-center">
            <div className="flex items-center justify-center gap-2 mb-2">
              <LogoMark size={18} />
              <span className="text-xs text-text-subtle">Leafjourney Health</span>
            </div>
            <p className="text-[10px] text-text-subtle max-w-sm mx-auto leading-relaxed">
              This summary is for your reference. If you have questions about your care,
              reach out to your care team through the patient portal or call the office.
            </p>
            <p className="text-[10px] text-text-subtle mt-2">
              Generated {new Date(data.generatedAt).toLocaleDateString()}
            </p>
          </div>
        </div>
      </div>
    </>
  );
}
