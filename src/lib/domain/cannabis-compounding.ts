// Cannabis Compounding & Botanical Order Builder — EMR-1163 (Domain 7)
//
// Pure, side-effect-free engine for the *multi-constituent* compound workflow
// that the existing single-product models can't express:
//   - CannabisProduct      → one finished product (thc/cbd/cbn concentrations)
//   - DosingRegimen        → one patient dosing one product
//   - DOSING_PROTOCOLS     → hardcoded titration templates (cannabis-dosing-protocols.ts)
//
// A compound formulation is a clinician-defined *recipe*: a target cannabinoid
// ratio (e.g. CBD:THC:CBN = 20:1:2) at a target total concentration, compounded
// into a batch from raw ingredients (isolates / distillates) + a carrier oil.
// This module computes the per-constituent breakdown, the raw-ingredient YIELD
// (how many grams of each isolate + how much carrier), and checks the batch
// against a *caller-supplied* jurisdictional THC limit.
//
// Governance: this engine never hardcodes legal limits or makes the prescribing
// decision. Limits are passed in by policy (see feedback: clinical-governance);
// it computes and flags, the clinician decides.

export type Cannabinoid = "THC" | "CBD" | "CBN" | "CBG" | "CBC" | "THCV";

export const CANNABINOIDS: readonly Cannabinoid[] = ["THC", "CBD", "CBN", "CBG", "CBC", "THCV"];

const CANNABINOID_SET = new Set<string>(CANNABINOIDS);

function isCannabinoid(x: string): x is Cannabinoid {
  return CANNABINOID_SET.has(x.toUpperCase());
}

export type Ratio = Partial<Record<Cannabinoid, number>>;

export interface FormulationTarget {
  /** Relative parts per cannabinoid, e.g. { CBD: 20, THC: 1, CBN: 2 }. */
  ratio: Ratio;
  /** Target TOTAL cannabinoid concentration across all constituents (mg/mL). */
  totalCannabinoidMgPerMl: number;
  /** Total batch volume to compound (mL). */
  batchVolumeMl: number;
}

export interface ConstituentBreakdown {
  cannabinoid: Cannabinoid;
  parts: number;
  /** parts / totalParts (0–1). */
  fraction: number;
  mgPerMl: number;
  /** mgPerMl × batchVolumeMl. */
  mgTotal: number;
}

export interface Formulation {
  target: FormulationTarget;
  constituents: ConstituentBreakdown[];
  totalParts: number;
  /** Sum of constituent mg/mL — equals target.totalCannabinoidMgPerMl. */
  totalMgPerMl: number;
  /** Sum of constituent mg over the batch. */
  totalCannabinoidMg: number;
  /** Normalized human label, e.g. "CBD:THC:CBN 20:1:2". */
  ratioLabel: string;
}

// ── Ratio parsing ──────────────────────────────────────────────────────────

// One alternation, scanned globally: a cannabinoid adjacent to a number in
// EITHER order. Because the regex finds the leftmost match, a leading number
// ("20 CBD") is consumed by the number-first arm before "CBD" can be misread as
// pairing with the *next* segment's number.
const PAIR = /(THC|CBD|CBN|CBG|CBC|THCV)\s*[:=]?\s*([0-9]*\.?[0-9]+)|([0-9]*\.?[0-9]+)\s*[:=]?\s*(THC|CBD|CBN|CBG|CBC|THCV)/gi;

/**
 * Parse a free-form ratio spec into a normalized {cannabinoid: parts} map.
 * Accepts, among others:
 *   "CBD:THC:CBN = 20:1:2"      (names then values, positional)
 *   "CBD 20, THC 1, CBN 2"
 *   "20 CBD : 1 THC : 2 CBN"
 *   "CBD20 THC1 CBN2"
 */
