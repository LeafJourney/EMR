import type { z } from "zod";

// =========================================================================
// Agent Harness V3 — Types
// =========================================================================
// Backward-compatible extension of the V1 agent interface. V1 agents
// continue to work unchanged. V3 capabilities are opt-in.
// =========================================================================

// ---------------------------------------------------------------------------
// Actions & permissions (unchanged from V1)
// ---------------------------------------------------------------------------

/** Actions an agent may perform. Enforced by the agent context, not convention. */
export type AllowedAction =
  | "read.patient"
  | "read.encounter"
  | "read.document"
  | "read.note"
  | "read.research"
  | "read.claim"
  | "read.payment"
  | "read.statement"
  | "write.chartSummary"
  | "write.document.metadata"
  | "write.note.draft"
  | "write.message.draft"
  // EMR-1145 — held ONLY by safetyAutoResponder: sends the deterministic,
  // pre-configured 911/ED safety copy on urgent UPI routes. Agents that
  // compose free-form text stay approval-gated behind write.message.draft.
  | "write.message.send"
  | "write.task"
  | "write.coding"
  | "write.qualification"
  | "write.outcome.reminder"
  | "write.launchStatus"
  | "write.claim.scrub"
  | "write.claim.status"
  | "write.financialEvent"
  | "write.statement"
  | "write.denial.triage"
  | "write.payment.match";

// ---------------------------------------------------------------------------
// Logging
// ---------------------------------------------------------------------------

export interface AgentLogEntry {
  at: string; // ISO timestamp
  level: "info" | "warn" | "error";
  message: string;
  data?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Model client (unchanged)
// ---------------------------------------------------------------------------

/** Options accepted by both `complete` and `stream`. */
export interface ModelCallOptions {
  maxTokens?: number;
  temperature?: number;
  /** Abort the underlying HTTP request when this signal fires. */
  signal?: AbortSignal;
  /**
   * Patient/person names to scrub from the prompt before it leaves for the
   * external model. Structured PHI (SSN/phone/email/MRN/DOB) is redacted
   * automatically at the context chokepoint; names are free-text, so an agent
   * that interpolates them must pass them here. See `withPhiRedaction`.
   */
  redactNames?: string[];
}

/** Minimal LLM interface. Providers implement this; agents are provider-agnostic. */
export interface ModelClient {
  complete(prompt: string, options?: ModelCallOptions): Promise<string>;
  /**
   * Optional streaming variant. Yields content deltas as they arrive from the
   * provider. Implementations that don't natively stream may emit the full
   * response as a single chunk.
   */
  stream?(prompt: string, options?: ModelCallOptions): AsyncIterable<string>;
}

// ---------------------------------------------------------------------------
// V3: Tool interface
// ---------------------------------------------------------------------------
// The typed tool registry agents can invoke during execution. Each tool is
// a scoped function the runner injects based on the agent's allowedActions.
// Agents never touch Prisma directly — everything goes through tools.

export interface AgentTools {
  // ── Database queries ────────────────────────────────
  /** Query patient record with optional includes */
  queryPatient(patientId: string, include?: string[]): Promise<any>;
  /** Query encounters for a patient */
  queryEncounters(patientId: string, options?: { limit?: number; status?: string }): Promise<any[]>;
  /** Query outcome logs for a patient */
  queryOutcomeLogs(patientId: string, options?: { metric?: string; since?: Date; limit?: number }): Promise<any[]>;
  /** Query active medications for a patient */
  queryMedications(patientId: string): Promise<any[]>;
  /** Query dosing regimens with products */
  queryDosingRegimens(patientId: string): Promise<any[]>;

  // ── Domain knowledge ────────────────────────────────
  /** Check drug interactions for a list of medication names */
  checkInteractions(medications: string[]): Promise<any[]>;
  /** Check cannabis contraindications for a patient */
  checkContraindications(input: {
    dateOfBirth?: Date | null;
    presentingConcerns?: string | null;
    medicationNames?: string[];
    historyText?: string;
    icd10Codes?: string[];
  }): Promise<any[]>;
  /** Look up medication explanation (3rd-grade level) */
  lookupMedication(name: string): Promise<any | null>;
  /** Explain a lab value */
  explainLab(name: string, value?: number): Promise<any | null>;
  /** Search the cannabis education database */
  searchEducation(query: string): Promise<any[]>;

  // ── Memory ──────────────────────────────────────────
  /** Recall patient memories */
  recallMemories(patientId: string, options?: {
    kinds?: string[];
    tags?: string[];
    limit?: number;
  }): Promise<any[]>;
  /** Record a new patient memory */
  recordMemory(input: {
    patientId: string;
    kind: string;
    content: string;
    confidence: number;
    tags?: string[];
    source: string;
    sourceKind: "agent" | "user";
  }): Promise<any>;
  /** Recall clinical observations */
  recallObservations(patientId: string, options?: {
    categories?: string[];
    minSeverity?: string;
    onlyUnacknowledged?: boolean;
    limit?: number;
  }): Promise<any[]>;
  /** Record a clinical observation */
  recordObservation(input: {
    patientId: string;
    category: string;
    severity: string;
    summary: string;
    evidence?: Record<string, string[]>;
    actionSuggested?: string;
    observedBy: string;
    observedByKind: "agent" | "user";
  }): Promise<any>;

