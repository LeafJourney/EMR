"use client";

import React, { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";

interface VitalsState {
  systolic: string;
  diastolic: string;
  heartRate: string;
  respRate: string;
  tempF: string;
  spo2: string;
  weightLbs: string;
  heightIn: string;
}

const EMPTY: VitalsState = {
  systolic: "",
  diastolic: "",
  heartRate: "",
  respRate: "",
  tempF: "",
  spo2: "",
  weightLbs: "",
  heightIn: "",
};

function parseNum(s: string): number | null {
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : null;
}

function bmi(weightLbs: string, heightIn: string): number | null {
  const w = parseNum(weightLbs);
  const h = parseNum(heightIn);
  if (w == null || h == null || h <= 0) return null;
  return (w / (h * h)) * 703;
}

function bpFlag(sys: string, dia: string): { label: string; tone: "ok" | "warn" | "alert" } | null {
  const s = parseNum(sys);
  const d = parseNum(dia);
  if (s == null || d == null) return null;
  if (s >= 180 || d >= 120) return { label: "Hypertensive crisis", tone: "alert" };
  if (s >= 140 || d >= 90) return { label: "Stage 2 hypertension", tone: "alert" };
  if (s >= 130 || d >= 80) return { label: "Stage 1 hypertension", tone: "warn" };
  if (s < 90 || d < 60) return { label: "Hypotensive", tone: "warn" };
  return { label: "Normal", tone: "ok" };
}

function spo2Flag(spo2: string): { label: string; tone: "ok" | "warn" | "alert" } | null {
  const v = parseNum(spo2);
  if (v == null) return null;
  if (v < 90) return { label: "Hypoxemic", tone: "alert" };
  if (v < 95) return { label: "Low", tone: "warn" };
  return { label: "Normal", tone: "ok" };
}

function toneClass(tone: "ok" | "warn" | "alert"): string {
  if (tone === "alert") return "bg-red-100 text-red-700 border-red-200";
  if (tone === "warn") return "bg-amber-100 text-amber-700 border-amber-200";
  return "bg-emerald-100 text-emerald-700 border-emerald-200";
}

export function ObjectiveVitals() {
  const [state, setState] = useState<VitalsState>(EMPTY);

  const handleField = (key: keyof VitalsState, value: string) => {
    setState((prev) => ({ ...prev, [key]: value }));
  };

  const computedBmi = bmi(state.weightLbs, state.heightIn);
  const bp = bpFlag(state.systolic, state.diastolic);
  const sp = spo2Flag(state.spo2);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    console.log("Vitals:", { ...state, bmi: computedBmi });
  };

  return (
    <Card className="w-full max-w-4xl mx-auto">
      <CardHeader>
        <CardTitle>Objective — Vitals Snapshot</CardTitle>
        <CardDescription>Vitals captured at the start of the encounter. BMI computes automatically.</CardDescription>
      </CardHeader>
      <form onSubmit={handleSubmit}>
        <CardContent className="space-y-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="space-y-1.5 col-span-2">
              <Label>Blood pressure (mmHg)</Label>
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  inputMode="numeric"
                  placeholder="120"
                  value={state.systolic}
                  onChange={(e) => handleField("systolic", e.target.value)}
                  aria-label="Systolic"
                />
                <span className="text-text-muted">/</span>
                <Input
                  type="number"
                  inputMode="numeric"
                  placeholder="80"
                  value={state.diastolic}
                  onChange={(e) => handleField("diastolic", e.target.value)}
                  aria-label="Diastolic"
                />
              </div>
              {bp && (
                <span className={`inline-block mt-1 text-xs px-2 py-0.5 rounded-md border ${toneClass(bp.tone)}`}>
                  {bp.label}
                </span>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="hr">Heart rate (bpm)</Label>
              <Input
                id="hr"
                type="number"
                inputMode="numeric"
                placeholder="72"
                value={state.heartRate}
                onChange={(e) => handleField("heartRate", e.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="rr">Resp rate (bpm)</Label>
              <Input
                id="rr"
                type="number"
                inputMode="numeric"
                placeholder="16"
                value={state.respRate}
                onChange={(e) => handleField("respRate", e.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="temp">Temperature (°F)</Label>
              <Input
                id="temp"
                type="number"
                step="0.1"
                inputMode="decimal"
                placeholder="98.6"
                value={state.tempF}
                onChange={(e) => handleField("tempF", e.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="spo2">SpO₂ (%)</Label>
              <Input
                id="spo2"
                type="number"
                inputMode="numeric"
                placeholder="98"
                value={state.spo2}
                onChange={(e) => handleField("spo2", e.target.value)}
              />
              {sp && (
                <span className={`inline-block mt-1 text-xs px-2 py-0.5 rounded-md border ${toneClass(sp.tone)}`}>
                  {sp.label}
                </span>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="weight">Weight (lbs)</Label>
              <Input
                id="weight"
                type="number"
                inputMode="decimal"
                placeholder="165"
                value={state.weightLbs}
                onChange={(e) => handleField("weightLbs", e.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="height">Height (in)</Label>
              <Input
                id="height"
                type="number"
                inputMode="decimal"
                placeholder="68"
                value={state.heightIn}
                onChange={(e) => handleField("heightIn", e.target.value)}
              />
            </div>
          </div>

          {computedBmi != null && (
            <div className="p-4 rounded-xl bg-[var(--accent)]/10 border border-[var(--accent)]/20 flex items-center justify-between">
              <span className="text-sm font-medium text-text-muted">BMI</span>
              <span className="text-2xl font-bold text-[var(--accent)] tabular-nums">{computedBmi.toFixed(1)}</span>
            </div>
          )}
        </CardContent>
        <CardFooter className="pt-6 border-t border-[var(--border)] flex justify-end">
          <Button type="submit" variant="primary">
            Save Vitals
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
}

export default ObjectiveVitals;
