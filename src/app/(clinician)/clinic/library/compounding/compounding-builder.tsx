"use client";

// Cannabis Compound & Botanical Order Builder — EMR-1163 (Domain 7).
//
// Clinician-facing builder over the pure engine in
// @/lib/domain/cannabis-compounding. Enter a target ratio + concentration +
// batch size; see the per-constituent breakdown, the raw-ingredient yield
// (grams of each isolate + carrier oil), and a policy THC guardrail. Save
// reusable Formulation Blueprints (localStorage-interim until the
// CompoundFormulation model lands — see the EMR-1163 epic).

import { useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input, Label, FieldGroup } from "@/components/ui/input";
import { LeafSprig } from "@/components/ui/ornament";
import { cn } from "@/lib/utils/cn";
import {
  CANNABINOIDS,
  parseRatio,
  computeFormulation,
  computeYield,
  checkThcGuardrail,
  type Cannabinoid,
  type RawIngredient,
} from "@/lib/domain/cannabis-compounding";

const BLUEPRINTS_KEY = "lj.compounding.blueprints.v1";

interface IngredientRow {
  id: string;
  label: string;
  cannabinoid: Cannabinoid;
  potencyMgPerGram: number;
}

interface Blueprint {
  name: string;
  ratioSpec: string;
  totalMgPerMl: number;
  batchMl: number;
  savedAt: string;
}

// Smart defaults (Dr. Patel directive: auto-populate everywhere). A typical
// sublingual-oil inventory — clinician edits to match their compounding stock.
const DEFAULT_INGREDIENTS: IngredientRow[] = [
  { id: "cbd-iso", label: "CBD isolate", cannabinoid: "CBD", potencyMgPerGram: 990 },
  { id: "thc-dist", label: "THC distillate", cannabinoid: "THC", potencyMgPerGram: 880 },
  { id: "cbn-iso", label: "CBN isolate", cannabinoid: "CBN", potencyMgPerGram: 980 },
  { id: "cbg-iso", label: "CBG isolate", cannabinoid: "CBG", potencyMgPerGram: 980 },
];

function fmt(n: number, digits = 1): string {
  if (!Number.isFinite(n)) return "—";
  return n.toLocaleString(undefined, { maximumFractionDigits: digits });
}

const selectClass =
  "h-10 rounded-md border border-border-strong bg-surface px-2 text-sm text-text " +
  "focus:outline-none focus-visible:border-accent focus-visible:ring-2 focus-visible:ring-accent/30";

