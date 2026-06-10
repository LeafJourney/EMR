import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// EMR-1108 (FO-1) — clinic-side task worklist actions. Pattern copied from
// the sibling ops queue actions test: hoisted prisma/session/cache mocks.

const hoisted = vi.hoisted(() => {
  const now = new Date("2026-06-10T15:00:00.000Z");
  const mockUser = {
    id: "front-desk-1",
    organizationId: "org-1" as string | null,
    roles: ["front_office"] as string[],
  };
  const mockPrisma = {
    task: {
      findFirst: vi.fn(),
      update: vi.fn(),
    },
    auditLog: {
      create: vi.fn(),
    },
  };

  return {
    now,
    mockUser,
    mockPrisma,
    requireUserMock: vi.fn(async () => mockUser),
    revalidatePathMock: vi.fn((_path: string) => undefined),
  };
});

vi.mock("@/lib/db/prisma", () => ({
  prisma: hoisted.mockPrisma,
}));

vi.mock("@/lib/auth/session", () => ({
  requireUser: () => hoisted.requireUserMock(),
}));

vi.mock("next/cache", () => ({
  revalidatePath: (path: string) => hoisted.revalidatePathMock(path),
}));

import { claimTask, completeTask, reopenTask } from "./actions";

const openTask = {
  id: "task-1",
  status: "open",
  assigneeUserId: null,
};

