import type { AgentOutput, ApprovalRequest } from "./types";

/**
 * Human-review queue. Tier 3 outputs land here and cannot write back
 * until a reviewer approves. Production wires this to a Postgres
 * table; MVP is in-memory.
 */
export class HumanApprovalQueue {
  private readonly items = new Map<string, ApprovalRequest>();
  private seq = 0;

  enqueue(agentId: string, patientId: string, output: AgentOutput): ApprovalRequest {
    const id = `approval-${++this.seq}`;
    const item: ApprovalRequest = {
      id,
      agentId,
      patientId,
      output,
      createdAt: new Date().toISOString(),
    };
    this.items.set(id, item);
    return item;
  }

  get(id: string): ApprovalRequest | null {
    return this.items.get(id) ?? null;
  }

  /** Pending approvals. Stable order. */
  pending(): readonly ApprovalRequest[] {
    return [...this.items.values()].filter((i) => !i.decision);
  }

  approve(id: string, reviewerId: string): ApprovalRequest {
    return this.decide(id, reviewerId, "approve");
  }

  reject(id: string, reviewerId: string, reason?: string): ApprovalRequest {
    return this.decide(id, reviewerId, "reject", reason);
  }

  private decide(
    id: string,
    reviewerId: string,
    decision: "approve" | "reject",
    rejectionReason?: string,
  ): ApprovalRequest {
    const item = this.items.get(id);
    if (!item) throw new Error(`Unknown approval ${id}`);
    if (item.decision) throw new Error(`Approval ${id} already decided`);
    const updated: ApprovalRequest = {
      ...item,
      decision,
      decidedBy: reviewerId,
      decidedAt: new Date().toISOString(),
      rejectionReason,
    };
    this.items.set(id, updated);
    return updated;
  }
}