export function CompoundingBuilder() {
  const [ratioSpec, setRatioSpec] = useState("CBD:THC:CBN = 20:1:2");
  const [totalMgPerMl, setTotalMgPerMl] = useState("50");
  const [batchMl, setBatchMl] = useState("30");
  const [ingredients, setIngredients] = useState<IngredientRow[]>(DEFAULT_INGREDIENTS);

  const [thcEnabled, setThcEnabled] = useState(true);
  const [thcMaxBatch, setThcMaxBatch] = useState("100");
  const [thcPolicyLabel, setThcPolicyLabel] = useState("Clinic policy");

  const [blueprints, setBlueprints] = useState<Blueprint[]>([]);
  const [blueprintName, setBlueprintName] = useState("");

  // Load saved blueprints once on mount.
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(BLUEPRINTS_KEY);
      if (raw) setBlueprints(JSON.parse(raw) as Blueprint[]);
    } catch {
      /* corrupt/absent storage — start empty */
    }
  }, []);

  function persistBlueprints(next: Blueprint[]) {
    setBlueprints(next);
    try {
      window.localStorage.setItem(BLUEPRINTS_KEY, JSON.stringify(next));
    } catch {
      /* storage full/blocked — keep in-memory */
    }
  }

  const computed = useMemo(() => {
    try {
      const ratio = parseRatio(ratioSpec);
      const formulation = computeFormulation({
        ratio,
        totalCannabinoidMgPerMl: Number(totalMgPerMl),
        batchVolumeMl: Number(batchMl),
      });
      const raw: RawIngredient[] = ingredients
        .filter((i) => i.label.trim() && i.potencyMgPerGram > 0)
        .map((i) => ({
          id: i.id,
          label: i.label,
          potencyMgPerGram: { [i.cannabinoid]: i.potencyMgPerGram },
        }));
      const yieldResult = computeYield(formulation, raw);
      const guardrail =
        thcEnabled && Number(thcMaxBatch) > 0
          ? checkThcGuardrail(formulation, {
              maxThcMgPerBatch: Number(thcMaxBatch),
              label: thcPolicyLabel.trim() || undefined,
            })
          : null;
      return { formulation, yieldResult, guardrail, error: null as string | null };
    } catch (e) {
      return { formulation: null, yieldResult: null, guardrail: null, error: (e as Error).message };
    }
  }, [ratioSpec, totalMgPerMl, batchMl, ingredients, thcEnabled, thcMaxBatch, thcPolicyLabel]);

  function updateIngredient(id: string, patch: Partial<IngredientRow>) {
    setIngredients((rows) => rows.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }
  function addIngredient() {
    setIngredients((rows) => [
      ...rows,
      { id: `ing-${rows.length}-${rows.reduce((a, r) => a + r.label.length, 0)}`, label: "", cannabinoid: "CBD", potencyMgPerGram: 900 },
    ]);
  }
  function removeIngredient(id: string) {
    setIngredients((rows) => rows.filter((r) => r.id !== id));
  }

  function saveBlueprint() {
    const name = blueprintName.trim();
    if (!name) return;
    const bp: Blueprint = {
      name,
      ratioSpec,
      totalMgPerMl: Number(totalMgPerMl),
      batchMl: Number(batchMl),
      savedAt: new Date().toISOString(),
    };
    persistBlueprints([bp, ...blueprints.filter((b) => b.name !== name)]);
    setBlueprintName("");
  }
  function loadBlueprint(bp: Blueprint) {
    setRatioSpec(bp.ratioSpec);
    setTotalMgPerMl(String(bp.totalMgPerMl));
    setBatchMl(String(bp.batchMl));
  }
  function deleteBlueprint(name: string) {
    persistBlueprints(blueprints.filter((b) => b.name !== name));
  }

  const { formulation, yieldResult, guardrail, error } = computed;

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
      {/* ── Inputs ─────────────────────────────────────────── */}
      <div className="space-y-6">
        <Card tone="raised">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <span aria-hidden>⚗️</span> Target formulation
            </CardTitle>
            <CardDescription>Define the cannabinoid ratio and the batch you want to compound.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <FieldGroup
              label="Cannabinoid ratio"
              hint='e.g. "CBD:THC:CBN = 20:1:2" or "CBD 20, THC 1"'
              error={error ?? undefined}
            >
              <Input value={ratioSpec} onChange={(e) => setRatioSpec(e.target.value)} />
            </FieldGroup>
            <div className="grid grid-cols-2 gap-4">
              <FieldGroup label="Total cannabinoid (mg/mL)">
                <Input
                  type="number"
                  inputMode="decimal"
                  min={0}
                  value={totalMgPerMl}
                  onChange={(e) => setTotalMgPerMl(e.target.value)}
                />
              </FieldGroup>
              <FieldGroup label="Batch volume (mL)">
                <Input
                  type="number"
                  inputMode="decimal"
                  min={0}
                  value={batchMl}
                  onChange={(e) => setBatchMl(e.target.value)}
                />
              </FieldGroup>
            </div>
            {formulation && (
              <div className="flex flex-wrap items-center gap-2 pt-1">
                <Badge tone="highlight">{formulation.ratioLabel}</Badge>
                <Badge tone="neutral">{fmt(formulation.totalCannabinoidMg)} mg total cannabinoid</Badge>
              </div>
            )}
          </CardContent>
        </Card>

        <Card tone="raised">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <span aria-hidden>🧪</span> Raw ingredient inventory
            </CardTitle>
            <CardDescription>Potency of each isolate/distillate on hand (mg active per gram).</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {ingredients.map((ing) => (
              <div key={ing.id} className="flex items-end gap-2">
                <div className="flex-1">
                  <Label htmlFor={`lbl-${ing.id}`}>Ingredient</Label>
                  <Input
                    id={`lbl-${ing.id}`}
                    value={ing.label}
                    placeholder="CBD isolate"
                    onChange={(e) => updateIngredient(ing.id, { label: e.target.value })}
                  />
                </div>
                <div className="w-24">
                  <Label htmlFor={`cb-${ing.id}`}>Cannabinoid</Label>
                  <select
                    id={`cb-${ing.id}`}
                    className={cn(selectClass, "w-full")}
                    value={ing.cannabinoid}
                    onChange={(e) => updateIngredient(ing.id, { cannabinoid: e.target.value as Cannabinoid })}
                  >
                    {CANNABINOIDS.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="w-24">
                  <Label htmlFor={`p-${ing.id}`}>mg/g</Label>
                  <Input
                    id={`p-${ing.id}`}
                    type="number"
                    inputMode="decimal"
                    min={0}
                    value={ing.potencyMgPerGram}
                    onChange={(e) => updateIngredient(ing.id, { potencyMgPerGram: Number(e.target.value) })}
                  />
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  aria-label={`Remove ${ing.label || "ingredient"}`}
                  onClick={() => removeIngredient(ing.id)}
                >
                  ✕
                </Button>
              </div>
            ))}
            <Button type="button" variant="secondary" size="sm" onClick={addIngredient}>
              + Add ingredient
            </Button>
          </CardContent>
        </Card>

        <Card tone="raised">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <span aria-hidden>🛡️</span> Jurisdictional THC guardrail
            </CardTitle>
            <CardDescription>Policy-owned limit — the builder flags, the clinician decides.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <label className="flex items-center gap-2 text-sm text-text">
              <input type="checkbox" checked={thcEnabled} onChange={(e) => setThcEnabled(e.target.checked)} />
              Enforce a per-batch THC mass limit
            </label>
            {thcEnabled && (
              <div className="grid grid-cols-2 gap-4">
                <FieldGroup label="Max THC per batch (mg)">
                  <Input
                    type="number"
                    inputMode="decimal"
                    min={0}
                    value={thcMaxBatch}
                    onChange={(e) => setThcMaxBatch(e.target.value)}
                  />
                </FieldGroup>
                <FieldGroup label="Policy source">
                  <Input value={thcPolicyLabel} onChange={(e) => setThcPolicyLabel(e.target.value)} />
                </FieldGroup>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ── Results ────────────────────────────────────────── */}
      <div className="space-y-6">
        {guardrail && (
          <div
            className={cn(
              "rounded-lg border px-4 py-3 text-sm",
              guardrail.ok
                ? "border-success/40 bg-success/5 text-success"
                : "border-danger/40 bg-danger/5 text-danger",
            )}
            role={guardrail.ok ? undefined : "alert"}
          >
            {guardrail.ok ? (
              <span>✅ Within the {thcPolicyLabel || "policy"} THC limit.</span>
            ) : (
              <ul className="space-y-1">
                {guardrail.violations.map((v) => (
                  <li key={v}>⚠️ {v}</li>
                ))}
              </ul>
            )}
          </div>
        )}

        <Card tone="raised">
          <CardHeader>
            <CardTitle>Constituent breakdown</CardTitle>
          </CardHeader>
          <CardContent>
            {formulation ? (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-text-subtle">
                    <th className="py-2 pr-4 font-medium">Cannabinoid</th>
                    <th className="py-2 pr-4 font-medium">Parts</th>
                    <th className="py-2 pr-4 font-medium">mg/mL</th>
                    <th className="py-2 font-medium">mg / batch</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/40">
                  {formulation.constituents.map((c) => (
                    <tr key={c.cannabinoid}>
                      <td className="py-2 pr-4 font-medium text-text">{c.cannabinoid}</td>
                      <td className="py-2 pr-4 text-text-muted">{c.parts}</td>
                      <td className="py-2 pr-4 text-text-muted">{fmt(c.mgPerMl, 2)}</td>
                      <td className="py-2 text-text-muted">{fmt(c.mgTotal)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="text-sm text-text-subtle">Enter a valid ratio to see the breakdown.</p>
            )}
          </CardContent>
        </Card>

        <Card tone="raised">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <LeafSprig size={16} className="text-accent/80" /> Compounding yield
            </CardTitle>
            <CardDescription>What to weigh out for a {fmt(Number(batchMl))} mL batch.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {yieldResult ? (
              <>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-text-subtle">
                      <th className="py-2 pr-4 font-medium">Ingredient</th>
                      <th className="py-2 pr-4 font-medium">Weigh (g)</th>
                      <th className="py-2 font-medium">≈ Volume (mL)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/40">
                    {yieldResult.ingredients.map((i) => (
                      <tr key={i.id}>
                        <td className="py-2 pr-4 font-medium text-text">{i.label}</td>
                        <td className="py-2 pr-4 text-text-muted">{fmt(i.grams, 3)}</td>
                        <td className="py-2 text-text-muted">{fmt(i.volumeMl, 2)}</td>
                      </tr>
                    ))}
                    <tr>
                      <td className="py-2 pr-4 font-medium text-text">Carrier oil (q.s.)</td>
                      <td className="py-2 pr-4 text-text-subtle">—</td>
                      <td className="py-2 text-text-muted">{fmt(yieldResult.carrierVolumeMl, 2)}</td>
                    </tr>
                  </tbody>
                </table>
                {yieldResult.warnings.length > 0 && (
                  <ul className="space-y-1 rounded-md bg-warning/5 px-3 py-2 text-xs text-warning">
                    {yieldResult.warnings.map((w) => (
                      <li key={w}>⚠️ {w}</li>
                    ))}
                  </ul>
                )}
              </>
            ) : (
              <p className="text-sm text-text-subtle">Add at least one matching ingredient to compute the yield.</p>
            )}
          </CardContent>
        </Card>

        <Card tone="raised">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <span aria-hidden>📐</span> Formulation blueprints
            </CardTitle>
            <CardDescription>Save this recipe to reuse across patients.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-end gap-2">
              <div className="flex-1">
                <Label htmlFor="bp-name">Blueprint name</Label>
                <Input
                  id="bp-name"
                  value={blueprintName}
                  placeholder="20:1:2 sleep tincture"
                  onChange={(e) => setBlueprintName(e.target.value)}
                />
              </div>
              <Button type="button" onClick={saveBlueprint} disabled={!blueprintName.trim() || !formulation}>
                Save
              </Button>
            </div>
            {blueprints.length > 0 ? (
              <ul className="divide-y divide-border/40">
                {blueprints.map((bp) => (
                  <li key={bp.name} className="flex items-center justify-between py-2">
                    <div>
                      <p className="text-sm font-medium text-text">{bp.name}</p>
                      <p className="text-xs text-text-subtle">
                        {bp.ratioSpec} · {fmt(bp.totalMgPerMl)} mg/mL · {fmt(bp.batchMl)} mL
                      </p>
                    </div>
                    <div className="flex items-center gap-1">
                      <Button type="button" variant="ghost" size="sm" onClick={() => loadBlueprint(bp)}>
                        Load
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        aria-label={`Delete ${bp.name}`}
                        onClick={() => deleteBlueprint(bp.name)}
                      >
                        ✕
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-text-subtle">No saved blueprints yet.</p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
