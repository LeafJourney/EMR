import { describe, it, expect } from "vitest";
import { approveJob, rejectJob } from "./queue";

// EMR-805: a raw jobId must never authorize approve/reject across org
// boundaries or out of the needs_approval state. We inject a fake
// `agentJob.updateMany` that emulates Prisma's filtering so we can assert the
// `where` clause is scoped correctly without a real database.

interface FakeJob {
  id: string;
  status: string;
  organizationId: string | null;
}

function fakeDb(job: FakeJob) {
  const calls: Array<Record<string, unknown>> = [];
  const db = {
    agentJob: {
      updateMany: async ({ where }: { where: any; data: any }) => {
        calls.push(where);
        const idOk = where.id === job.id;
        const statusOk = where.status === job.status;
        const orgOk = (where.OR as Array<{ organizationId: string | null }>).some(
          (c) => c.organizationId === job.organizationId,
        );
        return { count: idOk && statusOk && orgOk ? 1 : 0 };
      },
    },
  };
  return { db: db as never, calls };
}

const ORG_A = "org-A";
const ORG_B = "org-B";

describe("approveJob org/status scoping", () => {
  it("approves a needs_approval job in the caller's org", async () => {
    const { db } = fakeDb({ id: "j1", status: "needs_approval", organizationId: ORG_A });
    await expect(approveJob("j1", "u1", ORG_A, db)).resolves.toBeUndefined();
  });

  it("approves a shared null-org system job", async () => {
    const { db } = fakeDb({ id: "j1", status: "needs_approval", organizationId: null });
    await expect(approveJob("j1", "u1", ORG_A, db)).resolves.toBeUndefined();
  });

  it("denies a job owned by another org", async () => {
    const { db } = fakeDb({ id: "j1", status: "needs_approval", organizationId: ORG_B });
    await expect(approveJob("j1", "u1", ORG_A, db)).rejects.toThrow(/not found|organization/i);
  });

  it("denies a job that is not awaiting approval", async () => {
    const { db } = fakeDb({ id: "j1", status: "succeeded", organizationId: ORG_A });
    await expect(approveJob("j1", "u1", ORG_A, db)).rejects.toThrow(/approval/i);
  });

  it("denies an unknown jobId", async () => {
    const { db } = fakeDb({ id: "j1", status: "needs_approval", organizationId: ORG_A });
    await expect(approveJob("does-not-exist", "u1", ORG_A, db)).rejects.toThrow();
  });

  it("always scopes the query by id, status, and org", async () => {
    const { db, calls } = fakeDb({ id: "j1", status: "needs_approval", organizationId: ORG_A });
    await approveJob("j1", "u1", ORG_A, db);
    expect(calls[0]).toMatchObject({ id: "j1", status: "needs_approval" });
    expect(calls[0].OR).toEqual([{ organizationId: ORG_A }, { organizationId: null }]);
  });
});

describe("rejectJob org/status scoping", () => {
  it("rejects a needs_approval job in the caller's org", async () => {
    const { db } = fakeDb({ id: "j1", status: "needs_approval", organizationId: ORG_A });
    await expect(rejectJob("j1", "u1", "nope", ORG_A, db)).resolves.toBeUndefined();
  });

  it("denies a job owned by another org", async () => {
    const { db } = fakeDb({ id: "j1", status: "needs_approval", organizationId: ORG_B });
    await expect(rejectJob("j1", "u1", "nope", ORG_A, db)).rejects.toThrow();
  });
});
