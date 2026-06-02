"use client";

// EMR-083 — BMI-for-age card.
//
// Surfaces the pure growth engine (`@/lib/clinical/pediatric-growth`):
// the clinician enters height + weight and sees the CDC 2-20
// BMI-for-age category for the patient's age and sex. No persistence —
// a point-of-care calculator that mirrors the chart's growth overlay.

import { useState } from "react";
import {
  bmi,
  cdcBmiCategory,
  BMI_CATEGORY_LABELS,
  type BmiCategory,
  type Sex,
} from "@/lib/clinical/pediatric-growth";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input, Label } from "@/components/ui/input";

export function BmiForAgeCard({
  ageYears,
  defaultSex = "male",
}: {
  ageYears: number;
  defaultSex?: Sex;
}) {
  const [sex, setSex] = useState<Sex>(defaultSex);
  const [heightCm, setHeightCm] = useState("");
  const [weightKg, setWeightKg] = useState("");

  const h = parseFloat(heightCm);
  const w = parseFloat(weightKg);
  const bmiValue =
    Number.isFinite(h) && Number.isFinite(w) && h > 0 && w > 0
      ? bmi(w, h)
      : NaN;
  const category = Number.isFinite(bmiValue)
    ? cdcBmiCategory(bmiValue, ageYears, sex)
    : null;

  return (
    <Card tone="raised">
      <CardHeader>
        <CardTitle className="text-base">BMI for age</CardTitle>
        <CardDescription>
          CDC 2-20 BMI-for-age percentile band for this patient&apos;s age and
          sex. Enter today&apos;s height and weight.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-4">
          <div className="w-28">
            <Label htmlFor="bmi-height">Height (cm)</Label>
            <Input
              id="bmi-height"
              inputMode="decimal"
              value={heightCm}
              onChange={(e) => setHeightCm(e.target.value)}
              placeholder="128"
              className="mt-1"
            />
          </div>
          <div className="w-28">
            <Label htmlFor="bmi-weight">Weight (kg)</Label>
            <Input
              id="bmi-weight"
              inputMode="decimal"
              value={weightKg}
              onChange={(e) => setWeightKg(e.target.value)}
              placeholder="25"
              className="mt-1"
            />
          </div>
          <div>
            <Label htmlFor="bmi-sex">Sex</Label>
            <select
              id="bmi-sex"
              value={sex}
              onChange={(e) => setSex(e.target.value as Sex)}
              className="mt-1 block rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text focus:outline-none focus:ring-2 focus:ring-accent/40"
            >
              <option value="male">Male</option>
              <option value="female">Female</option>
            </select>
          </div>
        </div>

        <div className="rounded-lg border border-border/70 px-4 py-3">
          {category && Number.isFinite(bmiValue) ? (
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-[11px] uppercase tracking-[0.14em] text-text-subtle">
                  BMI
                </p>
                <p className="font-display text-2xl text-text tabular-nums">
                  {bmiValue.toFixed(1)}
                </p>
              </div>
              <Badge tone={categoryTone(category)}>
                {BMI_CATEGORY_LABELS[category]}
              </Badge>
            </div>
          ) : (
            <p className="text-[13px] text-text-subtle">
              Enter height and weight to compute the BMI-for-age band.
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function categoryTone(
  category: BmiCategory,
): "success" | "warning" | "danger" {
  switch (category) {
    case "healthy":
      return "success";
    case "underweight":
    case "overweight":
      return "warning";
    case "obese":
      return "danger";
  }
}
