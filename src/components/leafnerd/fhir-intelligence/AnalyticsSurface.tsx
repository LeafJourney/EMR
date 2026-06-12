"use client";

import { useMemo, useState } from "react";
import { Icon, Badge, AreaChart, Sparkline } from "./primitives";

/* ─────────────────────────────────────────────────────────────────────────
   AnalyticsSurface — interactive population → measure → trend workbench.

   Fully self-contained: internal types + curated data live in this file, the
   trend series is a PURE deterministic function of population index × measure
   index (no Math.random — SSR-safe and reproducible across renders). Uses only
   existing botanical theme classes; adds no CSS.
   ──────────────────────────────────────────────────────────────────────── */

type Population = {
  id: string;
  label: string;
  n: number; // patients in the cohort
};

type Measure = {
  id: string;
  label: string;
  unit: string; // suffix rendered after the value (e.g. "%", "$")
  prefix?: string; // prefix rendered before the value (e.g. "$")
  fmt: (v: number) => string; // value formatter
  /** Lower is healthier? (HbA1c, ED visits, care-gaps, cost) vs higher (adherence). */
  lowerIsBetter: boolean;
  base: number; // baseline anchor for the "All patients" cohort
  amp: number; // month-to-month wobble amplitude
  drift: number; // net trend over the window (signed; applied to the latest point)
  color: string; // chart accent
};

const MONTHS = ["Oct", "Nov", "Dec", "Jan", "Feb", "Mar", "Apr", "May", "Jun"];

const POPULATIONS: Population[] = [
  { id: "all", label: "All patients", n: 48210 },
  { id: "dm", label: "Diabetes", n: 7412 },
  { id: "chfckd", label: "CHF · CKD", n: 2186 },
  { id: "copd", label: "COPD", n: 1904 },
  { id: "rising", label: "Rising-risk", n: 3320 },
  { id: "htn", label: "Hypertension", n: 11648 },
];

const MEASURES: Measure[] = [
  {
    id: "hba1c",
    label: "Avg HbA1c",
    unit: "%",
    fmt: (v) => v.toFixed(1),
    lowerIsBetter: true,
    base: 7.4,
    amp: 0.18,
    drift: -0.6,
    color: "var(--c-canopy)",
  },
  {
    id: "ed",
    label: "ED visits / 1k",
    unit: "",
    fmt: (v) => v.toFixed(1),
    lowerIsBetter: true,
    base: 42,
    amp: 3.2,
    drift: -7,
    color: "var(--c-rose)",
  },
  {
    id: "adherence",
    label: "Med adherence %",
    unit: "%",
    fmt: (v) => Math.round(v).toString(),
    lowerIsBetter: false,
    base: 74,
    amp: 2.1,
    drift: 9,
    color: "var(--c-indigo)",
  },
  {
    id: "gaps",
    label: "Open care-gap rate",
    unit: "%",
    fmt: (v) => v.toFixed(1),
    lowerIsBetter: true,
    base: 23,
    amp: 1.6,
    drift: -6,
    color: "var(--c-amber)",
  },
  {
    id: "pmpm",
    label: "Cost PMPM ($)",
    unit: "",
    prefix: "$",
    fmt: (v) => Math.round(v).toLocaleString(),
    lowerIsBetter: true,
    base: 612,
    amp: 22,
    drift: -54,
    color: "var(--c-sage)",
  },
];

/* ── Pure deterministic series ──────────────────────────────────────────────
   series(p, m) returns one value per month. NO randomness: every term is a
   closed-form function of the population index (p), measure index (m) and the
   month index (i). The same (p, m) always yields the same curve.

   Construction:
     • level   = measure.base scaled by a per-population factor (sicker cohorts
                 sit further from target).
     • trend   = linear glide of measure.drift across the window, so the curve
                 visibly "resolves" toward (or away from) target.
     • wobble  = a deterministic sine seasoned by (p, m) for organic texture.
   The whole thing is clamped to stay believable.                              */
