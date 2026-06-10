import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * WS-C — server-side prescribing safety gates in createPrescriptionAction.
 *   T1: the v2 path requires a pharmacy routing target server-side.
 *   T2: custom/free-text products are interaction-screened too (red blocks).
 *   T3: controlled substances require CURES; high-risk non-controlled Rx
 *       (high-dose THC / age ≥ 65 / psychiatric comorbidity) require the
 *       clinical risk attestation — all validated server-side, not just client.
 *
 * The pure safety libs (drug-interactions, cures, dea-schedule,
 * contraindications, high-risk-attestation) are exercised for real; only
 * I/O boundaries (prisma, auth, dispatch, navigation) are mocked.
 */
const hoisted = vi.hoisted(() => {
  const mockPrisma = {
    patient: { findFirst: vi.fn() },
    cannabisProduct: { findFirst: vi.fn(), create: vi.fn() },
    patientMedication: { findMany: vi.fn() },
    chartSummary: { findUnique: vi.fn() },
    dosingRegimen: { create: vi.fn() },
    auditLog: { create: vi.fn() },
    user: { findFirst: vi.fn() },
  };
  return {
    mockPrisma,
    requireUserMock: vi.fn(),
    dispatchMock: vi.fn(),
  };
});

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => {
    // Next's redirect() throws to interrupt; emulate that so we can assert a
    // request reached the success path (all gates passed).
    throw new Error(`NEXT_REDIRECT:${url}`);
  }),
}));
vi.mock("@/lib/db/prisma", () => ({ prisma: hoisted.mockPrisma }));
vi.mock("@/lib/auth/session", () => ({ requireUser: () => hoisted.requireUserMock() }));
vi.mock("@/lib/orchestration/dispatch", () => ({
  dispatch: (...args: unknown[]) => hoisted.dispatchMock(...args),
}));
vi.mock("@/lib/observability/log", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { createPrescriptionAction } from "./actions";

const { mockPrisma, requireUserMock, dispatchMock } = hoisted;

function clinician(over: Record<string, unknown> = {}) {
  return {
    id: "user_1",
    email: "doc@example.com",
    firstName: "Cli",
    lastName: "Nician",
    organizationId: "org_1",
    organizationName: "Clinic",
    ...over,
  };
}

function patient(over: Record<string, unknown> = {}) {
  return {
    id: "pat_1",
    organizationId: "org_1",
    firstName: "Pat",
    lastName: "Patient",
    dateOfBirth: null,
    presentingConcerns: null,
    intakeAnswers: null,
    state: "CA",
    ...over,
  };
}

/** Build a FormData from a flat string map (the action reads via formData.get). */
function form(fields: Record<string, string>): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
}

const BASE = {
  patientId: "pat_1",
  productType: "tincture",
  volumePerDose: "1",
  volumeUnit: "mL",
  frequencyPerDay: "1",
  daysSupply: "30",
  quantity: "30",
  refills: "0",
};

beforeEach(() => {
  vi.clearAllMocks();
  requireUserMock.mockResolvedValue(clinician());
  mockPrisma.patient.findFirst.mockResolvedValue(patient());
  mockPrisma.patientMedication.findMany.mockResolvedValue([]);
  mockPrisma.chartSummary.findUnique.mockResolvedValue(null);
  mockPrisma.dosingRegimen.create.mockResolvedValue({ id: "rx_1" });
  mockPrisma.auditLog.create.mockResolvedValue({});
  dispatchMock.mockResolvedValue(undefined);
});

describe("T1 — pharmacy enforcement on the v2 path", () => {
  it("rejects a v2 submission with no pharmacy", async () => {
    const res = await createPrescriptionAction(
      null,
      form({ ...BASE, productId: "prod_1", rxFormVersion: "v2" }),
    );
    expect(res).toEqual({ ok: false, error: expect.stringMatching(/pharmacy/i) });
  });

  it("does not require pharmacy for legacy callers (no v2 marker)", async () => {
    // Ketamine (Schedule III, non-opioid) trips the CURES gate, proving the
    // request got PAST the pharmacy check without a pharmacy selected.
    mockPrisma.cannabisProduct.create.mockResolvedValue({
      id: "adhoc_1",
      name: "Ketamine 10mg",
      concentrationUnit: "mg/unit",
    });
    const res = await createPrescriptionAction(
      null,
      form({ ...BASE, customProductName: "Ketamine 10mg" }),
    );
    expect(res).toEqual({ ok: false, error: expect.stringMatching(/CURES/i) });
  });
});

