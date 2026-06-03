/**
 * Leafnerd "FHIR Intelligence" — shared data contract.
 *
 * This is the single source of truth for the shape of data that flows from the
 * server analytics layer (`getLeafnerdData()`) into the client SPA surfaces.
 * It is a faithful TypeScript formalization of the prototype's `window.LN`
 * object (see docs/leafnerd-prototype/data.jsx).
 *
 * Pure types only — safe to import from both server and "use client" modules.
 */

export type Tone = "green" | "amber" | "rose";
export type Direction = "up" | "down" | "flat";
export type Severity = "high" | "med" | "low";
export type Effort = "Low" | "Medium" | "High";
export type RiskLevel = "Critical" | "High" | "Moderate" | "Low";
export type InsightKind = "risk" | "quality" | "data";
export type ConfidenceLabel = "High" | "Medium" | "Low";
export type ValidationState = "pass" | "warn" | "err";
export type SourceLabel = "EHR" | "Claims" | "Wearable" | string;

/** Executive metric card (Overview top row). `value` is a preformatted string. */
export interface Metric {
  id: string;
  label: string;
  value: string;
  unit: string;
  icon: string;
  tone: Tone;
  delta: string;
  dir: Direction;
  cmp: string;
  /** When true, the delta is "good news" regardless of direction. */
  good?: boolean;
  insight: string;
  prov: string;
  spark: number[];
}

export interface Anomaly {
  id: string;
  sev: Severity;
  title: string;
  when: string;
  detail: string;
  source: string;
  confidence: number; // 0..1
}

export interface Opportunity {
  id: string;
  title: string;
  impact: string;
  effort: Effort;
  value: number; // impact score 0..100
}

export interface FreshnessBucket {
  h: number; // hour 0..23
  v: number; // throughput % of baseline
  state: "gap" | "stale" | "ok";
}

export interface DomainCompleteness {
  name: string;
  pct: number;
}

export interface PatientRow {
  name: string;
  id: string;
  age: number;
  sex: string;
  risk: RiskLevel;
  score: number; // 0..1
  hcc: number;
  gaps: number;
  cohort: string;
  lastEnc: string; // e.g. "3d"
  source: SourceLabel;
  match: number; // identity match 0..1
}

export interface Insight {
  id: string;
  kind: InsightKind;
  finding: string;
  why: string;
  evidence: string[];
  action: string;
  actionCount: number;
  confidence: ConfidenceLabel;
  conf: number; // 0..1
  source: string;
}

export interface FhirRelated {
  t: string; // related resource type
  l: string; // related resource label
}

export interface ProvenanceStep {
  t: string; // step title
  m: string; // step detail (mono)
}

export interface FhirResource {
  id: string;
  type: string; // Patient | Observation | Condition | MedicationRequest | Encounter | ...
  label: string;
  patient: string;
  status: string;
  mapping: number; // 0..1 mapping confidence
  valid: ValidationState;
  profile: string;
  code: string;
  date: string;
  // Raw FHIR R4 JSON, rendered in the "Raw JSON" tab. Intentionally loose.
  json: Record<string, unknown>;
  related: FhirRelated[];
  provenance: ProvenanceStep[];
}

export interface NavItem {
  id: string;
  label: string;
  icon: string;
  badge?: string;
  badgeTone?: "amber" | "rose";
  /** Optional: surfaces handled in-page leave this undefined. */
  href?: string;
}

export interface NavGroup {
  group: string | null;
  items: NavItem[];
}

/** The complete payload consumed by the SPA. Mirrors `window.LN`. */
export interface LeafnerdData {
  metrics: Metric[];
  anomalies: Anomaly[];
  opportunities: Opportunity[];
  freshness: FreshnessBucket[];
  domains: DomainCompleteness[];
  patients: PatientRow[];
  insights: Insight[];
  fhirResources: FhirResource[];
  fhirCounts: Record<string, number>;
  nav: NavGroup[];
}

/** Real claim-anomaly row passed into the Claims surface (from claimScrubResult). */
export interface ClaimAnomalyRow {
  id: string;
  claimId?: string;
  code?: string;
  description: string;
  severity?: Severity;
  amount?: number;
  scrubbedAt?: string;
}

/** Cohort status tally passed into the Cohort surface (from patient.groupBy). */
export interface CohortStatusCount {
  status: string;
  count: number;
}

/** Props for the top-level SPA shell component (LeafnerdApp). */
export interface LeafnerdAppProps {
  data: LeafnerdData;
  userName?: string;
  /** Optional real data; surfaces fall back to internal demo data when absent. */
  claims?: ClaimAnomalyRow[];
  cohortStatusCounts?: CohortStatusCount[];
}
