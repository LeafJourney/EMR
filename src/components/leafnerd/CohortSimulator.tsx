"use client";

import React, { useRef, useState } from "react";

interface StatusCount {
  status: string;
  _count: number;
}

interface CohortSimulatorProps {
  statusCounts: StatusCount[];
}

/* ============================================================================
 * Pure curve / profile math (exported for unit tests — no DOM, no React).
 *
 * The chart lives in an SVG viewBox of `0 0 400 150`. The x-axis runs from "low
 * efficacy" (0) to "high efficacy" (400); y is inverted (0 = top), with the
 * cohort distribution resting on a BASELINE at y=140. A regimen+cohort profile
 * is reduced to a Gaussian (mean, sigma, peak height) and a few headline
 * metrics, so the bell curve is genuinely parametric rather than hand-plotted.
 * ========================================================================== */

export const BASELINE = 140;
export const X_MIN = 0;
export const X_MAX = 400;

export const round1 = (v: number) => Math.round(v * 10) / 10;
export const round2 = (v: number) => Math.round(v * 100) / 100;

export function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}

/** Two-sided z multiplier for a confidence level (band half-width = z·sigma). */
export function zForConfidence(confidence: string | number): number {
  const c = String(confidence);
  if (c === "90") return 1.645;
  if (c === "99") return 2.576;
  return 1.96; // 95% default
}

/** Unit-height Gaussian in [0,1]: 1 at the mean, decaying toward the tails. */
export function gaussianRatio(x: number, mean: number, sigma: number): number {
  const s = sigma <= 0 ? 1 : sigma;
  return Math.exp(-((x - mean) ** 2) / (2 * s * s));
}

/** Gaussian mapped into SVG y-space: `peakY` at the mean, `baseline` in the tails. */
export function gaussianY(
  x: number,
  mean: number,
  sigma: number,
  peakY: number,
  baseline: number = BASELINE,
): number {
  return baseline - (baseline - peakY) * gaussianRatio(x, mean, sigma);
}

/** Taller bell = more confident cohort. Maps efficacy% → curve height (px). */
export function amplitudeForEfficacy(efficacy: number): number {
  return clamp(36 + (efficacy / 100) * 96, 24, 132);
}

export function peakYForEfficacy(efficacy: number, baseline: number = BASELINE): number {
  return clamp(baseline - amplitudeForEfficacy(efficacy), 8, 130);
}

export interface CurvePoint {
  x: number;
  y: number;
}

/** Sample the bell curve across the full x-range for path rendering. */
export function sampleCurve(
  mean: number,
  sigma: number,
  peakY: number,
  step = 5,
): CurvePoint[] {
  const points: CurvePoint[] = [];
  for (let x = X_MIN; x <= X_MAX; x += step) {
    points.push({ x, y: round2(gaussianY(x, mean, sigma, peakY)) });
  }
  return points;
}

export function buildLinePath(points: CurvePoint[]): string {
  if (points.length === 0) return "";
  let d = `M ${points[0].x} ${points[0].y}`;
  for (let i = 1; i < points.length; i++) d += ` L ${points[i].x} ${points[i].y}`;
  return d;
}

/** Closed path: the curve dropped down to the baseline and back — the fill. */
export function buildAreaPath(points: CurvePoint[], baseline: number = BASELINE): string {
  if (points.length === 0) return "";
  const last = points[points.length - 1];
  return `${buildLinePath(points)} L ${last.x} ${baseline} L ${points[0].x} ${baseline} Z`;
}

/** Closed path for just the [lower, upper] confidence slice under the curve. */
export function buildBandPath(
  mean: number,
  sigma: number,
  peakY: number,
  lower: number,
  upper: number,
  baseline: number = BASELINE,
  step = 4,
): string {
  if (upper <= lower) return "";
  let d = `M ${round2(lower)} ${baseline}`;
  for (let x = lower; x < upper; x += step) {
    d += ` L ${round2(x)} ${round2(gaussianY(x, mean, sigma, peakY, baseline))}`;
  }
  d += ` L ${round2(upper)} ${round2(gaussianY(upper, mean, sigma, peakY, baseline))}`;
  d += ` L ${round2(upper)} ${baseline} Z`;
  return d;
}