describe("T2 — interaction screen for custom products", () => {
  it("blocks an unacknowledged red interaction on a custom product", async () => {
    mockPrisma.cannabisProduct.create.mockResolvedValue({
      id: "adhoc_1",
      name: "Custom blend tincture",
      concentrationUnit: "mg/unit",
    });
    mockPrisma.patientMedication.findMany.mockResolvedValue([
      { name: "Warfarin 5mg", active: true },
    ]);
    const res = await createPrescriptionAction(
      null,
      form({ ...BASE, customProductName: "Custom blend tincture" }),
    );
    expect(res).toEqual({
      ok: false,
      error: expect.stringMatching(/interaction/i),
    });
  });

  it("allows the custom Rx once the interaction is acknowledged", async () => {
    mockPrisma.cannabisProduct.create.mockResolvedValue({
      id: "adhoc_1",
      name: "Custom blend tincture",
      concentrationUnit: "mg/unit",
    });
    mockPrisma.patientMedication.findMany.mockResolvedValue([
      { name: "Warfarin 5mg", active: true },
    ]);
    await expect(
      createPrescriptionAction(
        null,
        form({
          ...BASE,
          customProductName: "Custom blend tincture",
          interactionAcknowledged: "true",
        }),
      ),
    ).rejects.toThrow(/NEXT_REDIRECT/);
    expect(mockPrisma.dosingRegimen.create).toHaveBeenCalledOnce();
  });
});

describe("T3 — CURES + high-risk attestation", () => {
  it("requires CURES for a controlled substance", async () => {
    mockPrisma.cannabisProduct.create.mockResolvedValue({
      id: "adhoc_1",
      name: "Ketamine 10mg",
      concentrationUnit: "mg/unit",
    });
    const res = await createPrescriptionAction(
      null,
      form({ ...BASE, customProductName: "Ketamine 10mg" }),
    );
    expect(res).toEqual({ ok: false, error: expect.stringMatching(/CURES/i) });
  });

  it("requires the high-risk attestation for high-dose THC", async () => {
    mockPrisma.cannabisProduct.findFirst.mockResolvedValue({
      id: "prod_thc",
      name: "House THC Oil",
      organizationId: "org_1",
      active: true,
      thcConcentration: 20,
      concentrationUnit: "mg/unit",
    });
    // 20 mg/unit × 1 unit × 3/day = 60 mg THC/day ≥ 40 mg/day threshold.
    const res = await createPrescriptionAction(
      null,
      form({ ...BASE, productId: "prod_thc", frequencyPerDay: "3" }),
    );
    expect(res).toEqual({
      ok: false,
      error: expect.stringMatching(/high-risk/i),
    });
  });

  it("requires the high-risk attestation for older adults", async () => {
    mockPrisma.patient.findFirst.mockResolvedValue(
      patient({ dateOfBirth: new Date("1950-01-01") }),
    );
    mockPrisma.cannabisProduct.findFirst.mockResolvedValue({
      id: "prod_cbd",
      name: "CBD Oil",
      organizationId: "org_1",
      active: true,
      thcConcentration: 1,
      concentrationUnit: "mg/unit",
    });
    const res = await createPrescriptionAction(
      null,
      form({ ...BASE, productId: "prod_cbd" }),
    );
    expect(res).toEqual({
      ok: false,
      error: expect.stringMatching(/high-risk/i),
    });
  });

  it("allows a high-risk Rx once the attestation is acknowledged", async () => {
    mockPrisma.cannabisProduct.findFirst.mockResolvedValue({
      id: "prod_thc",
      name: "House THC Oil",
      organizationId: "org_1",
      active: true,
      thcConcentration: 20,
      concentrationUnit: "mg/unit",
    });
    await expect(
      createPrescriptionAction(
        null,
        form({
          ...BASE,
          productId: "prod_thc",
          frequencyPerDay: "3",
          highRiskAttestationAcknowledged: "true",
        }),
      ),
    ).rejects.toThrow(/NEXT_REDIRECT/);
    expect(mockPrisma.dosingRegimen.create).toHaveBeenCalledOnce();
    // The high-risk acknowledgment is audited.
    expect(mockPrisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: "prescribing.high_risk.attested" }),
      }),
    );
  });
});
