import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Portal consent persistence (signConsent) — EMR-1114 (PJ-B2).
 *
 * Regression cover: portal consent signatures used to live only in React
 * state (lost on refresh), and consents signed during the registration
 * packet (reg-* template ids) rendered as Unsigned — a duplicate-signature
 * invitation. signConsent must persist, dedupe across both surfaces, and
 * never let a user sign for a patient record that isn't their own.
 */

const hoisted = vi.hoisted(() => ({
  mockPrisma: {
    patient: { findUnique: vi.fn() },
    signedConsent: { findFirst: vi.fn(), create: vi.fn() },
    auditLog: { create: vi.fn() },
  },
  requireUserMock: vi.fn(),
  revalidatePathMock: vi.fn(),
}));

vi.mock("next/cache", () => ({
  revalidatePath: (...args: unknown[]) => hoisted.revalidatePathMock(...args),
}));
vi.mock("@/lib/db/prisma", () => ({ prisma: hoisted.mockPrisma }));
vi.mock("@/lib/auth/session", () => ({
  requireUser: () => hoisted.requireUserMock(),
}));

import { signConsent } from "./actions";

const { mockPrisma, requireUserMock, revalidatePathMock } = hoisted;

const SIGNED_AT = new Date("2026-06-10T12:00:00Z");

// Valid submission for the HIPAA template (consent-hipaa):
// h2/h3 required acknowledgments, h4 signature, h5 date.
function hipaaPayload(over: Partial<Parameters<typeof signConsent>[0]> = {}) {
  return {
    templateId: "consent-hipaa",
    responses: { h2: true, h3: true, h4: true, h5: "2026-06-10" },
    signatureData: "data:image/png;base64,abc123",
    ...over,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  requireUserMock.mockResolvedValue({ id: "user_1" });
  mockPrisma.patient.findUnique.mockResolvedValue({
    id: "patient_1",
    organizationId: "org_1",
  });
  mockPrisma.signedConsent.findFirst.mockResolvedValue(null);
  mockPrisma.signedConsent.create.mockResolvedValue({
    id: "sc_new",
    templateId: "consent-hipaa",
    templateName: "HIPAA Privacy Notice",
    signedAt: SIGNED_AT,
  });
  mockPrisma.auditLog.create.mockResolvedValue({ id: "audit_1" });
});

describe("signConsent", () => {
  it("persists the signature, audits, and revalidates", async () => {
    const res = await signConsent(hipaaPayload());

    expect(res).toEqual({
      ok: true,
      alreadySigned: false,
      consent: {
        id: "sc_new",
        templateId: "consent-hipaa",
        templateName: "HIPAA Privacy Notice",
        signedAt: SIGNED_AT.toISOString(),
      },
    });

    expect(mockPrisma.signedConsent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          patientId: "patient_1",
          templateId: "consent-hipaa",
          templateName: "HIPAA Privacy Notice",
          version: "1.0",
          signatureData: "data:image/png;base64,abc123",
        }),
      }),
    );
    expect(mockPrisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          organizationId: "org_1",
          actorUserId: "user_1",
          action: "patient.consent.signed",
          subjectType: "SignedConsent",
          subjectId: "sc_new",
        }),
      }),
    );
    expect(revalidatePathMock).toHaveBeenCalledWith("/portal/consent");
    expect(revalidatePathMock).toHaveBeenCalledWith("/portal");
  });

  it("returns the existing row instead of double-signing the same template", async () => {
    mockPrisma.signedConsent.findFirst.mockResolvedValue({
      id: "sc_old",
      templateId: "consent-hipaa",
      templateName: "HIPAA Privacy Notice",
      signedAt: SIGNED_AT,
    });

    const res = await signConsent(hipaaPayload());

    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.alreadySigned).toBe(true);
      expect(res.consent.id).toBe("sc_old");
    }
    expect(mockPrisma.signedConsent.create).not.toHaveBeenCalled();
    expect(mockPrisma.auditLog.create).not.toHaveBeenCalled();
  });

  it("dedupes against registration-packet consents (reg-* template aliases)", async () => {
    // Treatment consent was signed during registration as "reg-treatment".
    mockPrisma.signedConsent.findFirst.mockResolvedValue({
      id: "sc_reg",
      templateId: "reg-treatment",
      templateName: "Treatment Consent",
      signedAt: SIGNED_AT,
    });

    const res = await signConsent({
      templateId: "consent-treatment",
      responses: { f2: true, f3: true, f4: true, f5: true, f6: true, f7: "2026-06-10" },
      signatureData: "data:image/png;base64,abc123",
    });

    // Lookup must consider both the portal id and the registration alias.
    const where = mockPrisma.signedConsent.findFirst.mock.calls[0][0].where;
    expect(where.patientId).toBe("patient_1");
    expect(where.templateId.in).toEqual(
      expect.arrayContaining(["consent-treatment", "reg-treatment"]),
    );

    expect(res.ok).toBe(true);
    if (res.ok) expect(res.alreadySigned).toBe(true);
    expect(mockPrisma.signedConsent.create).not.toHaveBeenCalled();
  });

  it("denies signing when the user has no patient record (cross-patient safety)", async () => {
    mockPrisma.patient.findUnique.mockResolvedValue(null);

    const res = await signConsent(hipaaPayload());

    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/no patient/i);
    expect(mockPrisma.signedConsent.create).not.toHaveBeenCalled();

    // The patient is resolved strictly from the signed-in user — there is no
    // caller-supplied patientId, so a user can never write another patient's
    // consent.
    expect(mockPrisma.patient.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: "user_1" } }),
    );
  });

  it("rejects an unknown template without touching the DB", async () => {
    const res = await signConsent(hipaaPayload({ templateId: "consent-nope" }));
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/unknown/i);
    expect(mockPrisma.signedConsent.findFirst).not.toHaveBeenCalled();
    expect(mockPrisma.signedConsent.create).not.toHaveBeenCalled();
  });

  it("requires a signature for templates with a signature field", async () => {
    const res = await signConsent(hipaaPayload({ signatureData: undefined }));
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/signature/i);
    expect(mockPrisma.signedConsent.create).not.toHaveBeenCalled();
  });

  it("rejects when a required acknowledgment is missing", async () => {
    const res = await signConsent(
      hipaaPayload({ responses: { h2: true, h3: false, h4: true, h5: "2026-06-10" } }),
    );
    expect(res.ok).toBe(false);
    expect(mockPrisma.signedConsent.create).not.toHaveBeenCalled();
  });
});
