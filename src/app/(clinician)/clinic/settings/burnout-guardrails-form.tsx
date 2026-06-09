"use client";

/**
 * EMR-214 — Provider burnout guardrails (prefs persisted server-side).
 *
 * Editor for the per-provider scheduling caps the slot recommender / waitlist
 * consult before placing a visit (max/day, max/week, buffer, protected lunch,
 * high-intensity cap, same-day add-ons), plus a live burnout index computed by
 * the real engine (`@/lib/scheduling/provider-prefs`) against the provider's
 * actual last-14-day load (passed in from the server).
 *
 * Persistence: caps save to the per-user CommunicationPreference row
 * (preferences.schedulingPrefs JSON) via a server action — no schema change.
 * The burnout index is real (reads loaded appointment data); `highIntensityVisits`
 * is not yet derived from visit type, so that single component reads 0 until
 * visit-type tagging lands.
 */

import { useMemo, useState } from "react";
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
  burnoutIndex,
  type ProviderPrefs,
  type DayLoad,
} from "@/lib/scheduling/provider-prefs";
import { saveSchedulingPrefs } from "./scheduling-prefs-actions";

const LABEL_CLASS =
  "block text-[11px] font-semibold uppercase tracking-[0.12em] text-text-subtle mb-1.5";
const INPUT_CLASS =
  "flex w-full rounded-xl border border-border-strong bg-white px-3 h-11 text-sm text-text " +
  "focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent/20";

/** DayLoad with the Date serialized for the server→client boundary. */
export type SerializedDayLoad = Omit<DayLoad, "day"> & { day: string };

type StoredPrefs = Omit<ProviderPrefs, "providerId">;

const LEVEL_TONE: Record<"green" | "yellow" | "red", "success" | "warning" | "danger"> = {
  green: "success",
  yellow: "warning",
  red: "danger",
};

const COMPONENT_LABEL: Record<string, string> = {
  saturation: "Daily load",
  intensity: "High-intensity mix",
  overrun: "After-hours overrun",
  selfReport: "Self-reported",
  docLag: "Documentation lag",
};

