// Clinical Decision Support — EMR-166
// Real-time alerts surfaced in the clinician chart view.

export type AlertSeverity = "critical" | "warning" | "info";
export type AlertCategory =
  | "interaction"
  | "dosing"
  | "lab"
  | "screening"
  | "guideline"
  | "contraindication"
  | "allergy";

export interface CDSAlert {
  id: string;
  severity: AlertSeverity;
  category: AlertCategory;
  title: string;
  detail: string;
  /** Source of the alert (e.g., "drug-interactions.json", "cannabis-pharmacology") */
  source: string;
  /** Optional action the clinician can take */
  action?: {
    label: string;
    href?: string;
  };
  /** Whether the clinician has acknowledged/dismissed this alert */
  acknowledged: boolean;
}

// ── Alert generation from patient data ─────────────────

import { checkInteractions, type DrugInteraction, type Severity } from "./drug-interactions";
import { ADVERSE_EFFECTS, type AdverseEffect } from "./cannabis-pharmacology";
import { checkContraindications, type ContraindicationMatch, type PatientForContraindicationCheck } from "./contraindications";
// EMR-166 — reuse the tested allergy parser + drug cross-reference (handles the
// "penicillin allergy → amoxicillin Rx" family case) rather than re-deriving it.
import { decodeAllergies, crossReferenceWithMedications } from "@/lib/clinical/allergy-profile";

interface PatientCDSInput {
  patientId: string;
  medications: { name: string; genericName?: string | null; active: boolean }[];
  /** Patient.allergies (String[] — JSON-line or plain-text labels). */
  allergies?: string[];
  cannabinoids: string[];
  dateOfBirth?: Date | null;
  presentingConcerns?: string | null;
  recentLabs?: { name: string; value: number; unit: string; date: Date }[];
  dosingRegimens?: {
    route: string;
    doseAmount: number;
    doseUnit: string;
    frequencyPerDay: number;
    thcMgPerDose?: number;
    cbdMgPerDose?: number;
  }[];
  icd10Codes?: string[];
}

/**
 * Generate all CDS alerts for a patient based on their current data.
 * Returns alerts sorted by severity (critical first).
 */
export function generateCDSAlerts(input: PatientCDSInput): CDSAlert[] {
  const alerts: CDSAlert[] = [];
  let alertIndex = 0;

  // 0. Drug-allergy cross-reference — highest safety priority. Flags any
  // active medication whose name (exact) or drug family (cross-reactive)
  // matches a documented allergy. Reuses lib/clinical/allergy-profile.
  if (input.allergies && input.allergies.length > 0) {
    const allergyEntries = decodeAllergies(input.allergies);
    const activeMeds = input.medications
      .filter((m) => m.active)
      .map((m, i) => ({ id: String(i), name: m.name, genericName: m.genericName ?? null }));
    const hits = crossReferenceWithMedications(allergyEntries, activeMeds);
    const seen = new Set<string>();
    for (const hit of hits) {
      const dedupeKey = `${hit.medicationName.toLowerCase()}__${hit.allergyLabel.toLowerCase()}`;
      if (seen.has(dedupeKey)) continue;
      seen.add(dedupeKey);
      // Exact name match, or any severe/life-threatening allergy, is critical;
      // a same-family (possible cross-reactivity) match is a warning.
      const isCritical =
        hit.matchKind === "exact" ||
        hit.severity === "severe" ||
        hit.severity === "life-threatening";
      alerts.push({
        id: `cds-alg-${alertIndex++}`,
        severity: isCritical ? "critical" : "warning",
        category: "allergy",
        title: `Allergy conflict: ${hit.medicationName} vs ${hit.allergyLabel}`,
        detail:
          hit.matchKind === "exact"
            ? `${hit.medicationName} matches the patient's documented ${hit.allergyLabel} allergy (${hit.severity}). Verify before continuing — consider an alternative agent.`
            : `${hit.medicationName} is in the same drug family as the patient's documented ${hit.allergyLabel} allergy (${hit.severity}). Possible cross-reactivity — confirm prior tolerance before continuing.`,
        source: "allergy-profile",
        acknowledged: false,
      });
    }
  }

  // 1. Drug-drug interactions
  const medNames = input.medications.filter((m) => m.active).map((m) => m.name);
  if (medNames.length > 0 && input.cannabinoids.length > 0) {
    const interactions = checkInteractions(medNames, input.cannabinoids);
    for (const ix of interactions) {
      alerts.push({
        id: `cds-ix-${alertIndex++}`,
        severity: ix.severity === "red" ? "critical" : ix.severity === "yellow" ? "warning" : "info",
        category: "interaction",
        title: `${ix.drug} + ${ix.cannabinoid} interaction`,
        detail: `${ix.mechanism}. ${ix.recommendation}`,
        source: "drug-interactions",
        acknowledged: false,
      });
    }
  }

  // 2. Contraindication checks
  const contraindications = checkContraindications({
    dateOfBirth: input.dateOfBirth,
    presentingConcerns: input.presentingConcerns,
    medicationNames: medNames,
    icd10Codes: input.icd10Codes,
  });
  for (const ci of contraindications) {
    alerts.push({
      id: `cds-ci-${alertIndex++}`,
      severity: ci.contraindication.severity === "absolute" ? "critical" : "warning",
      category: "contraindication",
      title: ci.contraindication.label,
      detail: `${ci.contraindication.rationale} (matched on: ${ci.matchedOn})`,
      source: "contraindications",
      acknowledged: false,
    });
  }

  // 3. Dosing alerts (high THC doses)
  if (input.dosingRegimens) {
    for (const regimen of input.dosingRegimens) {
      const dailyThcMg = (regimen.thcMgPerDose ?? 0) * regimen.frequencyPerDay;
      const dailyCbdMg = (regimen.cbdMgPerDose ?? 0) * regimen.frequencyPerDay;

      if (dailyThcMg > 30) {
        alerts.push({
          id: `cds-dose-${alertIndex++}`,
          severity: dailyThcMg > 60 ? "critical" : "warning",
          category: "dosing",
          title: `High daily THC: ${dailyThcMg.toFixed(0)} mg/day`,
          detail: `Patient's ${regimen.route} regimen delivers ${dailyThcMg.toFixed(0)} mg THC/day. ${dailyThcMg > 60 ? "This exceeds typical therapeutic ranges. Consider dose reduction." : "Monitor for adverse effects (sedation, anxiety, cognitive impairment)."}`,
          source: "cannabis-dosing-protocols",
          acknowledged: false,
        });
      }

      // CBD hepatotoxicity risk at high doses
      if (dailyCbdMg > 300) {
        alerts.push({
          id: `cds-dose-${alertIndex++}`,
          severity: "warning",
          category: "dosing",
          title: `High daily CBD: ${dailyCbdMg.toFixed(0)} mg/day`,
          detail: `Elevated CBD doses (>300 mg/day) may increase risk of liver enzyme elevation. Monitor LFTs.`,
          source: "cannabis-pharmacology",
          acknowledged: false,
        });
      }
    }

    // Age-based dosing caution
    if (input.dateOfBirth) {
      const age = Math.floor((Date.now() - input.dateOfBirth.getTime()) / 31557600000);
      if (age >= 65) {
        const hasThc = input.dosingRegimens.some((r) => (r.thcMgPerDose ?? 0) > 0);
        if (hasThc) {
          alerts.push({
            id: `cds-age-${alertIndex++}`,
            severity: "info",
            category: "guideline",
            title: "Geriatric dosing consideration",
            detail: `Patient is ${age} years old. Start low and go slow with THC. Consider 50% lower starting doses. Monitor for falls, cognitive effects, and orthostatic hypotension.`,
            source: "cannabis-pharmacology",
            acknowledged: false,
          });
        }
      }
    }
  }

  // 4. Lab value alerts
  if (input.recentLabs) {
    for (const lab of input.recentLabs) {
      const alert = checkLabAlert(lab.name, lab.value, lab.unit);
      if (alert) {
        alerts.push({
          id: `cds-lab-${alertIndex++}`,
          ...alert,
          acknowledged: false,
        });
      }
    }
  }

  // Sort: critical > warning > info
  const severityOrder: Record<AlertSeverity, number> = { critical: 0, warning: 1, info: 2 };
  alerts.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);

  return alerts;
}