function popFactor(p: number, lowerIsBetter: boolean): number {
  // "All patients" (p=0) ≈ 1.0; disease cohorts sit worse. For lower-is-better
  // measures "worse" means a higher multiplier; for higher-is-better (adherence)
  // worse means a lower multiplier.
  const severity = [0, 0.16, 0.24, 0.2, 0.12, 0.1][p] ?? 0.1;
  return lowerIsBetter ? 1 + severity : 1 - severity * 0.6;
}

function series(p: number, m: number): number[] {
  const measure = MEASURES[m];
  const level = measure.base * popFactor(p, measure.lowerIsBetter);
  const lastIdx = MONTHS.length - 1;
  // population-specific phase + amplitude scaling so each cohort reads distinctly
  const phase = (p * 1.7 + m * 0.9) % (Math.PI * 2);
  const ampScale = 0.7 + ((p * 3 + m * 2) % 5) * 0.14;
  return MONTHS.map((_, i) => {
    const t = i / lastIdx; // 0 → 1 across the window
    const trend = measure.drift * popFactor(p, measure.lowerIsBetter) * t;
    const wobble =
      measure.amp * ampScale * Math.sin(i * 0.9 + phase) +
      measure.amp * 0.35 * Math.cos(i * 1.7 + p);
    const v = level + trend + wobble;
    // keep adherence/gap-style percentages in a sane band
    if (measure.unit === "%" && !measure.prefix) {
      return Math.max(2, Math.min(99, v));
    }
    return Math.max(0, v);
  });
}

/* AI-style insight copy, deterministic per (population, measure, delta). */
function buildInsight(
  pop: Population,
  measure: Measure,
  current: number,
  baseline: number,
  deltaPct: number,
): string {
  const improved = measure.lowerIsBetter ? deltaPct < 0 : deltaPct > 0;
  const dir = improved ? "improved" : "regressed";
  const mag = Math.abs(deltaPct);
  const tempo = mag >= 12 ? "sharply" : mag >= 5 ? "steadily" : "modestly";
  const cur = (measure.prefix ?? "") + measure.fmt(current) + measure.unit;
  const base = (measure.prefix ?? "") + measure.fmt(baseline) + measure.unit;
  const tail = improved
    ? "Outreach and med-titration cadence appear to be landing — hold the current play."
    : "Trend is moving the wrong way; flag for a care-management review this cycle.";
  return `${measure.label} for the ${pop.label} cohort (n=${pop.n.toLocaleString()}) ${dir} ${tempo} from ${base} to ${cur} over the trailing ${MONTHS.length} months. ${tail}`;
}

function StatCell({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ minWidth: 0 }}>
      <div
        style={{
          fontSize: 10.5,
          letterSpacing: ".06em",
          textTransform: "uppercase",
          color: "var(--muted)",
          fontWeight: 600,
        }}
      >
        {label}
      </div>
      <div
        className="tnum"
        style={{
          fontSize: 19,
          fontWeight: 600,
          letterSpacing: "-.02em",
          marginTop: 3,
        }}
      >
        {value}
      </div>
    </div>
  );
}

