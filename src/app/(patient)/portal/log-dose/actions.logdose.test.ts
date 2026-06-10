import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * EMR-1113 (PJ-1) — post-dose persistence (logDose).
 *
 * The QuickDoseLogger's "Save" used to just transition to the celebration
 * screen; the dose, scales, and side effects were discarded. These tests pin
 * the new behavior: a DoseLog row + attributed OutcomeLog rows (mood from the
 * emoji, pain/sleep/anxiety from the scales), org/patient scoping on the
 * regimen lookup, side-effect sanitization, and the streak/badge hook.
 */

const hoisted = vi.hoisted(() => ({
  mockPrisma: {
    patient: { findUnique: vi.fn() },
    dosingRegimen: { findFirst: vi.fn() },
    doseLog: { create: vi.fn() },
    outcomeLog: { create: vi.fn() },
    auditLog: { create: vi.fn() },
    $transaction: vi.fn(),
  },
  requireRoleMock: vi.fn(),
  recordDailyCheckInMock: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/db/prisma", () => ({ prisma: hoisted.mockPrisma }));
vi.mock("@/lib/auth/session", () => ({
  requireRole: (role: string) => hoisted.requireRoleMock(role),
}));
vi.mock("@/lib/gamification/streaks", () => ({
  recordDailyCheckIn: (...args: unknown[]) => hoisted.recordDailyCheckInMock(...args),
}));

import { logDose } from "./actions";

const { mockPrisma, requireRoleMock, recordDailyCheckInMock } = hoisted;

const REGIMEN = {
  id: "reg_1",
  patientId: "patient_1",
  volumePerDose: 0.5,
  volumeUnit: "mL",
  calculatedThcMgPerDose: 5,
  calculatedCbdMgPerDose: 10,
  product: { name: "Dream Tincture", route: "sublingual" },
};

function base(over: Record<string, unknown> = {}) {
  return {
    regimenId: "reg_1",
    feeling: "good",
    scales: [
      { metric: "pain", value: 8 },
      { metric: "sleep", value: 7 },
    ],
    sideEffects: ["dry_mouth", "drowsy"],
    inhaled: null,
    ...over,
  } as any;
}

beforeEach(() => {
  vi.clearAllMocks();
  requireRoleMock.mockResolvedValue({ id: "user_1" });
  mockPrisma.patient.findUnique.mockResolvedValue({
    id: "patient_1",
    organizationId: "org_1",
  });
  mockPrisma.dosingRegimen.findFirst.mockResolvedValue(REGIMEN);
  mockPrisma.doseLog.create.mockResolvedValue({ id: "dose_1" });
  mockPrisma.outcomeLog.create.mockResolvedValue({ id: "out_1" });
  mockPrisma.auditLog.create.mockResolvedValue({ id: "audit_1" });
  mockPrisma.$transaction.mockResolvedValue([]);
  recordDailyCheckInMock.mockResolvedValue({ streak: {}, newlyEarnedBadges: [] });
});

describe("logDose", () => {
  it("persists a DoseLog with regimen dose fields, route, side effects, and attribution note", async () => {
    const res = await logDose(base());
    expect(res.ok).toBe(true);

    expect(mockPrisma.doseLog.create).toHaveBeenCalledTimes(1);
    const data = mockPrisma.doseLog.create.mock.calls[0][0].data;
    expect(data.patientId).toBe("patient_1");
    expect(data.regimenId).toBe("reg_1");
    expect(data.actualVolume).toBe(0.5);
    expect(data.volumeUnit).toBe("mL");
    expect(data.estimatedThcMg).toBe(5);
    expect(data.estimatedCbdMg).toBe(10);
    expect(data.route).toBe("sublingual");
    expect(data.sideEffects).toEqual(["dry_mouth", "drowsy"]);
    expect(data.note).toContain("[post_dose]");
    expect(data.note).toContain("product=Dream Tincture");
    expect(data.note).toContain("regimenId=reg_1");
    expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
  });

  it("writes a mood OutcomeLog with the [post_dose_feeling] attribution the efficacy dashboard parses", async () => {
    await logDose(base({ scales: [] }));
    expect(mockPrisma.outcomeLog.create).toHaveBeenCalledTimes(1);
    const data = mockPrisma.outcomeLog.create.mock.calls[0][0].data;
    expect(data.metric).toBe("mood");
    // "good" = 4 on the 1-5 emoji scale -> 7 on the 0-10 mood series
    expect(data.value).toBe(7);
    expect(data.note).toContain("[post_dose_feeling]");
    expect(data.note).toContain("regimenId=reg_1");
    expect(data.note).toContain("emoji=4");
  });

  it("writes one OutcomeLog per completed scale, severity-inverting pain/anxiety but not sleep", async () => {
    await logDose(
      base({
        scales: [
          { metric: "pain", value: 8 },
          { metric: "sleep", value: 7 },
          { metric: "anxiety", value: 10 },
        ],
      })
    );
    // 1 mood + 3 scales
    expect(mockPrisma.outcomeLog.create).toHaveBeenCalledTimes(4);
    const byMetric = Object.fromEntries(
      mockPrisma.outcomeLog.create.mock.calls
        .map((c) => c[0].data)
        .filter((d: any) => d.metric !== "mood")
        .map((d: any) => [d.metric, d])
    );
    // relief 8 -> severity 2; raw preserved in the note
    expect(byMetric.pain.value).toBe(2);
    expect(byMetric.pain.note).toContain("raw=8");
    // sleep is quality-framed on both sides — stored as-is
    expect(byMetric.sleep.value).toBe(7);
    // calm 10 -> anxiety severity 0
    expect(byMetric.anxiety.value).toBe(0);
    for (const d of Object.values<any>(byMetric)) {
      expect(d.note).toContain("regimenId=reg_1");
    }
  });

  it("drops the 'none' sentinel and unknown side-effect ids", async () => {
    await logDose(base({ sideEffects: ["none", "dry_mouth", "made_up_effect"] }));
    const data = mockPrisma.doseLog.create.mock.calls[0][0].data;
    expect(data.sideEffects).toEqual(["dry_mouth"]);
  });

  it("uses the inhalation estimate (puffs + mg) when present", async () => {
    await logDose(
      base({ inhaled: { puffs: 3, estimatedThcMg: 7.5, estimatedCbdMg: 0.3 } })
    );
    const data = mockPrisma.doseLog.create.mock.calls[0][0].data;
    expect(data.actualVolume).toBe(3);
    expect(data.volumeUnit).toBe("puffs");
    expect(data.estimatedThcMg).toBe(7.5);
    expect(data.estimatedCbdMg).toBe(0.3);
    expect(data.note).toContain("puffs=3");
  });

  it("scopes the regimen lookup to the patient and rejects a regimen they don't own", async () => {
    mockPrisma.dosingRegimen.findFirst.mockResolvedValue(null);
    const res = await logDose(base({ regimenId: "someone_elses" }));
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/not found/i);
    const where = mockPrisma.dosingRegimen.findFirst.mock.calls[0][0].where;
    expect(where.patientId).toBe("patient_1");
    expect(mockPrisma.doseLog.create).not.toHaveBeenCalled();
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
  });

  it("fails closed when the user has no patient profile", async () => {
    mockPrisma.patient.findUnique.mockResolvedValue(null);
    const res = await logDose(base());
    expect(res.ok).toBe(false);
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
  });

  it("rejects an invalid payload without touching the DB", async () => {
    const res = await logDose(base({ feeling: "ecstatic" }));
    expect(res.ok).toBe(false);
    expect(mockPrisma.dosingRegimen.findFirst).not.toHaveBeenCalled();
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
  });

  it("writes an audit row and fires the streak/badge hook", async () => {
    await logDose(base());
    const audit = mockPrisma.auditLog.create.mock.calls[0][0].data;
    expect(audit.action).toBe("patient.dose.logged");
    expect(audit.organizationId).toBe("org_1");
    expect(audit.subjectId).toBe("patient_1");
    expect(recordDailyCheckInMock).toHaveBeenCalledWith("patient_1");
  });
});
