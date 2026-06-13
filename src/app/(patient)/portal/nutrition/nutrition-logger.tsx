"use client";

import { useEffect, useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Eyebrow } from "@/components/ui/ornament";
import {
  DAILY_TARGET,
  MEAL_EMOJI,
  MEAL_LABEL,
  inferPhotoNutrition,
  resolveBarcode,
  searchNutrition,
  sumMacros,
  totalForEntry,
  type FoodEntry,
  type MacroProfile,
} from "@/lib/domain/nutrition";

const STORAGE_KEY = "lj-nutrition-log";

type CaptureMode = "photo" | "barcode" | "manual";

interface DraftEntry {
  source: FoodEntry["source"];
  meal: FoodEntry["meal"];
  name: string;
  servings: string;
  perServing: MacroProfile;
}

const EMPTY_DRAFT: DraftEntry = {
  source: "manual",
  meal: "lunch",
  name: "",
  servings: "1",
  perServing: { calories: 0, protein: 0, carbs: 0, fat: 0, fiber: 0 },
};

function readEntries(): FoodEntry[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeEntries(entries: FoodEntry[]) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
  } catch {
    // ignore
  }
}

function isToday(iso: string): boolean {
  const d = new Date(iso);
  const today = new Date();
  return (
    d.getFullYear() === today.getFullYear() &&
    d.getMonth() === today.getMonth() &&
    d.getDate() === today.getDate()
  );
}

