import type { ClinicalRagService } from "../clinical-rag-service/rag-service";
import type { ConsentPolicyGateway } from "../consent-policy-gateway/gateway";
import { InMemoryAuditLedger } from "../shared/audit";
import type { AuditLedger } from "../shared/audit";
import { InvalidRequestError } from "../shared/errors";
import type { Subject } from "../shared/types";
import { AgentRegistry } from "./agent-registry";
import { HumanApprovalQueue } from "./approval-queue";
import { ToolRegistry } from "./tool-registry";
import type {
  AgentDraftOutput,
  AgentExecutionRequest,
  AgentExecutionResult,
  AgentImplementation,
  AgentOutput,
  AgentRegistration,
  ApprovalRequest,
  BoundTool,
} from "./types";

export interface AgentOrchestratorConfig {
  gateway: ConsentPolicyGateway;
  rag: ClinicalRagService;
  agents: AgentRegistry;
  tools: ToolRegistry;
  /** Concrete implementations keyed by agent id. */
  implementations: Map<string, AgentImplementation>;
  approvals?: HumanApprovalQueue;
  audit?: AuditLedger;
}

/**
 * Agent Orchestrator. Routes a task through the policy gateway, fetches
 * grounded context via the RAG service, invokes the agent
 * implementation, and either writes back or routes the output to the
 * human approval queue based on autonomy tier and configuration.
 *
 * Lifecycle (matches EMR-768 spec):
 *   1. Identity resolution (agent + caller from registry)
 *   2. Consent + policy check (Module 5)
 *   3. Context assembly (Module 7)
 *   4. Agent execution
 *   5. Tool-call enforcement (allowed-list, tier minimum)
 *   6. Output schema validation (citations required)
 *   7. Human approval OR automated execution
 *   8. Audit
 */
export class AgentOrchestrator {
  private readonly gateway: ConsentPolicyGateway;
  private readonly rag: ClinicalRagService;
  private readonly agents: AgentRegistry;
  private readonly tools: ToolRegistry;
  private readonly impls: Map<string, AgentImplementation>;
  readonly approvals: HumanApprovalQueue;
  readonly audit: AuditLedger;

  constructor(config: AgentOrchestratorConfig) {
    this.gateway = config.gateway;
    this.rag = config.rag;
    this.agents = config.agents;
    this.tools = config.tools;
    this.impls = config.implementations;
    this.approvals = config.approvals ?? new HumanApprovalQueue();
    this.audit = config.audit ?? new InMemoryAuditLedger();
  }

