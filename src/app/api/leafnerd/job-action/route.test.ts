import { beforeEach, describe, expect, it, vi } from "vitest";

// vi.mock is hoisted; share mock state through vi.hoisted so the factories can
// reach it. Both the route's static `prisma` import and agent-workbench.ts's
// dynamic import of "@/lib/db/prisma" resolve to this same mock.
const hoisted = vi.hoisted(() => {
  const prisma = {
    membership: { findMany: vi.fn() },
    agentJob: { findFirst: vi.fn(), update: vi.fn() },
    auditLog: { create: vi.fn() },
  };
  const requireUser = vi.fn();
  return { prisma, requireUser };
});

vi.mock("@/lib/db/prisma", () => ({ prisma: hoisted.prisma }));
vi.mock("@/lib/auth/session", () => ({ requireUser: hoisted.requireUser }));

import { GET, POST } from "./route";

const { prisma, requireUser } = hoisted;

function postReq(body: unknown): Request {
  return new Request("https://example.com/api/leafnerd/job-action", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function getReq(jobId: string): Request {
  return new Request(
    `https://example.com/api/leafnerd/job-action?jobId=${encodeURIComponent(jobId)}`,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  requireUser.mockResolvedValue({
    id: "user_1",
    email: "lena@leafjourney.example",
    firstName: "Lena",
    lastName: "Reyes",
    roles: ["leafnerd"],
    organizationId: "org_1",
    organizationName: "LeafNerd Demo",
  });
  prisma.membership.findMany.mockResolvedValue([{ role: "leafnerd" }]);
  prisma.auditLog.create.mockResolvedValue({ id: "audit_1" });
});

describe("POST /api/leafnerd/job-action", () => {
  it("approves a needs_approval job and audits the dispatch", async () => {
    prisma.agentJob.findFirst.mockResolvedValue({
      id: "job_1",
      status: "needs_approval",
      runAfter: null,
      logs: [],
    });
    prisma.agentJob.update.mockResolvedValue({ status: "succeeded" });

    const res = await POST(postReq({ jobId: "job_1", action: "approve" }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toMatchObject({ applied: true, audited: true, status: "succeeded" });

    // The transition ran, and exactly one audit row was written for it.
    expect(prisma.agentJob.update).toHaveBeenCalledTimes(1);
    expect(prisma.auditLog.create).toHaveBeenCalledTimes(1);
    const audit = prisma.auditLog.create.mock.calls[0][0].data;
    expect(audit).toMatchObject({
      actorUserId: "user_1",
      action: "agent.job.approved",
      subjectType: "AgentJob",
      subjectId: "job_1",
    });
    expect(audit.metadata).toMatchObject({ action: "approve", applied: true });
  });

  it("pauses a running job by parking runAfter far in the future", async () => {
    prisma.agentJob.findFirst.mockResolvedValue({
      id: "job_2",
      status: "running",
      runAfter: new Date("2026-06-04T15:00:00.000Z"),
      logs: [],
    });
    prisma.agentJob.update.mockResolvedValue({ status: "pending" });

    const res = await POST(postReq({ jobId: "job_2", action: "pause" }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toMatchObject({ applied: true, status: "pending" });

    const data = prisma.agentJob.update.mock.calls[0][0].data;
    expect(data.status).toBe("pending");
    expect(data.runAfter.getTime()).toBeGreaterThan(Date.now() + 365 * 24 * 60 * 60 * 1000);
    // A human-action log line is appended to the streamed logs.
    expect(Array.isArray(data.logs)).toBe(true);
    expect(data.logs.at(-1).message).toMatch(/paused/i);
    expect(prisma.auditLog.create.mock.calls[0][0].data.action).toBe("agent.job.paused");
  });

  it("audits but does not transition an unknown/curated job id", async () => {
    prisma.agentJob.findFirst.mockResolvedValue(null);

    const res = await POST(postReq({ jobId: "fb-job-3", action: "cancel" }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toMatchObject({ applied: false, audited: true, note: "not-found" });

    expect(prisma.agentJob.update).not.toHaveBeenCalled();
    // Every dispatch is audited — even a no-op against a demo row.
    expect(prisma.auditLog.create).toHaveBeenCalledTimes(1);
    expect(prisma.auditLog.create.mock.calls[0][0].data.metadata).toMatchObject({
      applied: false,
      note: "not-found",
    });
  });

  it("rejects an unknown action with 400 and never touches the DB", async () => {
    const res = await POST(postReq({ jobId: "job_1", action: "explode" }));
    expect(res.status).toBe(400);
    expect(prisma.agentJob.findFirst).not.toHaveBeenCalled();
    expect(prisma.auditLog.create).not.toHaveBeenCalled();
  });

  it("requires a jobId", async () => {
    const res = await POST(postReq({ action: "approve" }));
    expect(res.status).toBe(400);
  });

  it("forbids users without the leafnerd/super_admin role", async () => {
    prisma.membership.findMany.mockResolvedValue([{ role: "physician" }]);
    const res = await POST(postReq({ jobId: "job_1", action: "approve" }));
    expect(res.status).toBe(403);
    expect(prisma.agentJob.findFirst).not.toHaveBeenCalled();
  });

  it("returns 401 when there is no signed-in user", async () => {
    requireUser.mockRejectedValue(new Error("UNAUTHORIZED"));
    const res = await POST(postReq({ jobId: "job_1", action: "approve" }));
    expect(res.status).toBe(401);
  });
});

describe("GET /api/leafnerd/job-action", () => {
  it("streams the latest status + logs for a job", async () => {
    prisma.agentJob.findFirst.mockResolvedValue({
      status: "running",
      logs: [{ at: "2026-06-04T15:02:31.000Z", level: "info", message: "Auto-mapped 188/312" }],
    });

    const res = await GET(getReq("job_1"));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.status).toBe("running");
    expect(json.logs).toHaveLength(1);
    expect(json.logs[0].message).toBe("Auto-mapped 188/312");
  });

  it("requires a jobId", async () => {
    const res = await GET(new Request("https://example.com/api/leafnerd/job-action"));
    expect(res.status).toBe(400);
  });
});
