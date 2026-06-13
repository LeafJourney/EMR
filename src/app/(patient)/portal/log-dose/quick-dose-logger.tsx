"use client";

import { useCallback, useEffect, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils/cn";
import {
  EMOJI_OPTIONS,
  OUTCOME_SCALES,
  SIDE_EFFECT_OPTIONS,
  getRandomPrompt,
  type EmojiRating,
  type QuickDoseLog,
} from "@/lib/domain/emoji-outcomes";
import { createFollowUpLog, logDose } from "./actions";
import { InhalationDoseEstimator } from "@/components/prescription/inhalation-dose-estimator";
import { isInhaledProductType } from "@/lib/domain/inhalation-dose";

/* ── Types ──────────────────────────────────────────────── */

interface ProductInfo {
  id: string;
  regimenId: string;
  name: string;
  brand: string | null;
  productType: string;
  route: string;
  doseAmount: number;
  doseUnit: string;
  thcMg: number | null;
  cbdMg: number | null;
  // EMR-003 — surfaced for the inhalation estimator (mg per puff).
  thcConcentration?: number | null;
  cbdConcentration?: number | null;
  concentrationUnit?: string | null;
  active: boolean;
}

type ProductFilter = "all" | "active" | "inactive";

interface Props {
  patientId: string;
  products: ProductInfo[];
}

type Step = "product" | "emoji" | "scales" | "effects" | "done";

/* ── Component ──────────────────────────────────────────── */

export function QuickDoseLogger({ patientId, products }: Props) {
  const [step, setStep] = useState<Step>("product");
  const [selectedProduct, setSelectedProduct] = useState<ProductInfo | null>(null);
  const [emoji, setEmoji] = useState<EmojiRating | null>(null);
  const [scales, setScales] = useState<Record<string, number>>({});
  const [selectedEffects, setSelectedEffects] = useState<string[]>([]);
  const [prompt] = useState(getRandomPrompt);
  const [productFilter, setProductFilter] = useState<ProductFilter>("active");
  const [inhaledDose, setInhaledDose] = useState<{
    puffs: number;
    estimatedThcMg: number;
    estimatedCbdMg: number;
  } | null>(null);
  // EMR-1113 (PJ-1): Save now persists DoseLog + OutcomeLogs server-side.
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const visibleProducts =
    productFilter === "all"
      ? products
      : productFilter === "active"
        ? products.filter((p) => p.active)
        : products.filter((p) => !p.active);

  const activeCount = products.filter((p) => p.active).length;
  const inactiveCount = products.length - activeCount;

  // Only show the 3 most relevant scales based on product type
  const relevantScales = OUTCOME_SCALES.slice(0, 3);

  function reset() {
    setStep("product");
    setSelectedProduct(null);
    setEmoji(null);
    setScales({});
    setSelectedEffects([]);
    setInhaledDose(null);
    setSaving(false);
    setSaveError(null);
  }

  // EMR-1113 (PJ-1): persist the whole flow (DoseLog + emoji/scale
  // OutcomeLogs). Celebration only fires on a confirmed save.
  async function save() {
    if (!selectedProduct || !emoji || saving) return;
    setSaving(true);
    setSaveError(null);
    try {
      const result = await logDose({
        regimenId: selectedProduct.regimenId,
        feeling: emoji,
        scales: Object.entries(scales)
          .filter(([metric]) =>
            metric === "pain" || metric === "sleep" || metric === "anxiety"
          )
          .map(([metric, value]) => ({
            metric: metric as "pain" | "sleep" | "anxiety",
            value,
          })),
        sideEffects: selectedEffects,
        inhaled:
          inhaledDose && inhaledDose.puffs > 0
            ? inhaledDose
            : null,
      });
      if (result.ok) {
        setStep("done");
      } else {
        setSaveError(result.error);
      }
    } catch {
      setSaveError("Couldn't save your dose — check your connection and try again.");
    } finally {
      setSaving(false);
    }
  }

  /* ── Step 1: Pick product ─────────────────────────────── */
  if (step === "product") {
    if (products.length === 0) {
      return (
        <Card className="rounded-2xl text-center py-12">
          <CardContent>
            <p className="text-4xl mb-4">💊</p>
            <p className="text-lg font-medium text-text">No active prescriptions</p>
            <p className="text-sm text-text-muted mt-2">
              Once your provider prescribes a cannabis product, you can log doses here.
            </p>
          </CardContent>
        </Card>
      );
    }

    const filterChips: { key: ProductFilter; label: string; count: number }[] = [
      { key: "all", label: "All", count: products.length },
      { key: "active", label: "Active", count: activeCount },
      { key: "inactive", label: "Inactive", count: inactiveCount },
    ];

    return (
      <div className="space-y-4">
        <p className="text-center text-sm text-text-muted">
          What did you just take?
        </p>

        <div className="flex justify-center gap-2">
          {filterChips.map((chip) => {
            const isActive = productFilter === chip.key;
            return (
              <button
                key={chip.key}
                type="button"
                onClick={() => setProductFilter(chip.key)}
                className={cn(
                  "inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-medium border transition-all active:scale-95",
                  isActive
                    ? "bg-accent text-white border-accent shadow-sm"
                    : "bg-surface text-text-muted border-border hover:border-accent hover:text-accent",
                )}
              >
                {chip.label}
                <span
                  className={cn(
                    "tabular-nums text-[10px] rounded-full px-1.5",
                    isActive ? "bg-white/20" : "bg-surface-muted",
                  )}
                >
                  {chip.count}
                </span>
              </button>
            );
          })}
        </div>

        {visibleProducts.length === 0 ? (
          <Card className="rounded-2xl text-center py-10">
            <CardContent>
              <p className="text-3xl mb-2">🌿</p>
              <p className="text-sm text-text-muted">
                {productFilter === "active"
                  ? "No active products. Switch to All or Inactive to see paused regimens."
                  : productFilter === "inactive"
                    ? "No inactive products. Everything you have is currently active."
                    : "No cannabis products on your chart yet."}
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {visibleProducts.map((p) => (
              <button
                key={p.regimenId}
                onClick={() => {
                  setSelectedProduct(p);
                  setStep("emoji");
                }}
                className={cn(
                  "w-full text-left rounded-2xl border bg-white p-5 hover:border-accent hover:shadow-sm transition-all active:scale-[0.98]",
                  p.active ? "border-border" : "border-border/60 opacity-80",
                )}
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-base font-semibold text-text">{p.name}</p>
                      {!p.active && (
                        <Badge tone="neutral" className="text-[10px]">Inactive</Badge>
                      )}
                    </div>
                    <p className="text-sm text-text-muted mt-0.5">
                      {p.brand} &middot; {p.route} &middot; {p.doseAmount} {p.doseUnit}
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    {p.thcMg && p.thcMg > 0 && (
                      <Badge tone="warning" className="text-[10px]">THC {p.thcMg.toFixed(0)}mg</Badge>
                    )}
                    {p.cbdMg && p.cbdMg > 0 && (
                      <Badge tone="success" className="text-[10px]">CBD {p.cbdMg.toFixed(0)}mg</Badge>
                    )}
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    );
  }

  /* ── Step 2: Emoji rating ─────────────────────────────── */
  if (step === "emoji") {
    const isInhaled =
      !!selectedProduct &&
      isInhaledProductType(selectedProduct.productType);

    return (
      <Card className="rounded-2xl">
        <CardContent className="pt-8 pb-8">
          <p className="text-center text-lg font-medium text-text mb-2">{prompt}</p>
          <p className="text-center text-sm text-text-muted mb-8">
            {selectedProduct?.name} &middot; {selectedProduct?.doseAmount} {selectedProduct?.doseUnit}
          </p>

          {/* Inhalation dose estimator (EMR-003) — vape carts, flower, etc. */}
          {isInhaled && selectedProduct && (
            <div className="mb-8">
              <InhalationDoseEstimator
                product={{
                  name: selectedProduct.name,
                  productType: selectedProduct.productType,
                  thcConcentration: selectedProduct.thcConcentration ?? null,
                  cbdConcentration: selectedProduct.cbdConcentration ?? null,
                  concentrationUnit: selectedProduct.concentrationUnit ?? null,
                }}
                onChange={setInhaledDose}
              />
              {inhaledDose && inhaledDose.puffs > 0 && (
                <p className="text-center text-[12px] text-text-subtle mt-3">
                  We'll save this estimate with your check-in.
                </p>
              )}
            </div>
          )}

          {/* Emoji row */}
          <div className="flex justify-center gap-3 mb-8">
            {EMOJI_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => setEmoji(opt.value)}
                className={cn(
                  "flex flex-col items-center gap-2 p-4 rounded-2xl border-2 transition-all active:scale-95",
                  emoji === opt.value
                    ? `${opt.color} border-current shadow-sm scale-105`
                    : "border-transparent hover:border-border hover:bg-surface-muted"
                )}
              >
                <span className="text-4xl">{opt.emoji}</span>
                <span className="text-[11px] font-medium">{opt.label}</span>
              </button>
            ))}
          </div>

          <div className="flex justify-center">
            <Button
              onClick={() => setStep("scales")}
              disabled={!emoji}
              className="rounded-xl px-8"
            >
              Next
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  /* ── Step 3: Quick scales ─────────────────────────────── */
  if (step === "scales") {
    return (
      <Card className="rounded-2xl">
        <CardContent className="pt-8 pb-8">
          <p className="text-center text-lg font-medium text-text mb-2">
            Quick ratings
          </p>
          <p className="text-center text-sm text-text-muted mb-8">
            Slide to rate (optional — skip any)
          </p>

          <div className="space-y-8">
            {relevantScales.map((scale) => (
              <div key={scale.metric}>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium text-text">
                    {scale.lowEmoji} {scale.label}
                  </span>
                  <span className="text-lg font-semibold text-accent tabular-nums">
                    {scales[scale.metric] ?? "—"}
                  </span>
                </div>
                <div className="flex items-center gap-1">
                  <span className="text-[10px] text-text-subtle w-16 text-right shrink-0">{scale.lowLabel}</span>
                  <div className="flex-1 flex gap-1">
                    {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
                      <button
                        key={n}
                        onClick={() => setScales((prev) => ({ ...prev, [scale.metric]: n }))}
                        className={cn(
                          "flex-1 h-10 rounded-lg text-sm font-medium transition-all active:scale-90",
                          scales[scale.metric] === n
                            ? "bg-accent text-white shadow-sm"
                            : scales[scale.metric] && n <= scales[scale.metric]
                              ? "bg-accent/20 text-accent"
                              : "bg-surface-muted text-text-muted hover:bg-border"
                        )}
                      >
                        {n}
                      </button>
                    ))}
                  </div>
                  <span className="text-[10px] text-text-subtle w-16 shrink-0">{scale.highLabel}</span>
                </div>
              </div>
            ))}
          </div>

          <div className="flex justify-center gap-3 mt-8">
            <Button variant="ghost" onClick={() => setStep("emoji")} className="rounded-xl">
              Back
            </Button>
            <Button onClick={() => setStep("effects")} className="rounded-xl px-8">
              Next
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  /* ── Step 4: Side effects ─────────────────────────────── */
  if (step === "effects") {
    return (
      <Card className="rounded-2xl">
        <CardContent className="pt-8 pb-8">
          <p className="text-center text-lg font-medium text-text mb-2">
            Any side effects?
          </p>
          <p className="text-center text-sm text-text-muted mb-6">
            Tap all that apply (optional)
          </p>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {SIDE_EFFECT_OPTIONS.map((eff) => (
              <button
                key={eff.id}
                onClick={() => {
                  setSelectedEffects((prev) =>
                    prev.includes(eff.id)
                      ? prev.filter((e) => e !== eff.id)
                      : [...prev, eff.id]
                  );
                }}
                className={cn(
                  "flex flex-col items-center gap-1.5 p-3 rounded-xl border-2 transition-all active:scale-95",
                  selectedEffects.includes(eff.id)
                    ? "border-accent bg-accent-soft"
                    : "border-transparent bg-surface-muted hover:border-border"
                )}
              >
                <span className="text-2xl">{eff.emoji}</span>
                <span className="text-[11px] font-medium text-text leading-tight text-center">
                  {eff.label}
                </span>
              </button>
            ))}
          </div>

          {saveError && (
            <p className="text-center text-sm text-danger mt-6" role="alert">
              {saveError}
            </p>
          )}

          <div className="flex justify-center gap-3 mt-8">
            <Button
              variant="ghost"
              onClick={() => setStep("scales")}
              disabled={saving}
              className="rounded-xl"
            >
              Back
            </Button>
            <Button
              onClick={save}
              disabled={saving}
              className="rounded-xl px-8"
            >
              {saving ? "Saving…" : "Save"}
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  /* ── Step 5: Done ─────────────────────────────────────── */
  if (step === "done") {
    const emojiOpt = EMOJI_OPTIONS.find((e) => e.value === emoji);
    return (
      <div className="space-y-5">
        <Card className="rounded-2xl">
          <CardContent className="pt-10 pb-10 text-center">
            <span className="text-6xl block mb-4">🎉</span>
            <h2 className="font-display text-2xl text-text tracking-tight mb-2">
              Logged!
            </h2>
            <p className="text-sm text-text-muted mb-6">
              {selectedProduct?.name} &middot; {emojiOpt?.emoji} {emojiOpt?.label}
              {Object.keys(scales).length > 0 && (
                <> &middot; {Object.keys(scales).length} ratings</>
              )}
              {selectedEffects.length > 0 && selectedEffects[0] !== "none" && (
                <> &middot; {selectedEffects.length} side effect{selectedEffects.length !== 1 ? "s" : ""}</>
              )}
            </p>

            <div className="flex flex-col items-center gap-3">
              <Button onClick={reset} className="rounded-xl px-8">
                Log another dose
              </Button>
              <a href="/portal" className="text-sm text-accent hover:underline">
                Back to dashboard
              </a>
            </div>

            <p className="text-[11px] text-text-subtle mt-8">
              Your data is encrypted and HIPAA-protected. It helps your care team
              find the best treatment for you, and contributes to cannabis research.
            </p>
          </CardContent>
        </Card>

        {selectedProduct && (
          <CheckInReminderSection
            productName={selectedProduct.name}
            regimenId={selectedProduct.regimenId}
          />
        )}

        <FollowUpHost />
      </div>
    );
  }

  return null;
}

/* ── Check-in reminder timer ──────────────────────────── */

const REMINDER_DURATIONS: { label: string; minutes: number }[] = [
  { label: "30 min", minutes: 30 },
  { label: "1 hr", minutes: 60 },
  { label: "2 hr", minutes: 120 },
  { label: "4 hr", minutes: 240 },
];

interface PendingReminder {
  id: string;
  productName: string;
  regimenId: string | null;
  delayMinutes: number;
  fireAt: number; // epoch ms
}

const REMINDER_STORAGE_KEY = "leaf:postDoseReminders";

function loadReminders(): PendingReminder[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(REMINDER_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as PendingReminder[];
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (r) =>
        r &&
        typeof r.id === "string" &&
        typeof r.fireAt === "number" &&
        typeof r.productName === "string"
    );
  } catch {
    return [];
  }
}

function saveReminders(reminders: PendingReminder[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(REMINDER_STORAGE_KEY, JSON.stringify(reminders));
  } catch {
    // localStorage might be full / disabled — non-critical
  }
}

function CheckInReminderSection({
  productName,
  regimenId,
}: {
  productName: string;
  regimenId: string;
}) {
  const [scheduled, setScheduled] = useState<number | null>(null);

  function schedule(minutes: number) {
    const id =
      typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : Math.random().toString(36).slice(2);
    const fireAt = Date.now() + minutes * 60_000;
    const reminder: PendingReminder = {
      id,
      productName,
      regimenId,
      delayMinutes: minutes,
      fireAt,
    };
    const next = [...loadReminders(), reminder];
    saveReminders(next);
    // Tell the host to schedule it without waiting for the storage event.
    window.dispatchEvent(new CustomEvent("leaf:reminder-added"));
    setScheduled(minutes);
  }

  return (
    <Card className="rounded-2xl">
      <CardContent className="pt-7 pb-7">
        <div className="text-center mb-5">
          <p className="text-2xl mb-1">⏰</p>
          <p className="text-base font-semibold text-text">
            Set a check-in reminder
          </p>
          <p className="text-[13px] text-text-muted mt-1">
            We'll nudge you so we can capture how it really felt.
          </p>
        </div>

        <div className="flex flex-wrap justify-center gap-2">
          {REMINDER_DURATIONS.map((d) => (
            <button
              key={d.minutes}
              type="button"
              onClick={() => schedule(d.minutes)}
              className={cn(
                "px-5 py-2.5 rounded-full text-sm font-medium border transition-all active:scale-95",
                scheduled === d.minutes
                  ? "bg-accent text-white border-accent shadow-sm"
                  : "bg-surface-muted text-text border-border hover:border-accent hover:text-accent"
              )}
            >
              {d.label}
            </button>
          ))}
        </div>

        {scheduled !== null && (
          <p className="text-center text-[12px] text-accent mt-4">
            ✓ Reminder set for {scheduled === 60 ? "1 hour" : scheduled === 120 ? "2 hours" : scheduled === 240 ? "4 hours" : `${scheduled} minutes`} from now
          </p>
        )}
      </CardContent>
    </Card>
  );
}

/**
 * FollowUpHost: persistent watcher that lives wherever the QuickDoseLogger
 * is mounted. It polls localStorage for pending reminders and surfaces a
 * modal when one fires, even if the patient refreshed the page.
 */
function FollowUpHost() {
  const [active, setActive] = useState<PendingReminder | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(() => {
    const reminders = loadReminders();
    const now = Date.now();
    const due = reminders.find((r) => r.fireAt <= now);
    if (due) {
      setActive((prev) => prev ?? due);
    }
  }, []);

  useEffect(() => {
    refresh();
    const interval = window.setInterval(refresh, 5_000);
    const onAdded = () => refresh();
    const onStorage = (e: StorageEvent) => {
      if (e.key === REMINDER_STORAGE_KEY) refresh();
    };
    window.addEventListener("leaf:reminder-added", onAdded);
    window.addEventListener("storage", onStorage);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("leaf:reminder-added", onAdded);
      window.removeEventListener("storage", onStorage);
    };
  }, [refresh]);

  function dismiss() {
    if (!active) return;
    const remaining = loadReminders().filter((r) => r.id !== active.id);
    saveReminders(remaining);
    setActive(null);
    setError(null);
  }

  async function submit(rating: number) {
    if (!active || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const result = await createFollowUpLog({
        rating,
        productName: active.productName,
        regimenId: active.regimenId,
        delayMinutes: active.delayMinutes,
      });
      if (!result.ok) {
        setError(result.error);
      } else {
        dismiss();
      }
    } catch {
      setError("Couldn't save — try again.");
    } finally {
      setSubmitting(false);
    }
  }

  if (!active) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <Card className="rounded-2xl w-full max-w-md max-h-[85vh] overflow-y-auto shadow-2xl animate-in fade-in slide-in-from-bottom-4">
        <CardContent className="pt-8 pb-8">
          <div className="text-center mb-6">
            <p className="text-4xl mb-3">👋</p>
            <h2 className="font-display text-xl text-text tracking-tight mb-1">
              How's it feeling now?
            </h2>
            <p className="text-sm text-text-muted">
              {active.productName} &middot; {Math.round(active.delayMinutes)} min check-in
            </p>
          </div>

          <div className="flex justify-center gap-2 mb-6">
            {EMOJI_OPTIONS.map((opt, idx) => (
              <button
                key={opt.value}
                onClick={() => submit(idx + 1)}
                disabled={submitting}
                className={cn(
                  "flex flex-col items-center gap-1.5 p-3 rounded-2xl border-2 transition-all active:scale-95",
                  "border-transparent hover:border-border hover:bg-surface-muted",
                  submitting && "opacity-50 cursor-not-allowed"
                )}
              >
                <span className="text-3xl">{opt.emoji}</span>
                <span className="text-[10px] font-medium text-text-muted">{opt.label}</span>
              </button>
            ))}
          </div>

          {error && (
            <p className="text-center text-xs text-danger mb-3">{error}</p>
          )}

          <div className="flex justify-center">
            <Button
              variant="ghost"
              onClick={dismiss}
              disabled={submitting}
              className="rounded-xl text-sm"
            >
              Skip this check-in
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