export function NutritionLogger() {
  const [entries, setEntries] = useState<FoodEntry[]>([]);
  const [draft, setDraft] = useState<DraftEntry>(EMPTY_DRAFT);
  const [mode, setMode] = useState<CaptureMode>("manual");
  const [barcode, setBarcode] = useState("");
  const [photoStatus, setPhotoStatus] = useState<string | null>(null);

  useEffect(() => {
    setEntries(readEntries());
  }, []);

  const todayEntries = useMemo(
    () => entries.filter((e) => isToday(e.loggedAt)),
    [entries],
  );
  const todayTotal = useMemo(() => sumMacros(todayEntries), [todayEntries]);

  function applyDb(found: ReturnType<typeof searchNutrition>) {
    if (!found) return;
    setDraft((d) => ({
      ...d,
      name: found.entry.name,
      perServing: { ...found.entry.perServing },
    }));
  }

  function handleManualSearch(value: string) {
    setDraft((d) => ({ ...d, source: "manual", name: value }));
    applyDb(searchNutrition(value));
  }

  function handleBarcodeLookup() {
    const found = resolveBarcode(barcode.trim());
    if (!found) {
      setPhotoStatus("No match for that barcode — type the food name below.");
      setDraft((d) => ({ ...d, source: "barcode", name: "" }));
      return;
    }
    setDraft((d) => ({
      ...d,
      source: "barcode",
      name: found.entry.name,
      perServing: { ...found.entry.perServing },
    }));
  }

  function handlePhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setPhotoStatus("Analyzing photo...");
    const seed = `${file.name}-${file.size}`;
    const found = inferPhotoNutrition(seed);
    setTimeout(() => {
      if (found) {
        setDraft((d) => ({
          ...d,
          source: "photo",
          name: found.entry.name,
          perServing: { ...found.entry.perServing },
        }));
        setPhotoStatus("Best guess from your photo. Adjust if needed.");
      } else {
        setPhotoStatus("Could not recognize the food. Type the name below.");
      }
    }, 600);
  }

  function saveEntry() {
    if (!draft.name.trim()) return;
    const servings = Number(draft.servings) || 1;
    const entry: FoodEntry = {
      id: `food-${Date.now()}`,
      source: draft.source,
      meal: draft.meal,
      loggedAt: new Date().toISOString(),
      name: draft.name.trim(),
      servings,
      perServing: { ...draft.perServing },
    };
    const next = [entry, ...entries];
    writeEntries(next);
    setEntries(next);
    setDraft(EMPTY_DRAFT);
    setBarcode("");
    setPhotoStatus(null);
  }

  function deleteEntry(id: string) {
    const next = entries.filter((e) => e.id !== id);
    writeEntries(next);
    setEntries(next);
  }

  return (
    <div className="space-y-8">
      {/* Macro rings */}
      <Card tone="raised">
        <CardContent className="py-6">
          <Eyebrow className="mb-4">Today so far</Eyebrow>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
            <MacroRing label="Calories" value={todayTotal.calories} target={DAILY_TARGET.calories} unit="" emoji="🔥" />
            <MacroRing label="Protein" value={todayTotal.protein} target={DAILY_TARGET.protein} unit="g" emoji="🍗" />
            <MacroRing label="Carbs" value={todayTotal.carbs} target={DAILY_TARGET.carbs} unit="g" emoji="🌾" />
            <MacroRing label="Fat" value={todayTotal.fat} target={DAILY_TARGET.fat} unit="g" emoji="🥑" />
            <MacroRing label="Fiber" value={todayTotal.fiber} target={DAILY_TARGET.fiber} unit="g" emoji="🥬" />
          </div>
        </CardContent>
      </Card>

      {/* Capture surface */}
      <Card tone="raised">
        <CardContent className="py-6">
          <div className="flex items-center gap-2 mb-5 flex-wrap">
            {(["photo", "barcode", "manual"] as CaptureMode[]).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMode(m)}
                className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
                  mode === m
                    ? "bg-accent text-accent-ink"
                    : "bg-surface-muted text-text-muted hover:bg-surface"
                }`}
              >
                {m === "photo" ? "📷 Photo" : m === "barcode" ? "🔢 Barcode" : "✏️ Manual"}
              </button>
            ))}
          </div>

          {mode === "photo" && (
            <div className="space-y-3">
              <label className="block">
                <span className="text-xs text-text-muted">
                  Snap or upload a photo of your plate.
                </span>
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  onChange={handlePhoto}
                  className="mt-2 block w-full text-sm file:mr-3 file:rounded-md file:border-0 file:bg-accent file:text-accent-ink file:px-3 file:py-1.5 file:text-sm file:font-medium hover:file:bg-accent-hover"
                />
              </label>
              {photoStatus && (
                <p className="text-xs text-text-subtle italic">{photoStatus}</p>
              )}
            </div>
          )}

          {mode === "barcode" && (
            <div className="flex flex-col sm:flex-row gap-2">
              <input
                value={barcode}
                onChange={(e) => setBarcode(e.target.value)}
                placeholder="Type or scan a UPC code"
                inputMode="numeric"
                className="flex-1 rounded-md border border-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent/30"
              />
              <Button onClick={handleBarcodeLookup} variant="secondary">
                Look up
              </Button>
            </div>
          )}

          {mode === "manual" && (
            <input
              value={draft.name}
              onChange={(e) => handleManualSearch(e.target.value)}
              placeholder="Type a food (e.g. oatmeal, salmon, smoothie)"
              className="w-full rounded-md border border-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-accent/30"
            />
          )}

          {/* Draft details */}
          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <label className="text-xs text-text-muted">
              Meal
              <select
                value={draft.meal}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, meal: e.target.value as FoodEntry["meal"] }))
                }
                className="mt-1 block w-full rounded-md border border-border px-2 py-1.5 text-sm bg-surface"
              >
                <option value="breakfast">Breakfast</option>
                <option value="lunch">Lunch</option>
                <option value="dinner">Dinner</option>
                <option value="snack">Snack</option>
              </select>
            </label>
            <label className="text-xs text-text-muted">
              Servings
              <input
                value={draft.servings}
                onChange={(e) => setDraft((d) => ({ ...d, servings: e.target.value }))}
                inputMode="decimal"
                className="mt-1 block w-full rounded-md border border-border px-2 py-1.5 text-sm"
              />
            </label>
          </div>

          {draft.name && (
            <div className="mt-4 rounded-lg bg-surface-muted/60 border border-border/50 px-4 py-3">
              <p className="text-sm font-medium text-text">{draft.name}</p>
              <p className="text-xs text-text-subtle mt-1">
                Per serving · {draft.perServing.calories} cal · {draft.perServing.protein}g P ·{" "}
                {draft.perServing.carbs}g C · {draft.perServing.fat}g F
              </p>
            </div>
          )}

          <div className="mt-5 flex justify-end">
            <Button onClick={saveEntry} disabled={!draft.name.trim()}>
              Log meal
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Today's entries */}
      <section>
        <Eyebrow className="mb-3">Today&apos;s meals</Eyebrow>
        {todayEntries.length === 0 ? (
          <p className="text-sm text-text-muted">
            Nothing logged yet today. Even a snack helps your team see patterns.
          </p>
        ) : (
          <ul className="space-y-2">
            {todayEntries.map((e) => {
              const total = totalForEntry(e);
              return (
                <li
                  key={e.id}
                  className="flex items-center justify-between gap-3 rounded-xl border border-border bg-surface-raised px-4 py-3 shadow-sm"
                >
                  <div className="flex items-start gap-3 min-w-0">
                    <span className="text-2xl shrink-0" aria-hidden="true">
                      {MEAL_EMOJI[e.meal]}
                    </span>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-text">{e.name}</p>
                      <p className="text-xs text-text-subtle mt-0.5">
                        {MEAL_LABEL[e.meal]} · {e.servings} serving
                        {e.servings === 1 ? "" : "s"} · {total.calories} cal
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Badge tone="neutral" className="text-[10px] capitalize">
                      {e.source}
                    </Badge>
                    <button
                      type="button"
                      onClick={() => deleteEntry(e.id)}
                      className="text-xs text-text-subtle hover:text-danger transition-colors"
                    >
                      Remove
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}

function MacroRing({
  label,
  value,
  target,
  unit,
  emoji,
}: {
  label: string;
  value: number;
  target: number;
  unit: string;
  emoji: string;
}) {
  const pct = Math.min(100, Math.round((value / target) * 100));
  return (
    <div className="text-center">
      <div className="relative w-16 h-16 mx-auto">
        <svg viewBox="0 0 36 36" className="w-full h-full">
          <circle
            cx="18"
            cy="18"
            r="15.5"
            fill="none"
            stroke="var(--border)"
            strokeWidth="3"
          />
          <circle
            cx="18"
            cy="18"
            r="15.5"
            fill="none"
            stroke="var(--accent)"
            strokeWidth="3"
            strokeLinecap="round"
            pathLength={100}
            strokeDasharray={`${pct} 100`}
            transform="rotate(-90 18 18)"
          />
        </svg>
        <span className="absolute inset-0 flex items-center justify-center text-base">
          {emoji}
        </span>
      </div>
      <p className="text-[11px] uppercase tracking-wide text-text-subtle mt-2">{label}</p>
      <p className="text-sm font-display tabular-nums text-text">
        {value}
        {unit}
        <span className="text-text-subtle"> / {target}{unit}</span>
      </p>
    </div>
  );
}