export function parseRatio(spec: string): Ratio {
  const trimmed = spec.trim();

  const out: Ratio = {};
  const add = (name: string, val: number) => {
    const c = name.toUpperCase() as Cannabinoid;
    out[c] = (out[c] ?? 0) + val;
  };

  // Form: "<names> = <values>" — a single '=' splitting all-names from
  // all-values, paired positionally (e.g. "CBD:THC:CBN = 20:1:2").
  const halves = trimmed.split("=");
  if (halves.length === 2) {
    const names = (halves[0].match(/[A-Za-z]+/g) ?? []).filter(isCannabinoid) as Cannabinoid[];
    const values = (halves[1].match(/[0-9]*\.?[0-9]+/g) ?? []).map(Number);
    if (names.length > 0 && names.length === values.length && !/[A-Za-z]/.test(halves[1])) {
      names.forEach((n, i) => add(n, values[i]));
      return out;
    }
  }

  // Form: adjacent name+number (either order) pairs anywhere in the string.
  for (const m of trimmed.matchAll(PAIR)) {
    if (m[1] != null) add(m[1], Number(m[2]));
    else add(m[4], Number(m[3]));
  }

  if (Object.keys(out).length === 0) {
    throw new Error(`Unparseable cannabinoid ratio: "${spec}"`);
  }
  return out;
}

// ── Formulation math ───────────────────────────────────────────────────────

function reduceParts(parts: number[]): number[] {
  // Reduce to small integers when the parts are whole numbers; otherwise leave as-is.
  if (!parts.every((p) => Number.isInteger(p) && p > 0)) return parts;
  const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));
  const g = parts.reduce((acc, p) => gcd(acc, p), parts[0]);
  return g > 1 ? parts.map((p) => p / g) : parts;
}

/**
 * Expand a target ratio + concentration + batch size into a full per-constituent
 * formulation. Throws on a degenerate target (empty/negative ratio, non-positive
 * concentration or volume).
 */
export function computeFormulation(target: FormulationTarget): Formulation {
  const { ratio, totalCannabinoidMgPerMl, batchVolumeMl } = target;
  const entries = (Object.entries(ratio) as [Cannabinoid, number][]).filter(([, p]) => p > 0);

  if (entries.length === 0) throw new Error("Formulation ratio must have at least one positive part");
  if (entries.some(([, p]) => p < 0)) throw new Error("Ratio parts cannot be negative");
  if (!(totalCannabinoidMgPerMl > 0)) throw new Error("totalCannabinoidMgPerMl must be > 0");
  if (!(batchVolumeMl > 0)) throw new Error("batchVolumeMl must be > 0");

  const totalParts = entries.reduce((sum, [, p]) => sum + p, 0);

  const constituents: ConstituentBreakdown[] = entries.map(([cannabinoid, parts]) => {
    const fraction = parts / totalParts;
    const mgPerMl = totalCannabinoidMgPerMl * fraction;
    return {
      cannabinoid,
      parts,
      fraction,
      mgPerMl,
      mgTotal: mgPerMl * batchVolumeMl,
    };
  });

  const reduced = reduceParts(entries.map(([, p]) => p));
  const ratioLabel = `${entries.map(([c]) => c).join(":")} ${reduced.join(":")}`;

  return {
    target,
    constituents,
    totalParts,
    totalMgPerMl: totalCannabinoidMgPerMl,
    totalCannabinoidMg: totalCannabinoidMgPerMl * batchVolumeMl,
    ratioLabel,
  };
}

// ── Raw-ingredient yield ───────────────────────────────────────────────────

export interface RawIngredient {
  id: string;
  label: string;
  /**
   * mg of each cannabinoid delivered per GRAM of this raw ingredient.
   *   CBD isolate ≈ { CBD: 990 }
   *   THC distillate ≈ { THC: 880, CBD: 20 }
   *   broad-spectrum ≈ { CBD: 700, CBN: 40, CBG: 30 }
   */
  potencyMgPerGram: Partial<Record<Cannabinoid, number>>;
  /** g/mL, used to size the carrier. Cannabis oils ≈ 0.90–0.95. Default 0.95. */
  densityGPerMl?: number;
}

