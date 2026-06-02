import { beforeEach, describe, expect, it, vi } from "vitest";

const hoisted = vi.hoisted(() => ({
  prisma: {
    patientAssessmentOverride: { upsert: vi.fn(), deleteMany: vi.fn() },
    auditLog: { create: vi.fn() },
  },
  requireUser: vi.fn(),
  assertChartAccess: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/db/prisma", () => ({ prisma: hoisted.prisma }));
vi.mock("@/lib/auth/session", () => ({ requireUser: () => hoisted.requireUser() }));
vi.mock("@/lib/rbac/permissions", () => ({ assertChartAccess: (...a: unknown[]) => hoisted.assertChartAccess(...a) }));

import { setAssessmentOverride, clearAssessmentOverride } from "./override-actions";

const { prisma, requireUser, assertChartAccess } = hoisted;

function form(fields: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
}

beforeEach(() => {
  vi.clearAllMocks();
  requireUser.mockResolvedValue({ id: "user_1", organizationId: "org_1" });
  assertChartAccess.mockResolvedValue({});
  prisma.patientAssessmentOverride.upsert.mockResolvedValue({ id: "ov_1" });
  prisma.patientAssessmentOverride.deleteMany.mockResolvedValue({ count: 1 });
  prisma.auditLog.create.mockResolvedValue({});
});

describe("setAssessmentOverride", () => {
  it("upserts one override per (patient, assessment) and audits it (PHI-free)", async () => {
    const res = await setAssessmentOverride(
      null,
      form({ patientId: "pat_1", assessmentSlug: "phq-9", override: "require" }),
    );

    expect(res).toEqual({ ok: true });
    expect(assertChartAccess).toHaveBeenCalledWith({ id: "user_1", organizationId: "org_1" }, "pat_1");

    const upsert = prisma.patientAssessmentOverride.upsert.mock.calls[0][0];
    expect(upsert.where).toEqual({ patientId_assessmentSlug: { patientId: "pat_1", assessmentSlug: "phq-9" } });
    expect(upsert.create).toMatchObject({
      patientId: "pat_1",
      organizationId: "org_1",
      assessmentSlug: "phq-9",
      override: "require",
      setByUserId: "user_1",
    });

    const audit = prisma.auditLog.create.mock.calls[0][0].data;
    expect(audit).toMatchObject({ action: "assessment.override.set", subjectId: "pat_1", metadata: { assessmentSlug: "phq-9", override: "require" } });
    expect(JSON.stringify(audit.metadata)).not.toMatch(/dob|1985|firstName/i);
  });

  it("rejects an unknown override value at the schema boundary", async () => {
    const res = await setAssessmentOverride(null, form({ patientId: "pat_1", assessmentSlug: "phq-9", override: "delete" }));
    expect(res.ok).toBe(false);
    expect(prisma.patientAssessmentOverride.upsert).not.toHaveBeenCalled();
  });

  it("refuses when the clinician lacks chart access — no write, no audit", async () => {
    assertChartAccess.mockRejectedValue(new Error("FORBIDDEN"));
    const res = await setAssessmentOverride(null, form({ patientId: "pat_x", assessmentSlug: "phq-9", override: "skip" }));
    expect(res).toEqual({ ok: false, error: "You don't have access to this patient's chart." });
    expect(prisma.patientAssessmentOverride.upsert).not.toHaveBeenCalled();
    expect(prisma.auditLog.create).not.toHaveBeenCalled();
  });
});

describe("clearAssessmentOverride", () => {
  it("deletes org-scoped and audits when a row was removed", async () => {
    const res = await clearAssessmentOverride("pat_1", "phq-9");
    expect(res).toEqual({ ok: true });
    expect(prisma.patientAssessmentOverride.deleteMany).toHaveBeenCalledWith({
      where: { patientId: "pat_1", assessmentSlug: "phq-9", organizationId: "org_1" },
    });
    expect(prisma.auditLog.create.mock.calls[0][0].data.action).toBe("assessment.override.cleared");
  });

  it("does not audit when nothing was cleared", async () => {
    prisma.patientAssessmentOverride.deleteMany.mockResolvedValue({ count: 0 });
    await clearAssessmentOverride("pat_1", "phq-9");
    expect(prisma.auditLog.create).not.toHaveBeenCalled();
  });
});
