"use client";

/**
 * EMR-209 — Smart slot recommender panel.
 *
 * Ranks the clinic's open slots for a patient using the pure recommender
 * (`@/lib/scheduling/slot-recommender`). Candidate slots (with a computed
 * slot-value) are loaded server-side and passed in; the operator tunes the
 * patient context (risk tier, preferred provider/modality/time) and the panel
 * re-ranks live, showing the top matches with the reasons each scored.
 */

import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { rankSlots, type CandidateSlot } from "@/lib/scheduling/slot-recommender";
import type { RiskTier } from "@/lib/scheduling/no-show-model";
import type { Modality } from "@/lib/scheduling/cadence-engine";

export type SerializedCandidate = {
  slotId: string;
  providerId: string;
  providerName: string;
  startAt: string; // ISO
  endAt: string; // ISO
  modality: Modality;
  slotValue: number;
};

const LABEL_CLASS =
  "block text-[11px] font-semibold uppercase tracking-[0.12em] text-text-subtle mb-1.5";
const INPUT_CLASS =
  "flex w-full rounded-xl border border-border-strong bg-white px-3 h-11 text-sm text-text " +
  "focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent/20";

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function SlotRecommenderPanel({
  candidates,
  providers,
}: {
  candidates: SerializedCandidate[];
  providers: { id: string; name: string }[];
}) {
  const [riskTier, setRiskTier] = useState<RiskTier>("low");
  const [preferredProviderId, setPreferredProviderId] = useState<string>("");
  const [continuity, setContinuity] = useState(true);
  const [preferredModality, setPreferredModality] = useState<Modality | "">("");
  const [earliestHour, setEarliestHour] = useState<number>(9);
  const [latestHour, setLatestHour] = useState<number>(17);
  const [preferredDays, setPreferredDays] = useState<number[]>([]);

  const rehydrated = useMemo<CandidateSlot[]>(
    () =>
      candidates.map((c) => ({
        slotId: c.slotId,
        providerId: c.providerId,
        startAt: new Date(c.startAt),
        endAt: new Date(c.endAt),
        modality: c.modality,
        slotValue: c.slotValue,
      })),
    [candidates],
  );

  const providerName = useMemo(() => {
    const map = new Map(providers.map((p) => [p.id, p.name]));
    return (id: string) => map.get(id) ?? "Provider";
  }, [providers]);

  const ranked = useMemo(() => {
    return rankSlots(
      rehydrated,
      {
        patientId: "preview",
        preferredProviderId: preferredProviderId || null,
        lastVisitProviderId: continuity ? preferredProviderId || null : null,
        riskTier,
        preferredDaysOfWeek: preferredDays,
        preferredHours: { earliestHour, latestHour },
        preferredModality: preferredModality || null,
        dueAt: null,
        overdueGraceDays: 14,
        providerLockedTo: null,
      },
      { limit: 6 },
    );
  }, [
    rehydrated,
    preferredProviderId,
    continuity,
    riskTier,
    preferredDays,
    earliestHour,
    latestHour,
    preferredModality,
  ]);

  function toggleDay(d: number) {
    setPreferredDays((days) =>
      days.includes(d) ? days.filter((x) => x !== d) : [...days, d],
    );
  }

  return (
    <div className="grid gap-5 md:grid-cols-2">
      {/* Patient context controls */}
      <Card className="rounded-2xl bg-white border-border/60 shadow-sm">
        <CardHeader>
          <CardTitle className="text-base">Patient context</CardTitle>
          <CardDescription>
            Tune the inputs the recommender weighs. High-risk patients are
            steered toward lower-value (off-peak) slots automatically.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={LABEL_CLASS} htmlFor="rec-risk">No-show risk</label>
              <select
                id="rec-risk"
                value={riskTier}
                onChange={(e) => setRiskTier(e.target.value as RiskTier)}
                className={INPUT_CLASS}
              >
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
              </select>
            </div>
            <div>
              <label className={LABEL_CLASS} htmlFor="rec-modality">Preferred modality</label>
              <select
                id="rec-modality"
                value={preferredModality}
                onChange={(e) => setPreferredModality(e.target.value as Modality | "")}
                className={INPUT_CLASS}
              >
                <option value="">No preference</option>
                <option value="video">Video</option>
                <option value="phone">Phone</option>
                <option value="in_person">In-person</option>
                <option value="async_message">Secure message</option>
              </select>
            </div>
          </div>

          <div>
            <label className={LABEL_CLASS} htmlFor="rec-provider">Preferred provider</label>
            <select
              id="rec-provider"
              value={preferredProviderId}
              onChange={(e) => setPreferredProviderId(e.target.value)}
              className={INPUT_CLASS}
            >
              <option value="">No preference</option>
              {providers.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>

          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={continuity}
              onChange={(e) => setContinuity(e.target.checked)}
              className="h-4 w-4 accent-[color:var(--accent)]"
            />
            <span className="text-sm text-text">Same provider as last visit (continuity)</span>
          </label>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={LABEL_CLASS} htmlFor="rec-earliest">Earliest hour</label>
              <input
                id="rec-earliest"
                type="number"
                min={0}
                max={23}
                value={earliestHour}
                onChange={(e) => setEarliestHour(clampHour(e.target.value))}
                className={INPUT_CLASS}
              />
            </div>
            <div>
              <label className={LABEL_CLASS} htmlFor="rec-latest">Latest hour</label>
              <input
                id="rec-latest"
                type="number"
                min={0}
                max={23}
                value={latestHour}
                onChange={(e) => setLatestHour(clampHour(e.target.value))}
                className={INPUT_CLASS}
              />
            </div>
          </div>

          <div>
            <span className={LABEL_CLASS}>Preferred days</span>
            <div className="flex flex-wrap gap-1.5">
              {DAYS.map((label, d) => (
                <button
                  key={label}
                  type="button"
                  onClick={() => toggleDay(d)}
                  aria-pressed={preferredDays.includes(d)}
                  className={
                    "text-[11px] px-2.5 py-1 rounded-full border transition-colors " +
                    (preferredDays.includes(d)
                      ? "border-accent/50 bg-accent/10 text-accent font-medium"
                      : "border-border text-text-muted")
                  }
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Ranked recommendations */}
      <Card className="rounded-2xl bg-white border-border/60 shadow-sm">
        <CardHeader>
          <CardTitle className="text-base">Recommended slots</CardTitle>
          <CardDescription>
            {candidates.length} open slots ranked. Top {ranked.length} shown.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {ranked.length === 0 ? (
            <p className="text-sm text-text-subtle italic py-6 text-center">
              No open slots match the current constraints.
            </p>
          ) : (
            <ol className="space-y-2">
              {ranked.map((slot, i) => (
                <li
                  key={slot.slotId}
                  className="rounded-xl border border-border/60 px-3 py-2.5 hover:border-accent/40 transition-colors"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-text">
                        {new Date(slot.startAt).toLocaleDateString("en-US", {
                          weekday: "short",
                          month: "short",
                          day: "numeric",
                        })}{" "}
                        <span className="tabular-nums">
                          {new Date(slot.startAt).toLocaleTimeString("en-US", {
                            hour: "numeric",
                            minute: "2-digit",
                          })}
                        </span>
                      </p>
                      <p className="text-[11px] text-text-muted truncate">
                        {providerName(slot.providerId)}
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="font-display text-lg text-accent tabular-nums">
                        {Math.round(slot.score * 100)}
                      </p>
                      <p className="text-[9px] text-text-subtle">match</p>
                    </div>
                  </div>
                  {slot.reasons.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-1.5">
                      {slot.reasons.map((r) => (
                        <Badge key={r} tone="neutral" className="text-[9px]">{r}</Badge>
                      ))}
                    </div>
                  )}
                  {i === 0 && (
                    <Badge tone="success" className="text-[9px] mt-1.5">Top pick</Badge>
                  )}
                </li>
              ))}
            </ol>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function clampHour(v: string): number {
  const n = Number(v);
  if (!Number.isFinite(n)) return 9;
  return Math.max(0, Math.min(23, Math.round(n)));
}