export interface CohortPreset {
  id: string;
  label: string;
  emoji: string;
  mean: number;
  sigma: number;
  baseEfficacy: number;
  baseAdverse: number;
  dose: string;
  blurb: string;
}

/** Clinical archetypes the clinician can one-tap to reshape the distribution. */
export const COHORT_PRESETS: CohortPreset[] = [
  {
    id: "general",
    label: "General Cohort",
    emoji: "🌿",
    mean: 200,
    sigma: 62,
    baseEfficacy: 78,
    baseAdverse: 4.8,
    dose: "12.5mg",
    blurb:
      "Balanced population baseline — symptom resolution clusters around the therapeutic midpoint with a predictable spread.",
  },
  {
    id: "diabetic",
    label: "High-Risk Diabetics",
    emoji: "🩸",
    mean: 168,
    sigma: 80,
    baseEfficacy: 64,
    baseAdverse: 8.6,
    dose: "9.0mg",
    blurb:
      "High-risk diabetic cohort shows a wider, left-shifted response — glycemic interactions flatten the curve and raise adverse-event tails.",
  },
  {
    id: "geriatric",
    label: "Geriatric 65+",
    emoji: "🧓",
    mean: 150,
    sigma: 72,
    baseEfficacy: 69,
    baseAdverse: 6.4,
    dose: "7.5mg",
    blurb:
      "Geriatric patients respond at lower doses with a gentler peak; titrate slowly to keep the distribution inside tolerance.",
  },
  {
    id: "chronic-pain",
    label: "Chronic Pain",
    emoji: "🔥",
    mean: 244,
    sigma: 64,
    baseEfficacy: 82,
    baseAdverse: 5.6,
    dose: "15.0mg",
    blurb:
      "Chronic-pain responders skew toward the high-efficacy end — the cohort tolerates higher dosing for durable relief.",
  },
  {
    id: "anxiety",
    label: "Anxiety / PTSD",
    emoji: "🌙",
    mean: 188,
    sigma: 52,
    baseEfficacy: 85,
    baseAdverse: 2.1,
    dose: "20.0mg",
    blurb:
      "Anxiety and PTSD profiles concentrate tightly around a high-efficacy peak with a notably low adverse-event rate.",
  },
  {
    id: "naive",
    label: "Treatment-Naïve",
    emoji: "🌱",
    mean: 150,
    sigma: 46,
    baseEfficacy: 60,
    baseAdverse: 0.7,
    dose: "2.5mg",
    blurb:
      "Treatment-naïve prospects start narrow and conservative — ideal for building early compliance before escalation.",
  },
];

export interface RegimenMod {
  label: string;
  meanShift: number;
  sigmaScale: number;
  efficacyDelta: number;
  adverseScale: number;
  dose: string | null;
  note: string;
}

/** Cannabinoid ratio modulates the archetype curve (shift / spread / risk). */
export const REGIMEN_MODS: Record<string, RegimenMod> = {
  balanced: {
    label: "1:1 Balanced",
    meanShift: 0,
    sigmaScale: 1,
    efficacyDelta: 0,
    adverseScale: 1,
    dose: null,
    note: "A 1:1 balanced ratio holds the therapeutic index steady with synergistic activation.",
  },
  cbd: {
    label: "CBD Dominant",
    meanShift: -26,
    sigmaScale: 0.86,
    efficacyDelta: 6,
    adverseScale: 0.42,
    dose: "20.0mg",
    note: "CBD-dominant dosing tightens and left-shifts the curve, trading peak intensity for a far safer adverse profile.",
  },
  thc: {
    label: "THC Dominant",
    meanShift: 42,
    sigmaScale: 1.24,
    efficacyDelta: -9,
    adverseScale: 1.9,
    dose: "8.5mg",
    note: "THC-dominant dosing pushes the response right and widens variance — higher ceilings, heavier tails.",
  },
  micro: {
    label: "Microdosing",
    meanShift: -38,
    sigmaScale: 0.56,
    efficacyDelta: -15,
    adverseScale: 0.12,
    dose: "2.5mg",
    note: "Microdosing collapses the curve into a narrow, near-zero-risk band of sub-perceptual benefit.",
  },
};

/** Real-data status segment nudges efficacy (engaged patients respond better). */
export function segmentEfficacyDelta(segment?: string): number {
  switch ((segment ?? "").toLowerCase()) {
    case "active":
      return 2.5;
    case "prospect":
      return -2.5;
    case "inactive":
      return -5;
    case "archived":
      return -7.5;
    default:
      return 0;
  }
}