export function AnalyticsSurface({ toast }: { toast?: (m: string) => void }) {
  const [popId, setPopId] = useState<string>(POPULATIONS[1].id); // Diabetes
  const [measureId, setMeasureId] = useState<string>(MEASURES[0].id); // Avg HbA1c

  const popIdx = Math.max(
    0,
    POPULATIONS.findIndex((p) => p.id === popId),
  );
  const measureIdx = Math.max(
    0,
    MEASURES.findIndex((m) => m.id === measureId),
  );
  const pop = POPULATIONS[popIdx];
  const measure = MEASURES[measureIdx];

  const data = useMemo(() => series(popIdx, measureIdx), [popIdx, measureIdx]);

  const baseline = data[0];
  const current = data[data.length - 1];
  const deltaPct = baseline === 0 ? 0 : ((current - baseline) / baseline) * 100;
  const improved = measure.lowerIsBetter ? deltaPct < 0 : deltaPct > 0;
  const deltaTone = improved ? "green" : "rose";
  const deltaLabel = `${deltaPct >= 0 ? "+" : ""}${deltaPct.toFixed(0)}% vs. baseline`;

  const insight = buildInsight(pop, measure, current, baseline, deltaPct);

  const fmtVal = (v: number) =>
    (measure.prefix ?? "") + measure.fmt(v) + measure.unit;

  // related-measure sparklines for the chosen population (everything except the
  // active measure) — deterministic, derived from the same series() function.
  const related = MEASURES.map((m, i) => ({ m, i })).filter(
    (x) => x.i !== measureIdx,
  );

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <div className="eyebrow">Intelligence</div>
          <h1 className="page-title">Analytics Workbench</h1>
          <p className="page-lede">
            Select a population, choose a measure, watch the trend resolve —
            population → measure → trend → anomaly → save.
          </p>
        </div>
        <div className="page-head-actions">
          <button
            className="cmd-ctrl"
            onClick={() =>
              toast?.(
                `Saved cohort “${pop.label} · ${measure.label}” (${pop.n.toLocaleString()} patients)`,
              )
            }
          >
            <Icon name="users" size={15} />
            Save cohort
          </button>
          <button
            className="cmd-ctrl"
            onClick={() =>
              toast?.(`Exporting ${measure.label} trend for ${pop.label}…`)
            }
          >
            <Icon name="download" size={15} />
            Export
          </button>
        </div>
      </div>

      {/* ── Controls: Population chips + Measure select ─────────────────── */}
      <div className="card card-pad" style={{ marginTop: 6 }}>
        <div
          style={{
            fontSize: 10.5,
            letterSpacing: ".08em",
            textTransform: "uppercase",
            color: "var(--muted)",
            fontWeight: 600,
            marginBottom: 9,
          }}
        >
          Population
        </div>
        <div className="wrap-gap">
          {POPULATIONS.map((p) => (
            <button
              key={p.id}
              className={`chip${p.id === popId ? " on" : ""}`}
              onClick={() => setPopId(p.id)}
            >
              {p.label}
              <span
                className="tnum"
                style={{
                  fontSize: 11,
                  opacity: 0.72,
                  fontFamily: "var(--mono)",
                }}
              >
                {p.n.toLocaleString()}
              </span>
            </button>
          ))}
        </div>

        <div
          className="between"
          style={{
            marginTop: 16,
            paddingTop: 14,
            borderTop: "1px solid var(--line-soft)",
            gap: 12,
          }}
        >
          <div
            style={{
              fontSize: 10.5,
              letterSpacing: ".08em",
              textTransform: "uppercase",
              color: "var(--muted)",
              fontWeight: 600,
            }}
          >
            Measure
          </div>
          <label
            className="cmd-ctrl"
            style={{ cursor: "pointer", gap: 9 }}
            htmlFor="ln-measure"
          >
            <Icon name="activity" size={15} />
            <select
              id="ln-measure"
              value={measureId}
              onChange={(e) => setMeasureId(e.target.value)}
              style={{
                appearance: "none",
                WebkitAppearance: "none",
                border: "none",
                background: "transparent",
                color: "var(--ink)",
                fontSize: 12.5,
                fontWeight: 550,
                cursor: "pointer",
                outline: "none",
                paddingRight: 2,
              }}
            >
              {MEASURES.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label}
                </option>
              ))}
            </select>
            <Icon name="chevD" size={13} />
          </label>
        </div>
      </div>

      {/* ── Trend + stats + insight ────────────────────────────────────── */}
      <div className="grid g-3" style={{ marginTop: 16 }}>
        <div className="card span-2 card-pad">
          <div className="between" style={{ marginBottom: 10 }}>
            <div>
              <div
                style={{
                  fontSize: 14.5,
                  fontWeight: 600,
                  letterSpacing: "-.01em",
                }}
              >
                {measure.label} · {pop.label}
              </div>
              <div
                style={{ fontSize: 12, color: "var(--muted)", marginTop: 2 }}
              >
                Trailing {MONTHS.length} months · monthly resolution
              </div>
            </div>
            <Badge tone={deltaTone} dot={false}>
              {/* Arrow follows the raw sign of the change; tone follows whether
                  that change is an improvement (so a green "−10%" reads with a
                  down arrow for lower-is-better measures, not a contradictory up
                  arrow). */}
              <Icon
                name={deltaPct >= 0 ? "trendUp" : "arrowDown"}
                size={12}
              />
              {deltaLabel}
            </Badge>
          </div>

          <AreaChart
            data={data}
            labels={MONTHS}
            color={measure.color}
            w={620}
            h={196}
          />

          <div
            style={{
              display: "flex",
              gap: 9,
              alignItems: "flex-start",
              marginTop: 6,
              paddingTop: 12,
              borderTop: "1px solid var(--line-soft)",
            }}
          >
            <span
              style={{ color: "var(--indigo)", flex: "none", marginTop: 1 }}
            >
              <Icon name="spark" size={16} />
            </span>
            <div
              style={{
                fontSize: 12.5,
                color: "var(--ink-2)",
                lineHeight: 1.5,
              }}
            >
              {insight}
              <span className="m-prov" style={{ marginTop: 6 }}>
                <Icon name="layers" size={11} /> Source: Observation,
                MedicationRequest, Encounter, Claim
              </span>
            </div>
          </div>
        </div>

        {/* stats + related measures */}
        <div className="card card-pad">
          <div
            style={{
              fontSize: 14.5,
              fontWeight: 600,
              letterSpacing: "-.01em",
            }}
          >
            Snapshot
          </div>
          <div
            className="between"
            style={{ marginTop: 14, gap: 10, alignItems: "flex-start" }}
          >
            <StatCell label="Current" value={fmtVal(current)} />
            <StatCell label="Baseline" value={fmtVal(baseline)} />
            <StatCell label="Cohort n" value={pop.n.toLocaleString()} />
          </div>

          <div
            style={{
              marginTop: 16,
              paddingTop: 14,
              borderTop: "1px solid var(--line-soft)",
            }}
          >
            <div className="between" style={{ marginBottom: 8 }}>
              <div
                style={{
                  fontSize: 10.5,
                  letterSpacing: ".06em",
                  textTransform: "uppercase",
                  color: "var(--muted)",
                  fontWeight: 600,
                }}
              >
                Related measures · {pop.label}
              </div>
              <span
                style={{
                  fontSize: 10,
                  color: "var(--faint)",
                  fontFamily: "var(--mono)",
                }}
              >
                tap to switch
              </span>
            </div>
            {related.map(({ m, i }) => {
              const rs = series(popIdx, i);
              const rCur = rs[rs.length - 1];
              const rBase = rs[0];
              const rDelta =
                rBase === 0 ? 0 : ((rCur - rBase) / rBase) * 100;
              const rImproved = m.lowerIsBetter ? rDelta < 0 : rDelta > 0;
              return (
                <div
                  key={m.id}
                  className="between"
                  style={{
                    padding: "9px 0",
                    borderBottom: "1px solid var(--line-soft)",
                    cursor: "pointer",
                    gap: 10,
                  }}
                  onClick={() => setMeasureId(m.id)}
                >
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 12.5, fontWeight: 540 }}>
                      {m.label}
                    </div>
                    <div
                      className="tnum"
                      style={{
                        fontSize: 11.5,
                        color: "var(--muted)",
                        marginTop: 1,
                      }}
                    >
                      {(m.prefix ?? "") + m.fmt(rCur) + m.unit}
                      <span
                        style={{
                          marginLeft: 6,
                          color: rImproved
                            ? "var(--canopy)"
                            : "var(--rose)",
                        }}
                      >
                        {rDelta >= 0 ? "+" : ""}
                        {rDelta.toFixed(0)}%
                      </span>
                    </div>
                  </div>
                  <Sparkline
                    data={rs}
                    color={m.color}
                    w={84}
                    h={28}
                  />
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

export default AnalyticsSurface;
