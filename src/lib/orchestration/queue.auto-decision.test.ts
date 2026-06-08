import { describe, it, expect } from "vitest";
import { applyDefaultDecision } from "./queue";
import type { ResolvedDecision } from "@/lib/db/approval-defaults-logic";

// EMR-960: a job that would queue for human sign-off but matches an owner
// default rule must be finalized directly AND leave a per-job audit entry. We
// inject fake `agentJob.update` + `auditLog.create` so we can assert the
// status transition and the audit row without a real database.

function fakeDb() {
  const updates: Array<{ where: any; data: any }> = [];
  const audits: Array<{ data: any }> = [];
  const db = {
    agentJob: {
      update: async (args: { where: any; data: any }) => {
        updates.push(args);
        return {};
      },
    },
    auditLog: {
      create: async (args: { data: any }) => {
        audits.push(args);
        return {};
      },
    },
  };
  return { db: db as never, updates, audits };
}

const JOB = {
  id: "j1",
  organizationId: "org-A",
  agentName: "supplyReorderAgent",
  workflowName: "supply.reorder",
};

describe("applyDefaultDecision (EMR-960)", () => {
  it("auto-approves: marks succeeded, clears error, writes auto_approved audit", async () => {
    const { db, updates, audits } = fakeDb();
    const resolved: ResolvedDecision = {
      decision: "approve",
      rule: {
        scopeType: "agent",
        scopeKey: "supplyReorderAgent",
        decision: "approve",
        enabled: true,
      },
    };

    await applyDefaultDecision(JOB, resolved, { ok: true }, [], db);

    expect(updates[0].where).toEqual({ id: "j1" });
    expect(updates[0].data.status).toBe("succeeded");
    expect(updates[0].data.lastError).toBeNull();
    expect(updates[0].data.completedAt).toBeInstanceOf(Date);

    expect(audits[0].data.action).toBe("agent_job.auto_approved");
    expect(audits[0].data.subjectType).toBe("agent_job");
    expect(audits[0].data.subjectId).toBe("j1");
    expect(audits[0].data.organizationId).toBe("org-A");
    expect(audits[0].data.metadata.rule.scopeKey).toBe("supplyReorderAgent");
  });

  it("auto-rejects: marks cancelled with a reason, writes auto_rejected audit", async () => {
    const { db, updates, audits } = fakeDb();
    const resolved: ResolvedDecision = {
      decision: "reject",
      rule: {
        scopeType: "workflow",
        scopeKey: "supply.reorder",
        decision: "reject",
        enabled: true,
      },
    };

    await applyDefaultDecision(JOB, resolved, { ok: false }, [], db);

    expect(updates[0].data.status).toBe("cancelled");
    expect(updates[0].data.lastError).toMatch(/Auto-rejected by default rule \(workflow:supply\.reorder\)/);

    expect(audits[0].data.action).toBe("agent_job.auto_rejected");
    expect(audits[0].data.metadata.rule.scopeType).toBe("workflow");
  });

  it("does not throw when the audit write fails (best-effort)", async () => {
    const updates: Array<{ where: any; data: any }> = [];
    const db = {
      agentJob: {
        update: async (args: { where: any; data: any }) => {
          updates.push(args);
          return {};
        },
      },
      auditLog: {
        create: async () => {
          throw new Error("audit DB down");
        },
      },
    } as never;
    const resolved: ResolvedDecision = {
      decision: "approve",
      rule: { scopeType: "agent", scopeKey: "x", decision: "approve", enabled: true },
    };

    await expect(applyDefaultDecision(JOB, resolved, {}, [], db)).resolves.toBeUndefined();
    expect(updates[0].data.status).toBe("succeeded");
  });
});