export interface CohortProfile {
  efficacy: number;
  adverseRate: number;
  optDose: string;
  mean: number;
  sigma: number;
  peakY: number;
  lower: number;
  upper: number;
  z: number;
  confidence: string;
  summary: string;
  presetLabel: string;
  regimenLabel: string;
}

export interface ComputeProfileArgs {
  presetId: string;
  regimenKey: string;
  confidence: string | number;
  segment?: string;
}

/** The deterministic core: archetype × regimen × confidence × segment → profile. */
export function computeProfile({
  presetId,
  regimenKey,
  confidence,
  segment,
}: ComputeProfileArgs): CohortProfile {
  const preset = COHORT_PRESETS.find((p) => p.id === presetId) ?? COHORT_PRESETS[0];
  const reg = REGIMEN_MODS[regimenKey] ?? REGIMEN_MODS.balanced;
  const z = zForConfidence(confidence);

  const mean = clamp(preset.mean + reg.meanShift, 60, 340);
  const sigma = clamp(preset.sigma * reg.sigmaScale, 24, 120);
  const efficacy = round1(
    clamp(preset.baseEfficacy + reg.efficacyDelta + segmentEfficacyDelta(segment), 5, 97),
  );
  // Wider confidence demands a heavier safety margin on the adverse estimate.
  const confidenceAdverseScale =
    String(confidence) === "99" ? 1.2 : String(confidence) === "90" ? 0.8 : 1;
  const adverseRate = round1(
    clamp(preset.baseAdverse * reg.adverseScale * confidenceAdverseScale, 0.1, 40),
  );
  const optDose = reg.dose ?? preset.dose;
  const peakY = peakYForEfficacy(efficacy);
  const lower = clamp(mean - z * sigma, X_MIN, X_MAX);
  const upper = clamp(mean + z * sigma, X_MIN, X_MAX);

  return {
    efficacy,
    adverseRate,
    optDose,
    mean,
    sigma,
    peakY,
    lower,
    upper,
    z,
    confidence: String(confidence),
    summary: `${preset.blurb} ${reg.note}`,
    presetLabel: preset.label,
    regimenLabel: reg.label,
  };
}

interface SimResults {
  profile: CohortProfile;
  points: CurvePoint[];
  linePath: string;
  areaPath: string;
  bandPath: string;
}

const ACCENT = "var(--color-accent-strong, #10b981)";
const SURFACE = "var(--color-bg, #ffffff)";