describe("clinic task actions", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(hoisted.now);
    vi.clearAllMocks();

    hoisted.requireUserMock.mockResolvedValue(hoisted.mockUser);
    hoisted.mockPrisma.task.findFirst.mockResolvedValue({ ...openTask });
    hoisted.mockPrisma.task.update.mockResolvedValue({ id: "task-1" });
    hoisted.mockPrisma.auditLog.create.mockResolvedValue({ id: "audit-1" });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // ── Role gate ────────────────────────────────────────────────────────────

  it("allows front_office to complete a task", async () => {
    const result = await completeTask({ taskId: "task-1" });

    expect(result).toEqual({ ok: true });
    expect(hoisted.mockPrisma.task.update).toHaveBeenCalledWith({
      where: { id: "task-1" },
      data: { status: "done", completedAt: hoisted.now },
    });
    expect(hoisted.mockPrisma.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        organizationId: "org-1",
        actorUserId: "front-desk-1",
        action: "task.completed",
        subjectType: "Task",
        subjectId: "task-1",
        metadata: { from: "open", to: "done" },
      }),
    });
    expect(hoisted.revalidatePathMock).toHaveBeenCalledWith("/clinic/tasks");
  });

  it.each(["kiosk", "patient"])(
    "denies %s before touching the database",
    async (role) => {
      hoisted.requireUserMock.mockResolvedValue({
        ...hoisted.mockUser,
        roles: [role],
      });

      for (const action of [claimTask, completeTask, reopenTask]) {
        const result = await action({ taskId: "task-1" });
        expect(result).toEqual({ ok: false, error: "Forbidden." });
      }
      expect(hoisted.mockPrisma.task.findFirst).not.toHaveBeenCalled();
      expect(hoisted.mockPrisma.task.update).not.toHaveBeenCalled();
      expect(hoisted.mockPrisma.auditLog.create).not.toHaveBeenCalled();
    },
  );

  it("rejects a caller without an organization", async () => {
    hoisted.requireUserMock.mockResolvedValue({
      ...hoisted.mockUser,
      organizationId: null,
    });

    const result = await completeTask({ taskId: "task-1" });

    expect(result).toEqual({ ok: false, error: "Missing organization." });
    expect(hoisted.mockPrisma.task.update).not.toHaveBeenCalled();
  });

  // ── Org scoping ──────────────────────────────────────────────────────────

  it("only loads tasks inside the caller's organization", async () => {
    await completeTask({ taskId: "task-1" });

    expect(hoisted.mockPrisma.task.findFirst).toHaveBeenCalledWith({
      where: { id: "task-1", organizationId: "org-1" },
      select: { id: true, status: true, assigneeUserId: true },
    });
  });

  it("returns not-found (and mutates nothing) for a task outside the org", async () => {
    hoisted.mockPrisma.task.findFirst.mockResolvedValue(null);

    const result = await completeTask({ taskId: "task-other-org" });

    expect(result).toEqual({ ok: false, error: "Task not found." });
    expect(hoisted.mockPrisma.task.update).not.toHaveBeenCalled();
    expect(hoisted.mockPrisma.auditLog.create).not.toHaveBeenCalled();
  });

  // ── Claim ────────────────────────────────────────────────────────────────

  it("claims an open task: assigns the caller and moves it to in_progress", async () => {
    const result = await claimTask({ taskId: "task-1" });

    expect(result).toEqual({ ok: true });
    expect(hoisted.mockPrisma.task.update).toHaveBeenCalledWith({
      where: { id: "task-1" },
      data: { assigneeUserId: "front-desk-1", status: "in_progress" },
    });
    expect(hoisted.mockPrisma.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: "task.claimed",
        metadata: {
          from: "open",
          to: "in_progress",
          previousAssigneeUserId: null,
        },
      }),
    });
  });

  it("claim is idempotent when the caller already holds the task", async () => {
    hoisted.mockPrisma.task.findFirst.mockResolvedValue({
      id: "task-1",
      status: "in_progress",
      assigneeUserId: "front-desk-1",
    });

    const result = await claimTask({ taskId: "task-1" });

    expect(result).toEqual({ ok: true });
    expect(hoisted.mockPrisma.task.update).not.toHaveBeenCalled();
    expect(hoisted.mockPrisma.auditLog.create).not.toHaveBeenCalled();
    expect(hoisted.revalidatePathMock).toHaveBeenCalledWith("/clinic/tasks");
  });

  it("refuses to claim a closed task", async () => {
    hoisted.mockPrisma.task.findFirst.mockResolvedValue({
      id: "task-1",
      status: "done",
      assigneeUserId: null,
    });

    const result = await claimTask({ taskId: "task-1" });

    expect(result).toEqual({
      ok: false,
      error: "Task is already closed — reopen it first.",
    });
    expect(hoisted.mockPrisma.task.update).not.toHaveBeenCalled();
  });

  // ── Complete / reopen idempotency ────────────────────────────────────────

  it("complete is idempotent when the task is already done", async () => {
    hoisted.mockPrisma.task.findFirst.mockResolvedValue({
      id: "task-1",
      status: "done",
      assigneeUserId: "front-desk-1",
    });

    const result = await completeTask({ taskId: "task-1" });

    expect(result).toEqual({ ok: true });
    expect(hoisted.mockPrisma.task.update).not.toHaveBeenCalled();
    expect(hoisted.mockPrisma.auditLog.create).not.toHaveBeenCalled();
  });

  it("reopen clears the completion stamp", async () => {
    hoisted.mockPrisma.task.findFirst.mockResolvedValue({
      id: "task-1",
      status: "done",
      assigneeUserId: "front-desk-1",
    });

    const result = await reopenTask({ taskId: "task-1" });

    expect(result).toEqual({ ok: true });
    expect(hoisted.mockPrisma.task.update).toHaveBeenCalledWith({
      where: { id: "task-1" },
      data: { status: "open", completedAt: null },
    });
    expect(hoisted.mockPrisma.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: "task.reopened",
        metadata: { from: "done", to: "open" },
      }),
    });
  });

  it("reopen is idempotent when the task is already open", async () => {
    const result = await reopenTask({ taskId: "task-1" });

    expect(result).toEqual({ ok: true });
    expect(hoisted.mockPrisma.task.update).not.toHaveBeenCalled();
  });

  // ── Input validation ─────────────────────────────────────────────────────

  it("rejects a malformed payload", async () => {
    const result = await completeTask({ taskId: "" });

    expect(result).toEqual({ ok: false, error: "Invalid request." });
    expect(hoisted.mockPrisma.task.update).not.toHaveBeenCalled();
  });
});