const DEFAULT_DENSITY = 0.95;
const DEFAULT_TOLERANCE = 0.05; // 5% — incidental-cannabinoid overshoot warning threshold

export interface YieldIngredientLine {
  id: string;
  label: string;
  grams: number;
  volumeMl: number;
  contributesMg: Partial<Record<Cannabinoid, number>>;
}

export interface YieldDelta {
  cannabinoid: Cannabinoid;
  targetMg: number;
  achievedMg: number;
  deltaMg: number;
  withinTolerance: boolean;
}

export interface YieldResult {
  ingredients: YieldIngredientLine[];
  carrierVolumeMl: number;
  totalVolumeMl: number;
  achievedTotalMg: Partial<Record<Cannabinoid, number>>;
  deltas: YieldDelta[];
  /** Target cannabinoids no raw ingredient supplies. */
  unmet: Cannabinoid[];
  warnings: string[];
}

export interface YieldOptions {
  /** Pin a specific ingredient (by id) as the source for a cannabinoid. */
  sourceByCannabinoid?: Partial<Record<Cannabinoid, string>>;
  carrierLabel?: string;
  /** Relative overshoot beyond which an incidental-contribution warning fires. */
  tolerance?: number;
}

function chooseSource(
  c: Cannabinoid,
  ingredients: RawIngredient[],
  pin?: string,
): RawIngredient | undefined {
  if (pin) {
    const pinned = ingredients.find((i) => i.id === pin && (i.potencyMgPerGram[c] ?? 0) > 0);
    if (pinned) return pinned;
  }
  // Most concentrated source for this cannabinoid wins.
  return ingredients
    .filter((i) => (i.potencyMgPerGram[c] ?? 0) > 0)
    .sort((a, b) => (b.potencyMgPerGram[c] ?? 0) - (a.potencyMgPerGram[c] ?? 0))[0];
}

/**
 * Compute how much of each raw ingredient + carrier is needed to compound a
 * formulation. Uses a greedy one-source-per-cannabinoid assignment: each target
 * cannabinoid is sourced from its most concentrated ingredient, then incidental
 * cross-contributions (e.g. the CBD that rides along in a THC distillate) are
 * netted out and flagged when they push a constituent past tolerance.
 */
