import type {
  AutonomyTier,
  DataClass,
  PurposeOfUse,
  Subject,
} from "../shared/types";
import type { SourceCitation } from "../clinical-rag-service/types";
import type { RetrievalBundle } from "../clinical-rag-service/types";

// ---------------------------------------------------------------------------
// Agent registry
// ---------------------------------------------------------------------------

/** Identifier for a registered tool the agent may invoke. */
export type ToolId = string;

export interface AgentRegistration {
  /** Stable agent identifier — used as the Subject id at policy time. */
  id: string;
  version: string;
  /** Short description of what the agent does. */
  description: string;
  /** Tools the agent may call. Anything else is blocked + audited. */
  allowedTools: readonly ToolId[];
  /** Data classes the agent may receive in context. */
  allowedDataClasses: readonly DataClass[];
  /** Autonomy tier of the agent — bounded by Module 5 agent policy at runtime. */
  autonomyTier: AutonomyTier;
  /** When the agent's tier is < required for write-back, route here. */
  escalateTo?: "human-review" | "supervising-clinician";
  /** Optional FHIR write-back target (e.g. "CarePlan", "Note"). */
  writeBackTarget?: string;
}

// ---------------------------------------------------------------------------
// Tool registry
// ---------------------------------------------------------------------------

export interface ToolRegistration {
  id: ToolId;
  description: string;
  /** Minimum tier required to invoke this tool. */
  minTier: AutonomyTier;
  /**
   * Side-effect class: "read" tools never produce writes; "write" tools
   * write to the chart and therefore require both tier and human review.
   */
  sideEffect: "read" | "write";
  /** Tool implementation. Arbitrary input/output; agents call it through the runtime. */
  invoke: (input: unknown, ctx: ToolInvocationContext) => Promise<unknown>;
}

export interface ToolInvocationContext {
  agentId: string;
  patientId: string;
  purposeOfUse: PurposeOfUse;
  /** Audit id of the parent execution so tool calls join the same trail. */
  parentAuditId: string;
}

// ---------------------------------------------------------------------------
// Standard agent output schema (matches EMR-768 spec)
// ---------------------------------------------------------------------------

export interface AgentOutputEvidence extends SourceCitation {
  /** Codes (LOINC, ICD, SNOMED) that anchor the evidence. */
  code?: string;
  value?: string | number;
  date?: string;
}

export interface AgentOutput {
  agent: string;
  patient_id: string;
  purpose_of_use: PurposeOfUse;
  risk_level: "low" | "moderate" | "high";
  summary: string;
  evidence: readonly AgentOutputEvidence[];
  recommendation: string;
  requires_human_review: boolean;
  write_back_target: string | null;
  audit_id: string;
}

// ---------------------------------------------------------------------------
// Execution request + result
// ---------------------------------------------------------------------------

export interface AgentExecutionRequest {
  agentId: string;
  patientId: string;
  purposeOfUse: PurposeOfUse;
  /** Subject invoking the agent (a user routing the task, typically). */
  caller: Subject;
  /** Optional natural-language task / question for the agent. */
  task?: string;
  /** Optional dataClasses override; defaults to the agent's allowedDataClasses. */
  dataClasses?: readonly DataClass[];
}

export interface AgentExecutionResult {
  /** Whether the agent run produced a finished output. */
  ok: boolean;
  output?: AgentOutput;
  /** Set when the agent attempted an out-of-policy action. */
  blockedReason?: string;
  /** Gateway audit id for the retrieval phase. */
  retrievalAuditId?: string;
  /** Audit id for the agent execution itself. */
  executionAuditId: string;
  /** When non-null, the output is awaiting human approval. */
  approvalId?: string;
  /** Bundle of context the agent saw — useful for evals. */
  context?: RetrievalBundle;
}

// ---------------------------------------------------------------------------
// Approval queue
// ---------------------------------------------------------------------------

export interface ApprovalRequest {
  id: string;
  agentId: string;
  patientId: string;
  output: AgentOutput;
  createdAt: string;
  /** Reviewer id once a decision is recorded. */
  decidedBy?: string;
  decision?: "approve" | "reject";
  decidedAt?: string;
  rejectionReason?: string;
}

// ---------------------------------------------------------------------------
// Agent implementation contract
// ---------------------------------------------------------------------------

/**
 * Minimal agent contract for orchestrator-driven execution. The
 * orchestrator constructs the runtime, performs all gateway checks,
 * fetches context, and then hands the agent a curated bundle. The
 * agent is responsible for the small task at the end: turn context
 * into a summary, recommendation, and citations.
 *
 * Real implementations may call into LLMs; the contract is provider-
 * agnostic.
 */
export interface AgentImplementation {
  id: string;
  produce(input: AgentRuntimeInput): Promise<AgentDraftOutput>;
}

export interface AgentRuntimeInput {
  request: AgentExecutionRequest;
  context: RetrievalBundle;
  /** Bound tools the agent may invoke. */
  tools: BoundTool[];
}

export interface BoundTool {
  id: ToolId;
  invoke(input: unknown): Promise<unknown>;
}

export interface AgentDraftOutput {
  summary: string;
  recommendation: string;
  risk_level: AgentOutput["risk_level"];
  /** Evidence the agent claims for its conclusion. Must be present. */
  evidence: readonly AgentOutputEvidence[];
  /** When set, the orchestrator considers the output a write-back proposal. */
  proposed_write_back_target?: string;
}