/** Check a single lab value against clinical thresholds */
function checkLabAlert(
  name: string,
  value: number,
  unit: string
): Omit<CDSAlert, "id" | "acknowledged"> | null {
  const lower = name.toLowerCase();

  if (lower.includes("alt") || lower.includes("alanine")) {
    if (value > 120) {
      return {
        severity: "critical",
        category: "lab",
        title: `ALT critically elevated: ${value} ${unit}`,
        detail: "ALT >3x ULN. Consider holding CBD if on high doses. Evaluate hepatic function. Check for valproate interaction.",
        source: "lab-values",
      };
    }
    if (value > 55) {
      return {
        severity: "warning",
        category: "lab",
        title: `ALT elevated: ${value} ${unit}`,
        detail: "ALT above normal range. Monitor at next visit. If patient is on high-dose CBD, consider dose reduction.",
        source: "lab-values",
      };
    }
  }

  if (lower.includes("ast") || lower.includes("aspartate")) {
    if (value > 120) {
      return {
        severity: "critical",
        category: "lab",
        title: `AST critically elevated: ${value} ${unit}`,
        detail: "AST >3x ULN. Evaluate hepatic function. Consider medication review.",
        source: "lab-values",
      };
    }
  }

  if (lower.includes("creatinine") || lower === "cr") {
    if (value > 2.0) {
      return {
        severity: "critical",
        category: "lab",
        title: `Creatinine elevated: ${value} ${unit}`,
        detail: "Impaired renal function. May affect cannabis metabolite clearance. Adjust dosing accordingly.",
        source: "lab-values",
      };
    }
  }

  if (lower.includes("inr")) {
    if (value > 3.5) {
      return {
        severity: "critical",
        category: "lab",
        title: `INR critically elevated: ${value}`,
        detail: "Patient may be over-anticoagulated. CBD can inhibit warfarin metabolism via CYP2C9. Consider dose adjustment.",
        source: "lab-values",
      };
    }
    if (value > 3.0) {
      return {
        severity: "warning",
        category: "lab",
        title: `INR elevated: ${value}`,
        detail: "Monitor anticoagulation closely. CBD may potentiate warfarin effect.",
        source: "lab-values",
      };
    }
  }

  return null;
}
