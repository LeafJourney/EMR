import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * WS-B Task 4 — queue hygiene.
 *
 * An approval-gated agent that runs but decides there is nothing to do (returns
 * a top-level `skipped: true` no-op — e.g. the patient-outreach M6 dedup standing
 * down because the visit-completion release already drafted the message) must NOT
 * land in the needs_approval queue. A zero-action item there is a phantom in the
 * physician's approvals inbox. The runner resolves a no-op skip as a benign
 * success instead.
 */
const hoisted = vi.hoisted(() => {
  const run = vi.fn();
  return {
    run,
    fakeAgent: {
      name: "patientOutreach",
      version: "1.0.0",
      description: "test",
      allowedActions: [] as string[],
      requiresApproval: true,
      inputSchema: { parse: (v: unknown) => v },
      outputSchema: { parse: (v: unknown) => v },
      run: (...args: unknown[]) => run(...args),
    },
    markRunning: vi.fn(),
    markSucceeded: vi.fn(),
    markNeedsApproval: vi.fn(),
    markFailed: vi.fn(),
    markCancelled: vi.fn(),
    applyDefaultDecision: vi.fn(),
    claimNextJob: vi.fn(),
  };
});

vi.mock("@/lib/agents", () => ({ agentRegistry: { patientOutreach: hoisted.fakeAgent } }));
vi.mock("@/lib/db/agent-settings", () => ({ isAgentEnabled: vi.fn().mockResolvedValue(true) }));
vi.mock("./queue", () => ({
  markRunning: hoisted.markRunning,
  markSucceeded: hoisted.markSucceeded,
  markNeedsApproval: hoisted.markNeedsApproval,
  markFailed: hoisted.markFailed,
  markCancelled: hoisted.markCancelled,
  applyDefaultDecision: hoisted.applyDefaultDecision,
  claimNextJob: hoisted.claimNextJob,
}));
vi.mock("./context", () => ({
  createAgentContext: () => ({
    ctx: { log: vi.fn() },
    drainLogs: () => [],
    reasoning: { steps: [], sources: {} },
  }),
}));

import { runJob } from "./runner";

function job(over: Record<string, unknown> = {}) {
  return {
    id: "job_1",
    organizationId: null, // null → skip the owner default-decision lookup
    workflowName: "patient-outreach",
    agentName: "patientOutreach",
    eventName: "encounter.completed",
    input: { patientId: "p1", encounterId: "e1" },
    requiresApproval: true,
    ...over,
  } as never;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("runJob — no-op skip routing", () => {
  it("resolves a top-level `skipped: true` no-op as success, not needs_approval", async () => {
    hoisted.run.mockResolvedValue({ draftMessageId: null, subject: "", tone: "warm", skipped: true });

    await runJob(job(), "test-worker");

    expect(hoisted.markSucceeded).toHaveBeenCalledWith("job_1", expect.objectContaining({ skipped: true }), []);
    expect(hoisted.markNeedsApproval).not.toHaveBeenCalled();
  });

  it("still routes a real draft (no skip) to needs_approval", async () => {
    hoisted.run.mockResolvedValue({ draftMessageId: "m_1", subject: "Hi", tone: "warm" });

    await runJob(job(), "test-worker");

    expect(hoisted.markNeedsApproval).toHaveBeenCalledWith("job_1", expect.objectContaining({ draftMessageId: "m_1" }), []);
    expect(hoisted.markSucceeded).not.toHaveBeenCalled();
  });
});