export function computeYield(
  formulation: Formulation,
  ingredients: RawIngredient[],
  opts: YieldOptions = {},
): YieldResult {
  const tolerance = opts.tolerance ?? DEFAULT_TOLERANCE;
  const warnings: string[] = [];
  const unmet: Cannabinoid[] = [];
  const gramsById = new Map<string, number>();
  const used = new Map<string, RawIngredient>();

  for (const con of formulation.constituents) {
    if (con.mgTotal <= 0) continue;
    const source = chooseSource(con.cannabinoid, ingredients, opts.sourceByCannabinoid?.[con.cannabinoid]);
    if (!source) {
      unmet.push(con.cannabinoid);
      warnings.push(`No raw ingredient supplies ${con.cannabinoid}.`);
      continue;
    }
    const potency = source.potencyMgPerGram[con.cannabinoid] as number;
    const grams = con.mgTotal / potency;
    gramsById.set(source.id, (gramsById.get(source.id) ?? 0) + grams);
    used.set(source.id, source);
  }

  const lines: YieldIngredientLine[] = [];
  let activesVolumeMl = 0;
  const achievedTotalMg: Partial<Record<Cannabinoid, number>> = {};

  for (const [id, grams] of gramsById) {
    const ing = used.get(id) as RawIngredient;
    const density = ing.densityGPerMl ?? DEFAULT_DENSITY;
    const volumeMl = grams / density;
    activesVolumeMl += volumeMl;
    const contributesMg: Partial<Record<Cannabinoid, number>> = {};
    for (const c of CANNABINOIDS) {
      const p = ing.potencyMgPerGram[c] ?? 0;
      if (p > 0) {
        const mg = grams * p;
        contributesMg[c] = mg;
        achievedTotalMg[c] = (achievedTotalMg[c] ?? 0) + mg;
      }
    }
    lines.push({ id, label: ing.label, grams, volumeMl, contributesMg });
  }

  const deltas: YieldDelta[] = formulation.constituents.map((con) => {
    const achievedMg = achievedTotalMg[con.cannabinoid] ?? 0;
    const deltaMg = achievedMg - con.mgTotal;
    const withinTolerance = con.mgTotal === 0 ? deltaMg === 0 : Math.abs(deltaMg) / con.mgTotal <= tolerance;
    if (!withinTolerance && achievedMg > con.mgTotal) {
      warnings.push(
        `${con.cannabinoid} overshoots target by ${(deltaMg).toFixed(1)} mg (incidental content in another ingredient).`,
      );
    }
    return { cannabinoid: con.cannabinoid, targetMg: con.mgTotal, achievedMg, deltaMg, withinTolerance };
  });

  const carrierVolumeMl = formulation.target.batchVolumeMl - activesVolumeMl;
  if (carrierVolumeMl < 0) {
    warnings.push(
      `Active ingredients (${activesVolumeMl.toFixed(1)} mL) exceed the ${formulation.target.batchVolumeMl} mL batch — raise batch volume or lower concentration.`,
    );
  }

  return {
    ingredients: lines,
    carrierVolumeMl: Math.max(0, carrierVolumeMl),
    totalVolumeMl: formulation.target.batchVolumeMl,
    achievedTotalMg,
    deltas,
    unmet,
    warnings,
  };
}

// ── Jurisdictional THC guardrail (parametric — policy supplies the limit) ────

export interface ThcLimit {
  maxThcMgPerBatch?: number;
  maxThcMgPerDay?: number;
  /** Free-text policy source, surfaced in violation messages. */
  label?: string;
}

export interface DoseSpec {
  mlPerDose: number;
  dosesPerDay: number;
}

function thcConstituent(f: Formulation): ConstituentBreakdown | undefined {
  return f.constituents.find((c) => c.cannabinoid === "THC");
}

export function batchThcMg(f: Formulation): number {
  return thcConstituent(f)?.mgTotal ?? 0;
}

export function dailyThcMg(f: Formulation, dose: DoseSpec): number {
  const mgPerMl = thcConstituent(f)?.mgPerMl ?? 0;
  return mgPerMl * dose.mlPerDose * dose.dosesPerDay;
}

export interface GuardrailResult {
  ok: boolean;
  violations: string[];
}

/**
 * Check a formulation against a caller-supplied THC limit. Returns the list of
 * violations (empty ⇒ ok). The limit is owned by clinic/jurisdiction policy,
 * not this module.
 */
export function checkThcGuardrail(f: Formulation, limit: ThcLimit, dose?: DoseSpec): GuardrailResult {
  const violations: string[] = [];
  const src = limit.label ? ` (${limit.label})` : "";

  if (limit.maxThcMgPerBatch != null) {
    const batch = batchThcMg(f);
    if (batch > limit.maxThcMgPerBatch) {
      violations.push(
        `Batch THC ${batch.toFixed(1)} mg exceeds the ${limit.maxThcMgPerBatch} mg per-batch limit${src}.`,
      );
    }
  }
  if (limit.maxThcMgPerDay != null && dose) {
    const daily = dailyThcMg(f, dose);
    if (daily > limit.maxThcMgPerDay) {
      violations.push(
        `Daily THC ${daily.toFixed(1)} mg exceeds the ${limit.maxThcMgPerDay} mg/day limit${src}.`,
      );
    }
  }
  return { ok: violations.length === 0, violations };
}
