import type { DataClass, PurposeOfUse, Subject } from "../shared/types";

/**
 * Citation for a single retrieved fragment. Every fragment that leaves
 * the RAG service must carry one — that is the "no naked prompts" rule.
 */
export interface SourceCitation {
  /** FHIR resource type or other source class ("Observation", "DocumentReference", "Note"). */
  resourceType: string;
  /** Source-side stable id. */
  resourceId: string;
  /** FHIR `versionId` or document version — pins the citation to a snapshot. */
  versionId?: string;
  /** Original-system url if available. */
  sourceUrl?: string;
  /** Display name humans see in citation footnotes. */
  display?: string;
  /** ISO timestamp the source resource was authored / observed. */
  recordedAt?: string;
}

/** A piece of clinical context returned to the agent. */
export interface ContextFragment {
  /** Stable id for this fragment within the bundle. */
  id: string;
  /** "structured" = FHIR resource, "document" = chunk from a clinical note. */
  kind: "structured" | "document";
  /** Data class the fragment belongs to — used for consent / min-necessary filtering. */
  dataClass: DataClass;
  /** Human/agent-readable text payload. */
  text: string;
  /** Structured fields (for FHIR fragments). */
  fields?: Record<string, unknown>;
  /** Source citation — REQUIRED on every fragment. */
  citation: SourceCitation;
  /** Optional similarity / relevance score (0-1). */
  score?: number;
}

export interface TimeWindow {
  /** ISO timestamps. Inclusive. */
  from?: string;
  to?: string;
}

export interface RetrievalRequest {
  subject: Subject;
  patientId: string;
  purposeOfUse: PurposeOfUse;
  /** Data classes the agent wants. Filtered by policy + consent at the gateway. */
  dataClasses: readonly DataClass[];
  /** Optional free-text query — used for vector source ranking. */
  query?: string;
  /** Optional clinical time window. */
  window?: TimeWindow;
  /** Optional specialty filter (e.g. "cardiology"). */
  specialty?: string;
  /** Soft cap on returned fragments. Defaults to 20. */
  limit?: number;
}

export interface RetrievalBundle {
  /** Audit id from the gateway decision. Pinning the bundle to the audit trail. */
  auditId: string;
  /** Fragments cleared for the caller. May be empty if consent stripped everything. */
  fragments: readonly ContextFragment[];
  /** Data classes actually present in the bundle. */
  dataClassesPresent: readonly DataClass[];
  /** Fragments dropped due to consent / policy, by data class. Useful for UI hints. */
  droppedByDataClass: Readonly<Partial<Record<DataClass, number>>>;
}
