/**
 * High-risk prescribing attestation (WS-C task 3, EMR-1103 item).
 *
 * A documented clinician acknowledgment isn't owed only for DEA-controlled
 * substances (those are covered by the CURES/PDMP attestation). High-risk
 * cannabis prescribing scenarios warrant the same documented acknowledgment
 * even when the product isn't scheduled:
 *
 *   - High-dose THC — Bhaskar et al. (2021) dosing consensus places the
 *     high-dose tier at > 40 mg THC/day; we gate at >= 40 mg/day.
 *   - Older adults (>= 65) — heightened sedation, fall, and drug-interaction
 *     risk; "start low, go slow" applies with extra force.
 *   - Documented psychiatric comorbidity — THC can destabilize psychosis or
 *     mania and worsen severe anxiety.
 *
 * This module is intentionally pure and dependency-light so the prescribe form
 * (client) and `createPrescriptionAction` (server) compute the SAME gate from
 * the SAME inputs. The client gate is a convenience; the server is the
 * enforcement point.
 */

export const HIGH_DOSE_THC_MG_PER_DAY = 40;
export const ELDERLY_AGE_THRESHOLD = 65;

/**
 * Contraindication ids (from `@/lib/domain/contraindications`) that represent
 * a documented psychiatric comorbidity relevant to cannabis risk.
 */
export const PSYCHIATRIC_CONTRAINDICATION_IDS = [
  "schizophrenia",
  "bipolar_type_1",
  "severe_mental_health_history",
] as const;

export type HighRiskKind = "high_dose_thc" | "elderly" | "psychiatric_comorbidity";

export interface HighRiskReason {
  kind: HighRiskKind;
  /** Short chip-style label, e.g. "High-dose THC". */
  label: string;
  /** One-line clinician-facing explanation of why the gate fired. */
  detail: string;
}

export interface HighRiskInput {
  /**
   * Calculated THC mg/day for the regimen, or null when unknown (custom /
   * free-text products without a resolvable cannabinoid profile).
   */
  thcMgPerDay: number | null;
  /** Patient age in years, or null when DOB is unknown. */
  patientAge: number | null;
  /** Labels of matched psychiatric-comorbidity contraindications. */
  psychiatricComorbidities: string[];
}

/**
 * Assess which high-risk attestation reasons apply. Empty array = no
 * attestation required beyond the standard flow.
 */
export function assessHighRiskAttestation(input: HighRiskInput): HighRiskReason[] {
  const reasons: HighRiskReason[] = [];

  if (
    input.thcMgPerDay != null &&
    input.thcMgPerDay >= HIGH_DOSE_THC_MG_PER_DAY
  ) {
    reasons.push({
      kind: "high_dose_thc",
      label: "High-dose THC",
      detail: `~${Math.round(input.thcMgPerDay)} mg THC/day meets the ≥ ${HIGH_DOSE_THC_MG_PER_DAY} mg/day high-dose threshold.`,
    });
  }

  if (
    input.patientAge != null &&
    input.patientAge >= ELDERLY_AGE_THRESHOLD
  ) {
    reasons.push({
      kind: "elderly",
      label: "Older adult (≥ 65)",
      detail: `Patient age ${input.patientAge} — heightened sedation, fall, and drug-interaction risk.`,
    });
  }

  if (input.psychiatricComorbidities.length > 0) {
    reasons.push({
      kind: "psychiatric_comorbidity",
      label: "Psychiatric comorbidity",
      detail: `Documented: ${input.psychiatricComorbidities.join(", ")}.`,
    });
  }

  return reasons;
}

/**
 * Reduce a set of contraindication matches to the (de-duplicated) labels of
 * those representing a psychiatric comorbidity. Accepts the minimal
 * `{ id, label }` shape so both the form prop and the server's
 * `ContraindicationMatch` can feed it.
 */
export function psychiatricComorbidityLabels(
  matches: ReadonlyArray<{ id: string; label: string }>,
): string[] {
  const ids = new Set<string>(PSYCHIATRIC_CONTRAINDICATION_IDS);
  const seen = new Set<string>();
  const labels: string[] = [];
  for (const m of matches) {
    if (!ids.has(m.id) || seen.has(m.label)) continue;
    seen.add(m.label);
    labels.push(m.label);
  }
  return labels;
}

/**
 * Whole-year age from a date of birth. Returns null when DOB is missing or
 * unparseable. `now` is injectable for deterministic tests.
 */
export function ageFromDob(
  dob: Date | string | null | undefined,
  now: Date = new Date(),
): number | null {
  if (!dob) return null;
  const d = dob instanceof Date ? dob : new Date(dob);
  if (Number.isNaN(d.getTime())) return null;
  return Math.floor((now.getTime() - d.getTime()) / (365.25 * 24 * 60 * 60 * 1000));
}
