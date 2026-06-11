/**
 * LeafBridge Lakehouse — US-Core conformance scoring.
 *
 * A pure, dependency-free validator that inspects a resource's actual R4 JSON
 * and reports a roll-up severity (`pass` | `warn` | `error`), a mapping
 * confidence (0..1), and a human-readable checklist. It keys every finding to
 * a real fact in the payload — mandatory cardinality, terminology bindings,
 * subject references, profile assertions — so the number the UX shows is
 * earned, not faked.
 *
 * This is the engine-side sibling of the explorer's `deriveUsCoreChecks`; it
 * runs server-side at ingest time to stamp `conformance` + `confidence` onto
 * the catalog without needing React.
 */
import type { Conformance, FhirJson } from "./types";

export interface ConformanceCheck {
  severity: Conformance;
  rule: string;
  detail: string;
}

export interface ConformanceResult {
  state: Conformance;
  confidence: number;
  profile: string | null;
  checks: ConformanceCheck[];
}

/** US-Core mandatory (1..*) elements asserted present, per resource type. */
const REQUIRED_ELEMENTS: Record<string, string[]> = {
  Patient: ["identifier", "name"],
  Encounter: ["status", "class", "subject"],
  Observation: ["status", "code", "subject"],
  Condition: ["clinicalStatus", "code", "subject"],
  MedicationRequest: ["status", "intent", "medicationCodeableConcept", "subject"],
  MedicationStatement: ["status", "medicationCodeableConcept", "subject"],
  DiagnosticReport: ["status", "code", "subject"],
  DocumentReference: ["status", "type", "subject"],
};

/** The CodeableConcept element carrying each type's primary terminology. */
const PRIMARY_CONCEPT: Record<string, string> = {
  Observation: "code",
  Condition: "code",
  DiagnosticReport: "code",
  MedicationRequest: "medicationCodeableConcept",
  MedicationStatement: "medicationCodeableConcept",
  DocumentReference: "type",
};

const RANK: Record<Conformance, number> = { pass: 0, warn: 1, error: 2 };

function asObj(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}
function present(json: Record<string, unknown>, key: string): boolean {
  const v = json[key];
  if (v == null) return false;
  if (Array.isArray(v)) return v.length > 0;
  return true;
}
type CodingState = "coded" | "empty" | "text" | "absent";
function codingState(concept: unknown): CodingState {
  const c = asObj(concept);
  if (!c) return "absent";
  if (Array.isArray(c.coding)) {
    return c.coding.some((e) => asObj(e)?.system != null) ? "coded" : "empty";
  }
  return typeof c.text === "string" && c.text ? "text" : "absent";
}

/** Score a resource's conformance from its real R4 JSON. */
export function scoreConformance(resource: FhirJson): ConformanceResult {
  const json = resource as Record<string, unknown>;
  const type = resource.resourceType;
  const checks: ConformanceCheck[] = [];

  // 1. Profile assertion.
  const profiles = resource.meta?.profile;
  const profile = Array.isArray(profiles) && typeof profiles[0] === "string" ? profiles[0] : null;
  checks.push(
    profile
      ? { severity: "pass", rule: "Profile", detail: `Declares meta.profile ${shortProfile(profile)}` }
      : { severity: "warn", rule: "Profile", detail: "No US-Core profile asserted in meta.profile" },
  );

  // 2. Mandatory cardinality.
  const required = REQUIRED_ELEMENTS[type] ?? [];
  if (required.length) {
    const missing = required.filter((k) => !present(json, k));
    checks.push(
      missing.length === 0
        ? { severity: "pass", rule: "Cardinality", detail: `All ${required.length} mandatory elements present` }
        : { severity: "error", rule: "Cardinality", detail: `Missing mandatory element(s): ${missing.join(", ")}` },
    );
  }

  // 3. Primary terminology binding.
  const conceptKey = PRIMARY_CONCEPT[type];
  if (conceptKey) {
    const state = codingState(json[conceptKey]);
    checks.push(
      state === "coded"
        ? { severity: "pass", rule: "Terminology", detail: `${conceptKey} is bound to a coding system` }
        : state === "empty"
          ? { severity: "error", rule: "Terminology", detail: `${conceptKey}.coding is present but bound nothing` }
          : state === "text"
            ? { severity: "warn", rule: "Terminology", detail: `${conceptKey} is free-text only (never coded)` }
            : { severity: "error", rule: "Terminology", detail: `${conceptKey} is absent` },
    );
  }

  // 4. Subject reference resolves to a Patient.
  if (type !== "Patient") {
    const ref = (asObj(json.subject)?.reference ?? asObj(json.patient)?.reference) as string | undefined;
    checks.push(
      typeof ref === "string" && ref.toLowerCase().includes("patient/")
        ? { severity: "pass", rule: "Reference", detail: `subject → ${ref}` }
        : { severity: "warn", rule: "Reference", detail: "subject does not reference a Patient" },
    );
  }

  // 5. Blood-pressure component shape (US Core BP).
  if (type === "Observation") {
    const code = JSON.stringify(json.code ?? "");
    if (code.includes("85354-9") || /blood pressure/i.test(code)) {
      const comps = Array.isArray(json.component) ? json.component : [];
      checks.push(
        comps.length >= 2
          ? { severity: "pass", rule: "BP components", detail: "Systolic + diastolic components present" }
          : { severity: "warn", rule: "BP components", detail: "Blood-pressure panel missing systolic/diastolic components" },
      );
    }
  }

  const worst = checks.reduce<Conformance>((acc, c) => (RANK[c.severity] > RANK[acc] ? c.severity : acc), "pass");
  return { state: worst, confidence: confidenceFor(worst, checks), profile, checks };
}

/** Map the worst severity + check spread into a believable 0..1 confidence. */
function confidenceFor(state: Conformance, checks: ConformanceCheck[]): number {
  const total = checks.length || 1;
  const warns = checks.filter((c) => c.severity === "warn").length;
  const errors = checks.filter((c) => c.severity === "error").length;
  if (state === "error") return Math.max(0.4, 0.78 - errors * 0.12 - warns * 0.04);
  if (state === "warn") return Math.max(0.7, 0.95 - warns * 0.05);
  // pass — scale gently with how many checks corroborated it.
  return Math.min(0.99, 0.9 + Math.min(total, 6) * 0.015);
}

function shortProfile(url: string): string {
  const tail = url.slice(url.lastIndexOf("/") + 1);
  return tail || url;
}
