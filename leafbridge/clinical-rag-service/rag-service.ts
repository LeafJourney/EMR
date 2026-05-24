import type { ConsentPolicyGateway } from "../consent-policy-gateway/gateway";
import { InvalidRequestError } from "../shared/errors";
import type { DataClass } from "../shared/types";
import type { FhirSource } from "./fhir-source";
import type { VectorSource } from "./vector-source";
import type { ContextFragment, RetrievalBundle, RetrievalRequest } from "./types";

export interface ClinicalRagServiceConfig {
  gateway: ConsentPolicyGateway;
  fhir: FhirSource;
  /** Optional document/vector source. When omitted, retrieval is structured-only. */
  vector?: VectorSource;
}

/**
 * Clinical RAG Service. Retrieves consent-aware, source-linked clinical
 * context for downstream agents. Every retrieval is policy-checked at
 * the gateway and every returned fragment carries a citation.
 *
 * MVP scope from EMR-769:
 *   • FHIR retrieval by patient + filter
 *   • Document / vector retrieval (optional)
 *   • Source citation metadata on every fragment
 *   • Time-window + specialty filters
 *   • Consent-aware retrieval (gateway enforced)
 */
export class ClinicalRagService {
  private readonly gateway: ConsentPolicyGateway;
  private readonly fhir: FhirSource;
  private readonly vector?: VectorSource;

  constructor(config: ClinicalRagServiceConfig) {
    this.gateway = config.gateway;
    this.fhir = config.fhir;
    this.vector = config.vector;
  }

  /**
   * Retrieve a bundle of consent-cleared fragments. Throws when the
   * request is malformed (missing patient_id or purpose_of_use). On a
   * gateway denial it returns an empty bundle pinned to the deny audit
   * id — callers can still record "agent ran, got nothing".
   */
  async retrieve(request: RetrievalRequest): Promise<RetrievalBundle> {
    if (!request.patientId) {
      throw new InvalidRequestError("patientId is required for retrieval", { request });
    }
    if (!request.purposeOfUse) {
      throw new InvalidRequestError("purposeOfUse is required for retrieval", { request });
    }

    const decision = this.gateway.evaluate({
      subject: request.subject,
      patientId: request.patientId,
      purposeOfUse: request.purposeOfUse,
      action: "read",
      dataClasses: request.dataClasses,
      reason: request.query ? `rag query: ${request.query}` : "rag retrieval",
    });

    if (!decision.allow) {
      return {
        auditId: decision.auditId,
        fragments: [],
        dataClassesPresent: [],
        droppedByDataClass: countByClass(request.dataClasses, request.dataClasses.length),
      };
    }

    const allowedClasses = decision.allowedDataClasses;
    const requestedClasses = request.dataClasses;
    const denied = requestedClasses.filter((c) => !allowedClasses.includes(c));

    const limit = request.limit ?? 20;
    const structured = await this.fhir.fetch({
      patientId: request.patientId,
      dataClasses: allowedClasses,
      window: request.window,
      specialty: request.specialty,
      limit,
    });

    let vectorFrags: readonly ContextFragment[] = [];
    if (this.vector && request.query) {
      vectorFrags = await this.vector.search({
        patientId: request.patientId,
        query: request.query,
        dataClasses: allowedClasses,
        window: request.window,
        specialty: request.specialty,
        limit: Math.max(2, Math.floor(limit / 2)),
      });
    }

    const merged = mergeAndCap([...structured, ...vectorFrags], limit);
    enforceCitations(merged);

    const present = new Set<DataClass>();
    for (const f of merged) present.add(f.dataClass);

    const dropped: Partial<Record<DataClass, number>> = {};
    for (const c of denied) dropped[c] = (dropped[c] ?? 0) + 1;

    return {
      auditId: decision.auditId,
      fragments: merged,
      dataClassesPresent: [...present],
      droppedByDataClass: dropped,
    };
  }
}

function mergeAndCap(frags: readonly ContextFragment[], limit: number): readonly ContextFragment[] {
  // Structured before vector (structured beats embeddings when available).
  // Stable: keep original order within each kind.
  const structured = frags.filter((f) => f.kind === "structured");
  const docs = frags.filter((f) => f.kind === "document");
  return [...structured, ...docs].slice(0, limit);
}

function enforceCitations(frags: readonly ContextFragment[]): void {
  for (const f of frags) {
    if (!f.citation || !f.citation.resourceType || !f.citation.resourceId) {
      throw new InvalidRequestError(
        `Retrieved fragment ${f.id} is missing required citation`,
        { fragment: f },
      );
    }
  }
}

function countByClass(
  classes: readonly DataClass[],
  total: number,
): Readonly<Partial<Record<DataClass, number>>> {
  // We don't know how many concrete resources existed for each class on a
  // pre-gateway deny — record the request count so the caller knows the
  // bundle is empty by policy, not by absence of data.
  void total;
  const out: Partial<Record<DataClass, number>> = {};
  for (const c of classes) out[c] = (out[c] ?? 0) + 1;
  return out;
}