export function BurnoutGuardrailsForm({
  providerId,
  fortnight,
  initialPrefs,
}: {
  providerId: string;
  fortnight: SerializedDayLoad[];
  initialPrefs: StoredPrefs;
}) {
  const [prefs, setPrefs] = useState<StoredPrefs>(initialPrefs);
  const [justSaved, setJustSaved] = useState(false);
  const [saving, setSaving] = useState(false);

  function updateNum(field: keyof StoredPrefs, value: number) {
    setPrefs((p) => ({ ...p, [field]: value }));
  }

  async function save() {
    setSaving(true);
    try {
      const saved = await saveSchedulingPrefs(prefs);
      setPrefs(saved);
      setJustSaved(true);
      setTimeout(() => setJustSaved(false), 2500);
    } catch {
      /* non-fatal — button returns to idle so the user can retry */
    } finally {
      setSaving(false);
    }
  }

  const rehydrated = useMemo<DayLoad[]>(
    () => fortnight.map((d) => ({ ...d, day: new Date(d.day) })),
    [fortnight],
  );

  const burnout = useMemo(
    () => burnoutIndex({ ...prefs, providerId }, rehydrated),
    [prefs, providerId, rehydrated],
  );

  const scorePct = Math.round(burnout.score * 100);

  return (
    <Card className="rounded-2xl bg-white border-border/60 shadow-sm">
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          Burnout guardrails
          <Badge tone={LEVEL_TONE[burnout.level]} className="text-[10px] capitalize">
            {burnout.level}
          </Badge>
          {justSaved && <Badge tone="success" className="text-[10px]">Saved ✓</Badge>}
        </CardTitle>
        <CardDescription>
          Scheduling caps the recommender enforces, plus your live burnout index
          from the last 14 days of load.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {/* Burnout index */}
        <div className="rounded-xl border border-border/60 bg-surface-muted/40 px-4 py-4">
          <div className="flex items-baseline gap-3">
            <p
              className={
                "font-display text-4xl tabular-nums " +
                (burnout.level === "red"
                  ? "text-danger"
                  : burnout.level === "yellow"
                    ? "text-[color:var(--warning)]"
                    : "text-success")
              }
            >
              {scorePct}
            </p>
            <p className="text-xs text-text-muted">burnout index / 100</p>
          </div>
          <div className="mt-3 space-y-1.5">
            {Object.entries(burnout.components).map(([k, v]) => (
              <div key={k} className="flex items-center gap-2">
                <span className="text-[11px] text-text-muted w-36 shrink-0">
                  {COMPONENT_LABEL[k] ?? k}
                </span>
                <div className="flex-1 h-1.5 rounded-full bg-surface-muted overflow-hidden">
                  <div
                    className="h-full bg-accent/60 rounded-full"
                    style={{ width: `${Math.round(Math.min(1, v) * 100)}%` }}
                  />
                </div>
                <span className="text-[10px] text-text-subtle tabular-nums w-8 text-right">
                  {Math.round(v * 100)}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Caps editor */}
        <div className="grid grid-cols-2 gap-3">
          <NumField label="Max patients / day" value={prefs.maxPatientsPerDay} min={1} max={40}
            onChange={(v) => updateNum("maxPatientsPerDay", v)} />
          <NumField label="Max patients / week" value={prefs.maxPatientsPerWeek} min={1} max={160}
            onChange={(v) => updateNum("maxPatientsPerWeek", v)} />
          <NumField label="Buffer between visits (min)" value={prefs.minBufferMinutes} min={0} max={60}
            onChange={(v) => updateNum("minBufferMinutes", v)} />
          <NumField label="Protected lunch (min)" value={prefs.lunchMinutes} min={0} max={120}
            onChange={(v) => updateNum("lunchMinutes", v)} />
          <NumField label="Max high-intensity / day" value={prefs.maxHighIntensityPerDay} min={0} max={20}
            onChange={(v) => updateNum("maxHighIntensityPerDay", v)} />
          <NumField label="Self-reported burnout (0–10)" value={prefs.selfReportedBurnout ?? 0} min={0} max={10}
            onChange={(v) => setPrefs((p) => ({ ...p, selfReportedBurnout: v }))} />
        </div>

        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={prefs.acceptsSameDayAddons}
            onChange={(e) => setPrefs((p) => ({ ...p, acceptsSameDayAddons: e.target.checked }))}
            className="h-4 w-4 accent-[color:var(--accent)]"
          />
          <span className="text-sm text-text">Accept urgent same-day add-ons</span>
        </label>

        <div className="grid grid-cols-2 gap-3">
          <NumField label="Work start (hour)" value={prefs.workHours.startHour} min={0} max={23}
            onChange={(v) => setPrefs((p) => ({ ...p, workHours: { ...p.workHours, startHour: v } }))} />
          <NumField label="Work end (hour)" value={prefs.workHours.endHour} min={0} max={23}
            onChange={(v) => setPrefs((p) => ({ ...p, workHours: { ...p.workHours, endHour: v } }))} />
        </div>

        <div className="flex items-center gap-3">
          <Button type="button" onClick={save} disabled={saving}>
            {saving ? "Saving…" : justSaved ? "Saved ✓" : "Save guardrails"}
          </Button>
        </div>

        <p className="text-[11px] leading-relaxed text-text-subtle rounded-lg bg-surface-muted/60 border border-border/60 px-3 py-2">
          Caps save to your provider communication profile (server-side). The
          burnout index reads real loaded appointment data; the high-intensity
          component reads 0 until visit-type tagging lands.
        </p>
      </CardContent>
    </Card>
  );
}

function NumField({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (v: number) => void;
}) {
  return (
    <div>
      <label className={LABEL_CLASS}>{label}</label>
      <input
        type="number"
        value={value}
        min={min}
        max={max}
        onChange={(e) => {
          const n = Number(e.target.value);
          if (Number.isFinite(n)) onChange(Math.max(min, Math.min(max, Math.round(n))));
        }}
        className={INPUT_CLASS}
      />
    </div>
  );
}