export function CohortSimulator({ statusCounts }: CohortSimulatorProps) {
  const [selectedCohort, setSelectedCohort] = useState(
    statusCounts[0]?.status ?? "active",
  );
  const [selectedPreset, setSelectedPreset] = useState("general");
  const [regimen, setRegimen] = useState("balanced");
  const [confidence, setConfidence] = useState("95");
  const [iterations, setIterations] = useState("5000");

  const [simStep, setSimStep] = useState(0); // 0 idle, 1-4 pipeline, 5 done
  const [simResults, setSimResults] = useState<SimResults | null>(null);

  // Hovered x in viewBox space (0–400), or null when the pointer is away.
  const [hoverX, setHoverX] = useState<number | null>(null);
  const chartRef = useRef<HTMLDivElement>(null);

  const runSimulation = () => {
    setSimStep(1);
    setSimResults(null);
    setHoverX(null);

    // Theatrical Monte Carlo pipeline — each step gates the next.
    setTimeout(() => {
      setSimStep(2);
      setTimeout(() => {
        setSimStep(3);
        setTimeout(() => {
          setSimStep(4);
          setTimeout(() => {
            generateResults();
            setSimStep(5);
          }, 700);
        }, 800);
      }, 800);
    }, 800);
  };

  const generateResults = () => {
    const profile = computeProfile({
      presetId: selectedPreset,
      regimenKey: regimen,
      confidence,
      segment: selectedCohort,
    });
    const points = sampleCurve(profile.mean, profile.sigma, profile.peakY);
    setSimResults({
      profile,
      points,
      linePath: buildLinePath(points),
      areaPath: buildAreaPath(points),
      bandPath: buildBandPath(
        profile.mean,
        profile.sigma,
        profile.peakY,
        profile.lower,
        profile.upper,
      ),
    });
  };

  const handlePointerMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!chartRef.current) return;
    const rect = chartRef.current.getBoundingClientRect();
    if (rect.width === 0) return;
    const x = clamp(((e.clientX - rect.left) / rect.width) * X_MAX, X_MIN, X_MAX);
    setHoverX(round2(x));
  };

  const profile = simResults?.profile ?? null;
  // Derived hover readout — recomputed cheaply from the Gaussian on each move.
  const hover =
    profile && hoverX !== null
      ? {
          x: hoverX,
          y: gaussianY(hoverX, profile.mean, profile.sigma, profile.peakY),
          ratio: gaussianRatio(hoverX, profile.mean, profile.sigma),
          density: Math.round(gaussianRatio(hoverX, profile.mean, profile.sigma) * 100),
          axis: Math.round((hoverX / X_MAX) * 100),
          inCI: hoverX >= profile.lower && hoverX <= profile.upper,
        }
      : null;
  const tooltipLeft = hover ? clamp(hover.axis, 8, 92) : 0;

  return (
    <div className="space-y-8">
      {/* Preset Cohort Profiles */}
      <div className="bg-bg-surface border border-border/10 rounded-2xl p-6 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <div>
            <span className="block text-xs font-bold text-text-muted uppercase tracking-wider">
              Preset Cohorts
            </span>
            <p className="text-xs text-text-muted mt-1">
              Tap a clinical archetype to reshape the synthetic distribution.
            </p>
          </div>
          <span className="text-[10px] font-bold text-accent-strong font-mono uppercase tracking-wider">
            {COHORT_PRESETS.length} profiles
          </span>
        </div>
        <div className="flex flex-wrap gap-2">
          {COHORT_PRESETS.map((p) => {
            const active = selectedPreset === p.id;
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => setSelectedPreset(p.id)}
                title={p.blurb}
                aria-pressed={active}
                className={`flex items-center gap-2 rounded-full border px-3.5 py-2 text-xs font-bold transition-all duration-200 hover:-translate-y-0.5 ${
                  active
                    ? "border-transparent shadow-md"
                    : "bg-bg text-text-muted border-border/10 hover:text-text-strong hover:border-accent-strong/40"
                }`}
                style={
                  active
                    ? { backgroundColor: "var(--accent-strong, #2F7C51)", color: "#FFFFFF" }
                    : undefined
                }
              >
                <span className="text-sm leading-none">{p.emoji}</span>
                <span>{p.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Parameter Control Panel */}
      <div className="bg-bg-surface border border-border/10 rounded-2xl p-6 shadow-sm grid grid-cols-1 md:grid-cols-4 gap-6 items-end relative overflow-hidden">
        <div>
          <label className="block text-xs font-bold text-text-muted uppercase tracking-wider mb-2" htmlFor="cohort-select">
            Cohort Segment
          </label>
          <select
            id="cohort-select"
            value={selectedCohort}
            onChange={(e) => setSelectedCohort(e.target.value)}
            className="w-full bg-bg border border-border/10 rounded-xl px-4 py-3 text-sm text-text-strong focus:outline-none focus:border-accent-strong focus:ring-1 focus:ring-accent-strong/20 transition-all cursor-pointer"
          >
            {statusCounts.map((sc) => (
              <option key={sc.status} value={sc.status}>
                {sc.status.toUpperCase()} ({sc._count} patients)
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-xs font-bold text-text-muted uppercase tracking-wider mb-2" htmlFor="regimen-select">
            Dosing Regimen
          </label>
          <select
            id="regimen-select"
            value={regimen}
            onChange={(e) => setRegimen(e.target.value)}
            className="w-full bg-bg border border-border/10 rounded-xl px-4 py-3 text-sm text-text-strong focus:outline-none focus:border-accent-strong focus:ring-1 focus:ring-accent-strong/20 transition-all cursor-pointer"
          >
            <option value="balanced">1:1 Balanced Ratio</option>
            <option value="cbd">CBD Dominant (20:1)</option>
            <option value="thc">THC Dominant (1:20)</option>
            <option value="micro">Microdosing Protocol</option>
          </select>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-bold text-text-muted uppercase tracking-wider mb-2" htmlFor="confidence-select">
              Confidence Interval
            </label>
            <select
              id="confidence-select"
              value={confidence}
              onChange={(e) => setConfidence(e.target.value)}
              className="w-full bg-bg border border-border/10 rounded-xl px-3 py-3 text-sm text-text-strong focus:outline-none focus:border-accent-strong transition-all cursor-pointer"
            >
              <option value="90">90% CI</option>
              <option value="95">95% CI</option>
              <option value="99">99% CI</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-bold text-text-muted uppercase tracking-wider mb-2" htmlFor="iterations-select">
              Runs (N)
            </label>
            <select
              id="iterations-select"
              value={iterations}
              onChange={(e) => setIterations(e.target.value)}
              className="w-full bg-bg border border-border/10 rounded-xl px-3 py-3 text-sm text-text-strong focus:outline-none focus:border-accent-strong transition-all cursor-pointer"
            >
              <option value="1000">1,000</option>
              <option value="5000">5,000</option>
              <option value="10000">10,000</option>
            </select>
          </div>
        </div>

        <button
          onClick={runSimulation}
          disabled={simStep > 0 && simStep < 5}
          className="w-full py-3 bg-accent-strong text-bg rounded-xl font-bold text-sm shadow-md hover:shadow-lg hover:bg-accent-strong/90 hover:-translate-y-0.5 disabled:opacity-50 disabled:hover:translate-y-0 disabled:shadow-none transition-all flex items-center justify-center space-x-2"
        >
          <span>🧬</span>
          <span>Run Monte Carlo</span>
        </button>
      </div>

      {/* Simulator Processing Steps */}
      {simStep > 0 && simStep < 5 && (
        <div className="bg-bg-surface border border-border/10 rounded-2xl p-10 flex flex-col items-center justify-center relative overflow-hidden shadow-sm min-h-[350px]">
          <div className="absolute inset-0 bg-gradient-to-r from-accent-strong/5 to-transparent animate-pulse" />

          <div className="relative w-16 h-16 mb-8 flex items-center justify-center">
            <div className="absolute inset-0 border-4 border-accent-strong/20 rounded-full" />
            <div className="absolute inset-0 border-4 border-t-accent-strong rounded-full animate-spin" />
            <span className="text-xl animate-pulse">🧬</span>
          </div>

          <div className="space-y-4 max-w-sm w-full">
            <div className="flex items-center space-x-3 text-sm">
              <span className={`w-4 h-4 rounded-full flex items-center justify-center text-[10px] font-bold ${simStep >= 1 ? "bg-accent-strong text-bg" : "bg-bg-highlight/10 text-text-muted"}`}>{simStep > 1 ? "✓" : "1"}</span>
              <span className={simStep === 1 ? "text-text-strong font-semibold" : "text-text-muted"}>Extracting demographic vectors...</span>
            </div>
            <div className="flex items-center space-x-3 text-sm">
              <span className={`w-4 h-4 rounded-full flex items-center justify-center text-[10px] font-bold ${simStep >= 2 ? "bg-accent-strong text-bg" : "bg-bg-highlight/10 text-text-muted"}`}>{simStep > 2 ? "✓" : "2"}</span>
              <span className={simStep === 2 ? "text-text-strong font-semibold" : "text-text-muted"}>Injecting historical dosing profiles...</span>
            </div>
            <div className="flex items-center space-x-3 text-sm">
              <span className={`w-4 h-4 rounded-full flex items-center justify-center text-[10px] font-bold ${simStep >= 3 ? "bg-accent-strong text-bg" : "bg-bg-highlight/10 text-text-muted"}`}>{simStep > 3 ? "✓" : "3"}</span>
              <span className={simStep === 3 ? "text-text-strong font-semibold" : "text-text-muted"}>Running {Number(iterations).toLocaleString()} Monte Carlo iterations...</span>
            </div>
            <div className="flex items-center space-x-3 text-sm">
              <span className={`w-4 h-4 rounded-full flex items-center justify-center text-[10px] font-bold ${simStep >= 4 ? "bg-accent-strong text-bg" : "bg-bg-highlight/10 text-text-muted"}`}>{simStep > 4 ? "✓" : "4"}</span>
              <span className={simStep === 4 ? "text-text-strong font-semibold" : "text-text-muted"}>Compiling outcome probabilities...</span>
            </div>
          </div>
        </div>
      )}

      {/* Simulation Results Display */}
      {simStep === 5 && simResults && profile && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 animate-in fade-in slide-in-from-bottom-4 duration-500">

          {/* Key Metrics Cards */}
          <div className="lg:col-span-1 space-y-6">
            <div className="bg-bg-surface border border-border/10 rounded-2xl p-6 shadow-sm relative overflow-hidden group">
              <div className="absolute top-0 right-0 w-24 h-24 bg-accent-strong/5 rounded-bl-full pointer-events-none" />
              <h4 className="text-xs font-bold text-text-muted uppercase tracking-wider">Efficacy Probability</h4>
              <div className="flex items-baseline space-x-2 mt-3">
                <span className="text-5xl font-black text-accent-strong">{profile.efficacy}%</span>
                <span className="text-xs text-text-muted">expected efficacy</span>
              </div>
              <p className="text-xs text-text-muted mt-3 leading-relaxed">Probability of outcome score reduction &gt; 35% within 14 days.</p>
            </div>

            <div className="bg-bg-surface border border-border/10 rounded-2xl p-6 shadow-sm relative overflow-hidden">
              <h4 className="text-xs font-bold text-text-muted uppercase tracking-wider">Adverse Event Probability</h4>
              <div className="flex items-baseline space-x-2 mt-3">
                <span className="text-5xl font-black text-error">{profile.adverseRate}%</span>
                <span className="text-xs text-text-muted">risk rate</span>
              </div>
              <p className="text-xs text-text-muted mt-3 leading-relaxed">Expected incidence of mild-to-moderate side effects (dizziness, dry mouth).</p>
            </div>

            <div className="bg-bg-surface border border-border/10 rounded-2xl p-6 shadow-sm relative overflow-hidden">
              <h4 className="text-xs font-bold text-text-muted uppercase tracking-wider">Optimal Daily Dosage</h4>
              <div className="flex items-baseline space-x-2 mt-3">
                <span className="text-5xl font-black text-text-strong">{profile.optDose}</span>
                <span className="text-xs text-text-muted">target volume</span>
              </div>
              <p className="text-xs text-text-muted mt-3 leading-relaxed">Calculated centroid dosage profile based on synthetic cohort clusters.</p>
            </div>
          </div>

          {/* SVG Distribution Plot */}
          <div className="lg:col-span-2 bg-bg-surface border border-border/10 rounded-2xl p-6 shadow-sm flex flex-col justify-between">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="text-lg font-bold text-text-strong">Outcome Probability Distribution</h3>
                <p className="text-xs text-text-muted mt-1">Monte Carlo density for {profile.presetLabel} · {profile.regimenLabel}. Hover to reveal the {profile.confidence}% confidence band.</p>
              </div>
            </div>

            {/* Interactive Graph */}
            <div className="my-6 relative bg-bg rounded-xl border border-border/5 p-4 h-[210px]">
              <div
                ref={chartRef}
                className="relative w-full h-full"
                onMouseMove={handlePointerMove}
                onMouseLeave={() => setHoverX(null)}
              >
                <svg viewBox="0 0 400 150" preserveAspectRatio="none" className="w-full h-full overflow-visible pointer-events-none">
                  <defs>
                    <linearGradient id="curveGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={ACCENT} stopOpacity="0.34" />
                      <stop offset="100%" stopColor={ACCENT} stopOpacity="0.0" />
                    </linearGradient>
                    <linearGradient id="strokeGrad" x1="0" y1="0" x2="1" y2="0">
                      <stop offset="0%" stopColor={ACCENT} stopOpacity="0.35" />
                      <stop offset="50%" stopColor={ACCENT} stopOpacity="1" />
                      <stop offset="100%" stopColor={ACCENT} stopOpacity="0.35" />
                    </linearGradient>
                    <linearGradient id="bandGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={ACCENT} stopOpacity="0.42" />
                      <stop offset="100%" stopColor={ACCENT} stopOpacity="0.06" />
                    </linearGradient>
                  </defs>

                  {/* Grid Lines (canopy, faint — reads on cream or dark) */}
                  <line x1="0" y1="140" x2="400" y2="140" stroke={ACCENT} strokeOpacity="0.16" strokeWidth="1" vectorEffect="non-scaling-stroke" />
                  <line x1="0" y1="100" x2="400" y2="100" stroke={ACCENT} strokeOpacity="0.06" strokeWidth="1" vectorEffect="non-scaling-stroke" />
                  <line x1="0" y1="60" x2="400" y2="60" stroke={ACCENT} strokeOpacity="0.06" strokeWidth="1" vectorEffect="non-scaling-stroke" />
                  <line x1="0" y1="20" x2="400" y2="20" stroke={ACCENT} strokeOpacity="0.06" strokeWidth="1" vectorEffect="non-scaling-stroke" />

                  {/* Confidence band — hidden until hover, then shaded in */}
                  <g style={{ opacity: hoverX !== null ? 1 : 0, transition: "opacity 220ms ease" }}>
                    <path d={simResults.bandPath} fill="url(#bandGrad)" />
                    <line x1={profile.lower} y1="14" x2={profile.lower} y2="140" stroke={ACCENT} strokeOpacity="0.5" strokeWidth="1" strokeDasharray="2 3" vectorEffect="non-scaling-stroke" />
                    <line x1={profile.upper} y1="14" x2={profile.upper} y2="140" stroke={ACCENT} strokeOpacity="0.5" strokeWidth="1" strokeDasharray="2 3" vectorEffect="non-scaling-stroke" />
                  </g>

                  {/* Distribution fill + stroke */}
                  <path d={simResults.areaPath} fill="url(#curveGrad)" />
                  <path d={simResults.linePath} fill="none" stroke="url(#strokeGrad)" strokeWidth="2.5" vectorEffect="non-scaling-stroke" />

                  {/* Peak marker (at the distribution mean) */}
                  <circle cx={profile.mean} cy={profile.peakY} r="4" fill={ACCENT} stroke={SURFACE} strokeWidth="1.5" vectorEffect="non-scaling-stroke" className="animate-ping [animation-duration:3s]" />
                  <circle cx={profile.mean} cy={profile.peakY} r="2.5" fill={ACCENT} vectorEffect="non-scaling-stroke" />

                  {/* Hover tracker */}
                  {hover && (
                    <g>
                      <line x1={hover.x} y1={hover.y} x2={hover.x} y2="140" stroke={ACCENT} strokeOpacity="0.55" strokeWidth="1" strokeDasharray="3 3" vectorEffect="non-scaling-stroke" />
                      <circle cx={hover.x} cy={hover.y} r="4" fill={ACCENT} stroke={SURFACE} strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
                    </g>
                  )}
                </svg>

                {/* Hover readout tooltip */}
                {hover && (
                  <div
                    className="pointer-events-none absolute z-20 -translate-x-1/2 transition-[left] duration-75"
                    style={{ left: `${tooltipLeft}%`, top: 2 }}
                  >
                    <div className="rounded-lg bg-bg-surface border border-border/10 shadow-lg px-3 py-2 text-center min-w-[116px]">
                      <div className="text-lg font-black text-accent-strong leading-none">{hover.density}%</div>
                      <div className="text-[9px] uppercase tracking-wider text-text-muted mt-1 font-bold">cohort density</div>
                      <div className={`mt-1 text-[9px] font-bold ${hover.inCI ? "text-accent-strong" : "text-text-muted"}`}>
                        {hover.inCI ? `inside ${profile.confidence}% CI` : "distribution tail"}
                      </div>
                    </div>
                  </div>
                )}

                {/* Overlay labels */}
                <div className="absolute bottom-1 left-1 text-[10px] text-text-muted font-mono font-bold">Low Efficacy</div>
                <div className="absolute bottom-1 right-1 text-[10px] text-text-muted font-mono font-bold">High Efficacy</div>
                <div className="absolute top-1 right-1 px-2.5 py-1 bg-bg-highlight/10 border border-border/10 rounded text-[10px] font-bold text-accent-strong font-mono uppercase tracking-wider shadow-sm">
                  Confidence: {profile.confidence}%
                </div>
              </div>
            </div>

            {/* Recommendation Box */}
            <div className="bg-bg border border-border/10 rounded-xl p-4 text-sm leading-relaxed text-text-strong relative">
              <span className="text-xs font-bold text-accent-strong uppercase tracking-wider block mb-1">Clinical Insight</span>
              {profile.summary}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
