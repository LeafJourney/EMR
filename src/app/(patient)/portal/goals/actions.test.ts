import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * EMR-1113 (PJ-1) — treatment goal persistence (createGoal / setGoalStatus).
 *
 * Goals used to be demo seeds in client state; the form's "Save goal" never
 * left the browser. These tests pin the new server actions: org/patient
 * scoping, validation, audit rows, and the ownership check on status changes.
 */

const hoisted = vi.hoisted(() => ({
  mockPrisma: {
    patient: { findUnique: vi.fn() },
    treatmentGoal: { create: vi.fn(), findFirst: vi.fn(), update: vi.fn() },
    auditLog: { create: vi.fn() },
  },
  requireRoleMock: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/db/prisma", () => ({ prisma: hoisted.mockPrisma }));
vi.mock("@/lib/auth/session", () => ({
  requireRole: (role: string) => hoisted.requireRoleMock(role),
}));

import { createGoal, setGoalStatus } from "./actions";

const { mockPrisma, requireRoleMock } = hoisted;

beforeEach(() => {
  vi.clearAllMocks();
  requireRoleMock.mockResolvedValue({ id: "user_1" });
  mockPrisma.patient.findUnique.mockResolvedValue({
    id: "patient_1",
    organizationId: "org_1",
  });
  mockPrisma.treatmentGoal.create.mockResolvedValue({ id: "goal_1" });
  mockPrisma.treatmentGoal.findFirst.mockResolvedValue({ id: "goal_1" });
  mockPrisma.treatmentGoal.update.mockResolvedValue({ id: "goal_1" });
  mockPrisma.auditLog.create.mockResolvedValue({ id: "audit_1" });
});

describe("createGoal", () => {
  it("persists an org-scoped goal with a friendly label and writes an audit row", async () => {
    const res = await createGoal({
      metric: "pain",
      baseline: 7,
      target: 3,
      targetDate: "2099-07-01",
    });
    expect(res).toEqual({ ok: true });

    const data = mockPrisma.treatmentGoal.create.mock.calls[0][0].data;
    expect(data.organizationId).toBe("org_1");
    expect(data.patientId).toBe("patient_1");
    expect(data.metric).toBe("pain");
    expect(data.label).toBe("Less pain");
    expect(data.baselineValue).toBe(7);
    expect(data.targetValue).toBe(3);
    expect(data.targetDate).toBeInstanceOf(Date);

    const audit = mockPrisma.auditLog.create.mock.calls[0][0].data;
    expect(audit.action).toBe("patient.goal.created");
    expect(audit.subjectId).toBe("goal_1");
  });

  it("allows omitting the target date", async () => {
    const res = await createGoal({ metric: "sleep", baseline: 5, target: 8 });
    expect(res.ok).toBe(true);
    const data = mockPrisma.treatmentGoal.create.mock.calls[0][0].data;
    expect(data.targetDate).toBeNull();
  });

  it("rejects a goal where baseline equals target", async () => {
    const res = await createGoal({ metric: "pain", baseline: 5, target: 5 });
    expect(res.ok).toBe(false);
    expect(mockPrisma.treatmentGoal.create).not.toHaveBeenCalled();
  });

  it("rejects an unknown metric and out-of-range values", async () => {
    const bad1 = await createGoal({ metric: "happiness" as any, baseline: 5, target: 3 });
    const bad2 = await createGoal({ metric: "pain", baseline: 11, target: 3 });
    expect(bad1.ok).toBe(false);
    expect(bad2.ok).toBe(false);
    expect(mockPrisma.treatmentGoal.create).not.toHaveBeenCalled();
  });

  it("fails closed when the user has no patient profile", async () => {
    mockPrisma.patient.findUnique.mockResolvedValue(null);
    const res = await createGoal({ metric: "pain", baseline: 7, target: 3 });
    expect(res.ok).toBe(false);
    expect(mockPrisma.treatmentGoal.create).not.toHaveBeenCalled();
  });
});

describe("setGoalStatus", () => {
  it("marks an owned goal achieved and audits it", async () => {
    const res = await setGoalStatus({ goalId: "goal_1", status: "achieved" });
    expect(res).toEqual({ ok: true });

    const where = mockPrisma.treatmentGoal.findFirst.mock.calls[0][0].where;
    expect(where).toMatchObject({ id: "goal_1", patientId: "patient_1" });

    expect(mockPrisma.treatmentGoal.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "goal_1" },
        data: { status: "achieved" },
      })
    );
    const audit = mockPrisma.auditLog.create.mock.calls[0][0].data;
    expect(audit.action).toBe("patient.goal.achieved");
  });

  it("archives via the 'abandoned' status", async () => {
    const res = await setGoalStatus({ goalId: "goal_1", status: "abandoned" });
    expect(res.ok).toBe(true);
    expect(mockPrisma.treatmentGoal.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: "abandoned" } })
    );
    const audit = mockPrisma.auditLog.create.mock.calls[0][0].data;
    expect(audit.action).toBe("patient.goal.archived");
  });

  it("refuses to touch a goal the patient doesn't own", async () => {
    mockPrisma.treatmentGoal.findFirst.mockResolvedValue(null);
    const res = await setGoalStatus({ goalId: "someone_elses", status: "achieved" });
    expect(res.ok).toBe(false);
    expect(mockPrisma.treatmentGoal.update).not.toHaveBeenCalled();
  });

  it("rejects an unknown status", async () => {
    const res = await setGoalStatus({ goalId: "goal_1", status: "paused" as any });
    expect(res.ok).toBe(false);
    expect(mockPrisma.treatmentGoal.update).not.toHaveBeenCalled();
  });
});