  // ── Agent delegation ────────────────────────────────
  /** Call another agent synchronously and get its output */
  callAgent(agentName: string, input: unknown): Promise<unknown>;

  // ── Reasoning trace ─────────────────────────────────
  /** Record a reasoning step */
  step(name: string, data?: Record<string, unknown>): void;
  /** Record which data sources informed this run */
  source(kind: string, ids: string[]): void;
}

// ---------------------------------------------------------------------------
// V3: Approval policy
// ---------------------------------------------------------------------------

export interface ApprovalPolicy {
  /** "always" = every run needs approval. "never" = auto-approve. "threshold" = confidence-based. */
  mode: "always" | "never" | "threshold";
  /** When mode is "threshold", outputs below this confidence require approval. */
  confidenceThreshold?: number;
}

// ---------------------------------------------------------------------------
// V3: Context budget
// ---------------------------------------------------------------------------

export interface ContextBudget {
  /** Max tokens for the agent's prompt (soft cap — context is pruned to fit). */
  maxPromptTokens: number;
  /** Max patient memories to include in context. */
  memorySlots: number;
  /** Max clinical observations to include. */
  observationSlots: number;
  /** Max recent encounters to include. */
  encounterSlots: number;
  /** How to prioritize when context exceeds budget. */
  prioritize: "recency" | "relevance" | "severity";
}

// ---------------------------------------------------------------------------
// V3: Multi-step execution
// ---------------------------------------------------------------------------

export interface AgentStep {
  /** Unique step ID (e.g., "gather-chart", "check-interactions") */
  id: string;
  /** Human-readable step name */
  name: string;
  /** Step IDs that must complete before this step runs */
  dependsOn?: string[];
  /** Description of what this step does */
  description?: string;
}

export interface AgentPlan {
  /** Ordered list of steps to execute */
  steps: AgentStep[];
  /** Why the agent chose this plan */
  reasoning: string;
}

export interface StepResult {
  /** The output of this step — fed forward to dependent steps */
  output: unknown;
  /** Dynamically add new steps based on what was found */
  nextSteps?: AgentStep[];
  /** Confidence in this step's output (0-1) */
  confidence: number;
}

// ---------------------------------------------------------------------------
// V3: Agent context (extends V1)
// ---------------------------------------------------------------------------

export interface AgentContext {
  /** The job row id that invoked this agent. */
  jobId: string;
  /** Organization scope, if any. */
  organizationId: string | null;
  /** Append a log line. Persisted back to AgentJob.logs. */
  log(level: AgentLogEntry["level"], message: string, data?: Record<string, unknown>): void;
  /** Emit a follow-up domain event. The workflow engine will route it. */
  emit(event: import("./events").DomainEvent): Promise<void>;
  /** Enforcement check — throws if the agent is not permitted. */
  assertCan(action: AllowedAction): void;
  /** The model client — stubbed in dev, real in prod. */
  model: ModelClient;
  /** V3: Tool registry — DB queries, domain knowledge, memory, agent delegation. */
  tools: AgentTools;
  /** V3: Results from completed steps in a multi-step run. */
  stepResults: Map<string, StepResult>;
}

// ---------------------------------------------------------------------------
// V3: Agent interface (backward-compatible)
// ---------------------------------------------------------------------------

export interface Agent<I, O> {
  name: string;
  version: string;
  description: string;
  inputSchema: z.ZodType<I>;
  outputSchema: z.ZodType<O>;
  allowedActions: AllowedAction[];

  /**
   * V1: boolean. V3: can also be an ApprovalPolicy for confidence-based routing.
   * Both forms work — the runner normalizes to ApprovalPolicy internally.
   */
  requiresApproval: boolean | ApprovalPolicy;

  /** V3 optional: Context budget declaration. Runner prunes context to fit. */
  contextBudget?: ContextBudget;

  /**
   * V3 optional: Planning phase. Called before run/runStep. Returns a plan
   * the runner will execute step-by-step. If not defined, the runner calls
   * run() directly (V1 behavior).
   */
  plan?(input: I, ctx: AgentContext): Promise<AgentPlan>;

  /**
   * V3 optional: Execute a single step. Called for each step in the plan.
   * If not defined but plan() is, the runner calls run() as a single step.
   */
  runStep?(step: AgentStep, input: I, ctx: AgentContext): Promise<StepResult>;

  /**
   * Execute the agent. V1 agents implement only this.
   * V3 agents may also implement plan() + runStep() for multi-step execution.
   */
  run(input: I, ctx: AgentContext): Promise<O>;
}

// ---------------------------------------------------------------------------
// V3: Cost tracking
// ---------------------------------------------------------------------------

export interface AgentCostEntry {
  agentName: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  latencyMs: number;
  estimatedCostUsd: number;
  timestamp: string;
}