  async execute(request: AgentExecutionRequest): Promise<AgentExecutionResult> {
    if (!request.patientId) throw new InvalidRequestError("patientId required");
    if (!request.purposeOfUse) throw new InvalidRequestError("purposeOfUse required");

    const registration = this.agents.get(request.agentId);
    if (!registration) {
      const event = this.audit.write({
        action: "orchestrator.unknown_agent",
        outcome: "deny",
        subject: request.caller,
        patientId: request.patientId,
        purposeOfUse: request.purposeOfUse,
        reason: `Agent ${request.agentId} is not registered`,
      });
      return {
        ok: false,
        executionAuditId: event.id,
        blockedReason: `Agent ${request.agentId} is not registered`,
      };
    }

    const impl = this.impls.get(request.agentId);
    if (!impl) {
      const event = this.audit.write({
        action: "orchestrator.no_implementation",
        outcome: "deny",
        subject: request.caller,
        patientId: request.patientId,
        purposeOfUse: request.purposeOfUse,
        reason: `Agent ${request.agentId} has no implementation`,
      });
      return {
        ok: false,
        executionAuditId: event.id,
        blockedReason: `Agent ${request.agentId} has no implementation`,
      };
    }

    // The agent — not the caller — is the subject for retrieval. Agent
    // identity is what the policy gateway evaluates, with the human
    // caller carried in the audit `detail` for forensics.
    const agentSubject: Subject = {
      kind: "agent",
      id: registration.id,
      autonomyTier: registration.autonomyTier,
    };

    const retrieval = await this.rag.retrieve({
      subject: agentSubject,
      patientId: request.patientId,
      purposeOfUse: request.purposeOfUse,
      dataClasses: request.dataClasses ?? registration.allowedDataClasses,
      query: request.task,
    });

    if (retrieval.fragments.length === 0 && Object.keys(retrieval.droppedByDataClass).length > 0) {
      const event = this.audit.write({
        action: "orchestrator.retrieval_empty",
        outcome: "deny",
        subject: agentSubject,
        patientId: request.patientId,
        purposeOfUse: request.purposeOfUse,
        reason: "Gateway denied or consent stripped all requested data",
        detail: { caller: callerDigest(request.caller), retrievalAudit: retrieval.auditId },
      });
      return {
        ok: false,
        executionAuditId: event.id,
        retrievalAuditId: retrieval.auditId,
        blockedReason: "No data available after consent + policy filtering",
        context: retrieval,
      };
    }

    const tools = this.bindTools(registration, request, retrieval.auditId);
    let draft: AgentDraftOutput;
    try {
      draft = await impl.produce({ request, context: retrieval, tools });
    } catch (err) {
      const event = this.audit.write({
        action: "orchestrator.execution_failed",
        outcome: "deny",
        subject: agentSubject,
        patientId: request.patientId,
        purposeOfUse: request.purposeOfUse,
        reason: err instanceof Error ? err.message : String(err),
        detail: { retrievalAudit: retrieval.auditId },
      });
      return {
        ok: false,
        executionAuditId: event.id,
        retrievalAuditId: retrieval.auditId,
        blockedReason: err instanceof Error ? err.message : "Agent execution threw",
        context: retrieval,
      };
    }

    // Citations are mandatory.
    if (!draft.evidence || draft.evidence.length === 0) {
      const event = this.audit.write({
        action: "orchestrator.no_evidence",
        outcome: "deny",
        subject: agentSubject,
        patientId: request.patientId,
        purposeOfUse: request.purposeOfUse,
        reason: "Agent output rejected: no citations",
        detail: { retrievalAudit: retrieval.auditId },
      });
      return {
        ok: false,
        executionAuditId: event.id,
        retrievalAuditId: retrieval.auditId,
        blockedReason: "Agent output rejected: no citations",
        context: retrieval,
      };
    }

    // Write-back proposals require tier 3+. Tier 2 (read-only) agents
    // that try to propose a write-back are blocked + audited.
    const proposedWriteBack = draft.proposed_write_back_target ?? null;
    if (proposedWriteBack && registration.autonomyTier < 3) {
      const event = this.audit.write({
        action: "orchestrator.write_back_blocked",
        outcome: "deny",
        subject: agentSubject,
        patientId: request.patientId,
        purposeOfUse: request.purposeOfUse,
        reason: `Tier ${registration.autonomyTier} agent attempted write-back to ${proposedWriteBack}`,
        detail: { retrievalAudit: retrieval.auditId },
      });
      return {
        ok: false,
        executionAuditId: event.id,
        retrievalAuditId: retrieval.auditId,
        blockedReason: `Tier ${registration.autonomyTier} agent cannot write back`,
        context: retrieval,
      };
    }

    const executionEvent = this.audit.write({
      action: "orchestrator.execute",
      outcome: "allow",
      subject: agentSubject,
      patientId: request.patientId,
      purposeOfUse: request.purposeOfUse,
      reason: request.task,
      detail: {
        retrievalAudit: retrieval.auditId,
        caller: callerDigest(request.caller),
        fragmentsConsidered: retrieval.fragments.length,
      },
    });

    const output: AgentOutput = {
      agent: registration.id,
      patient_id: request.patientId,
      purpose_of_use: request.purposeOfUse,
      risk_level: draft.risk_level,
      summary: draft.summary,
      evidence: draft.evidence,
      recommendation: draft.recommendation,
      requires_human_review: registration.autonomyTier <= 3,
      write_back_target: proposedWriteBack,
      audit_id: executionEvent.id,
    };

    // MVP: tier 3 outputs always route to the human approval queue.
    let approvalId: string | undefined;
    if (output.requires_human_review) {
      const approval = this.approvals.enqueue(registration.id, request.patientId, output);
      approvalId = approval.id;
    }

    return {
      ok: true,
      output,
      executionAuditId: executionEvent.id,
      retrievalAuditId: retrieval.auditId,
      approvalId,
      context: retrieval,
    };
  }

  /**
   * Confirm a queued approval. Writes an AuditEvent and returns the
   * approval record. Production wires this to the actual chart writer.
   */
  approve(approvalId: string, reviewerId: string): ApprovalRequest {
    const approval = this.approvals.approve(approvalId, reviewerId);
    this.audit.write({
      action: "orchestrator.approval_granted",
      outcome: "allow",
      subject: { kind: "user", id: reviewerId, role: "clinician" },
      patientId: approval.patientId,
      reason: `Approval ${approval.id} for ${approval.agentId}`,
      detail: { writeBackTarget: approval.output.write_back_target },
    });
    return approval;
  }

  reject(approvalId: string, reviewerId: string, reason?: string): ApprovalRequest {
    const approval = this.approvals.reject(approvalId, reviewerId, reason);
    this.audit.write({
      action: "orchestrator.approval_rejected",
      outcome: "deny",
      subject: { kind: "user", id: reviewerId, role: "clinician" },
      patientId: approval.patientId,
      reason: reason ?? `Approval ${approval.id} rejected`,
    });
    return approval;
  }

  private bindTools(
    registration: AgentRegistration,
    request: AgentExecutionRequest,
    parentAuditId: string,
  ): BoundTool[] {
    const out: BoundTool[] = [];
    for (const toolId of registration.allowedTools) {
      const tool = this.tools.get(toolId);
      if (!tool) continue; // tool was removed but registration not updated
      if (registration.autonomyTier < tool.minTier) continue;
      // Write tools require tier 3+ regardless of the tool's declared min.
      if (tool.sideEffect === "write" && registration.autonomyTier < 3) continue;
      out.push({
        id: tool.id,
        invoke: async (input) => {
          const event = this.audit.write({
            action: `orchestrator.tool.${tool.id}`,
            outcome: "info",
            subject: { kind: "agent", id: registration.id, autonomyTier: registration.autonomyTier },
            patientId: request.patientId,
            purposeOfUse: request.purposeOfUse,
            detail: { parentAuditId },
          });
          return tool.invoke(input, {
            agentId: registration.id,
            patientId: request.patientId,
            purposeOfUse: request.purposeOfUse,
            parentAuditId: event.id,
          });
        },
      });
    }
    return out;
  }
}

function callerDigest(subject: Subject): Record<string, unknown> {
  if (subject.kind === "user") {
    return { kind: "user", id: subject.id, role: subject.role };
  }
  return { kind: "agent", id: subject.id, autonomyTier: subject.autonomyTier };
}
