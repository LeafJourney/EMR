"use client";

/**
 * EMR-208 — Algorithmic follow-up cadence selector.
 *
 * Thin UI over the pure cadence engine (`@/lib/scheduling/cadence-engine`).
 * The clinician picks a condition + treatment phase (and, optionally, the
 * patient's state + cert age and a manual override); the engine returns the
 * recommended interval, modality, and rationale, plus the computed next-due
 * date. "Schedule this follow-up" hands the recommended interval to the
 * scheduler via query params so the booking is pre-filled.
 *
 * The engine is a pure function, so all of this runs client-side with no
 * server round-trip.
 */

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import {
  recommendCadence,
  nextDueDate,
  ConditionCategorySchema,
  TreatmentPhaseSchema,
  type ConditionCategory,
  type TreatmentPhase,
} from "@/lib/scheduling/cadence-engine";

const INPUT_CLASS =
  "flex w-full rounded-xl border border-border-strong bg-white px-3 h-11 text-sm text-text " +
  "focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent/20";
const LABEL_CLASS =
  "block text-[11px] font-semibold uppercase tracking-[0.12em] text-text-subtle mb-1.5";

const MODALITY_LABEL: Record<string, string> = {
  video: "Video visit",
  phone: "Phone call",
  in_person: "In-person",
  async_message: "Secure message",
};

function titleCase(s: string): string {
  return s.replace(/_/g, " ").replace(/\b\w/g, (m) => m.toUpperCase());
}

function todayISO(): string {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

export function FollowUpCadence({ patientId }: { patientId?: string }) {
  const router = useRouter();
  const conditions = ConditionCategorySchema.options;
  const phases = TreatmentPhaseSchema.options;

  const [condition, setCondition] = useState<ConditionCategory>("chronic_pain");
  const [phase, setPhase] = useState<TreatmentPhase>("titration");
  const [patientState, setPatientState] = useState("");
  const [daysSinceCert, setDaysSinceCert] = useState<string>("");
  const [overrideDays, setOverrideDays] = useState<string>("");
  const [lastVisit, setLastVisit] = useState<string>(todayISO());

  const rec = useMemo(() => {
    const override = overrideDays.trim() === "" ? undefined : Number(overrideDays);
    return recommendCadence({
      condition,
      phase,
      patientState: patientState.trim() === "" ? null : patientState.trim().toUpperCase(),
      daysSinceCertIssued: daysSinceCert.trim() === "" ? null : Number(daysSinceCert),
      clinicianOverrideDays:
        override !== undefined && Number.isFinite(override) && override > 0
          ? override
          : undefined,
    });
  }, [condition, phase, patientState, daysSinceCert, overrideDays]);

  const due = useMemo(() => {
    const base = new Date(`${lastVisit}T12:00:00`);
    if (Number.isNaN(base.getTime())) return null;
    return nextDueDate(base, rec);
  }, [lastVisit, rec]);

  function scheduleFollowUp() {
    const params = new URLSearchParams();
    params.set("followUpDays", String(rec.intervalDays));
    params.set("modality", rec.modality);
    if (patientId) params.set("patientId", patientId);
    router.push(`/clinic/schedule?${params.toString()}`);
  }

  return (
    <div className="grid gap-5 md:grid-cols-2">
      {/* Inputs */}
      <Card className="rounded-2xl bg-white border-border/60 shadow-sm">
        <CardHeader>
          <CardTitle className="text-base">Visit context</CardTitle>
          <CardDescription>
            Pick the condition and current treatment phase. The cadence engine
            encodes the practice&apos;s standard of care per condition.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div>
            <label className={LABEL_CLASS} htmlFor="cad-condition">Condition</label>
            <select
              id="cad-condition"
              value={condition}
              onChange={(e) => setCondition(e.target.value as ConditionCategory)}
              className={INPUT_CLASS}
            >
              {conditions.map((c) => (
                <option key={c} value={c}>{titleCase(c)}</option>
              ))}
            </select>
          </div>
          <div>
            <label className={LABEL_CLASS} htmlFor="cad-phase">Treatment phase</label>
            <select
              id="cad-phase"
              value={phase}
              onChange={(e) => setPhase(e.target.value as TreatmentPhase)}
              className={INPUT_CLASS}
            >
              {phases.map((p) => (
                <option key={p} value={p}>{titleCase(p)}</option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={LABEL_CLASS} htmlFor="cad-state">Patient state</label>
              <input
                id="cad-state"
                value={patientState}
                onChange={(e) => setPatientState(e.target.value)}
                placeholder="CA"
                maxLength={2}
                className={INPUT_CLASS}
              />
            </div>
            <div>
              <label className={LABEL_CLASS} htmlFor="cad-cert">Days since cert</label>
              <input
                id="cad-cert"
                value={daysSinceCert}
                onChange={(e) => setDaysSinceCert(e.target.value.replace(/[^0-9]/g, ""))}
                placeholder="—"
                inputMode="numeric"
                className={INPUT_CLASS}
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={LABEL_CLASS} htmlFor="cad-last">Last visit</label>
              <input
                id="cad-last"
                type="date"
                value={lastVisit}
                onChange={(e) => setLastVisit(e.target.value)}
                className={INPUT_CLASS}
              />
            </div>
            <div>
              <label className={LABEL_CLASS} htmlFor="cad-override">Override (days)</label>
              <input
                id="cad-override"
                value={overrideDays}
                onChange={(e) => setOverrideDays(e.target.value.replace(/[^0-9]/g, ""))}
                placeholder="auto"
                inputMode="numeric"
                className={INPUT_CLASS}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Recommendation */}
      <Card className="rounded-2xl bg-white border-border/60 shadow-sm">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            Recommended cadence
            {rec.inPersonRequired && (
              <Badge tone="warning" className="text-[10px]">In-person required</Badge>
            )}
          </CardTitle>
          <CardDescription>Auto-computed from the visit context.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-baseline gap-6">
            <div>
              <p className="font-display text-4xl text-accent tabular-nums">
                {rec.intervalDays}
              </p>
              <p className="text-xs text-text-muted mt-1">days to next visit</p>
            </div>
            <div>
              <p className="text-sm font-medium text-text">
                {MODALITY_LABEL[rec.modality] ?? rec.modality}
              </p>
              <p className="text-xs text-text-muted mt-1">recommended modality</p>
            </div>
          </div>

          {due && (
            <div className="rounded-lg bg-surface-muted/50 border border-border/60 px-3 py-2">
              <p className="text-xs text-text-muted">
                Next due{" "}
                <span className="font-medium text-text">
                  {due.dueAt.toLocaleDateString("en-US", {
                    weekday: "short",
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                  })}
                </span>
                {due.overdue && (
                  <Badge tone="danger" className="text-[10px] ml-2">
                    {due.daysOverdue}d overdue
                  </Badge>
                )}
              </p>
            </div>
          )}

          <p className="text-[12px] leading-relaxed text-text-subtle">
            {rec.rationale}
          </p>

          <Button type="button" onClick={scheduleFollowUp} className="w-full">
            Schedule this follow-up →
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
