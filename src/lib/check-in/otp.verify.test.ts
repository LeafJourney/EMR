import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * EMR-915 review — verifyOtpCode DB orchestration.
 *
 * The attempt counter is the ONLY brute-force bound on the 6-digit code, so it
 * must be spent atomically. These tests pin the conditional-`updateMany` claim:
 * a guess may compare the hash ONLY if it wins a slot guarded on
 * `attempts < maxAttempts` in the DB — never on a stale read snapshot.
 */
const hoisted = vi.hoisted(() => {
  const mockPrisma = {
    smsOtpCode: {
      findFirst: vi.fn(),
      updateMany: vi.fn(),
      aggregate: vi.fn(),
    },
    auditLog: { create: vi.fn() },
  };
  return { mockPrisma };
});

vi.mock("@/lib/db/prisma", () => ({ prisma: hoisted.mockPrisma }));
vi.mock("@/lib/sms/adapter", () => ({
  getSmsAdapter: () => ({ send: vi.fn() }),
  normalizePhone: (p: string | null) => p,
}));

import { hashOtp, verifyOtpCode } from "./otp";

const { mockPrisma } = hoisted;
const NOW = new Date("2026-06-01T12:00:00.000Z");

function activeRecord(over: Record<string, unknown> = {}) {
  return {
    id: "otp_1",
    patientId: "pat_1",
    purpose: "kiosk_lobby_handoff",
    codeHash: hashOtp("123456"),
    expiresAt: new Date(NOW.getTime() + 5 * 60 * 1000),
    attempts: 0,
    maxAttempts: 5,
    consumedAt: null,
    createdAt: NOW,
    ...over,
  };
}

const baseOpts = {
  patientId: "pat_1",
  organizationId: "org_1",
  purpose: "kiosk_lobby_handoff" as const,
};

beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma.auditLog.create.mockResolvedValue({});
  mockPrisma.smsOtpCode.aggregate.mockResolvedValue({ _sum: { attempts: 0 } });
});

describe("verifyOtpCode — atomic attempt accounting", () => {
  it("never touches the counter when there is no active code", async () => {
    mockPrisma.smsOtpCode.findFirst.mockResolvedValue(null);

    const res = await verifyOtpCode({ ...baseOpts, attemptCode: "123456", now: NOW });

    expect(res).toEqual({ ok: false, reason: "no_active_code" });
    expect(mockPrisma.smsOtpCode.updateMany).not.toHaveBeenCalled();
  });

  it("claims a slot guarded on attempts < maxAttempts, then consumes on the correct code", async () => {
    mockPrisma.smsOtpCode.findFirst.mockResolvedValue(activeRecord());
    mockPrisma.smsOtpCode.updateMany
      .mockResolvedValueOnce({ count: 1 }) // claim
      .mockResolvedValueOnce({ count: 1 }); // consume

    const res = await verifyOtpCode({ ...baseOpts, attemptCode: "123456", now: NOW });

    expect(res).toEqual({ ok: true, reason: "ok" });
    // First call is the atomic claim: increment only while under budget.
    const claim = mockPrisma.smsOtpCode.updateMany.mock.calls[0][0];
    expect(claim.where).toMatchObject({
      id: "otp_1",
      consumedAt: null,
      attempts: { lt: 5 },
    });
    expect(claim.data).toEqual({ attempts: { increment: 1 } });
    // Second call consumes only while still unconsumed.
    const consume = mockPrisma.smsOtpCode.updateMany.mock.calls[1][0];
    expect(consume.where).toMatchObject({ id: "otp_1", consumedAt: null });
    expect(consume.data).toEqual({ consumedAt: NOW });
  });

  it("THE RACE: snapshot shows budget left, but a lost atomic claim still locks out", async () => {
    // attempts=4 (< 5) so the pure snapshot check would PASS the lockout gate —
    // but a concurrent caller already spent the last slot, so the DB claim
    // matches no row. The old read-then-write code would have compared the hash
    // here; the atomic version must refuse.
    mockPrisma.smsOtpCode.findFirst.mockResolvedValue(activeRecord({ attempts: 4 }));
    mockPrisma.smsOtpCode.updateMany.mockResolvedValueOnce({ count: 0 }); // claim lost

    const res = await verifyOtpCode({ ...baseOpts, attemptCode: "123456", now: NOW });

    expect(res).toEqual({ ok: false, reason: "too_many_attempts" });
    // Only the claim ran; we never reached the consume step.
    expect(mockPrisma.smsOtpCode.updateMany).toHaveBeenCalledTimes(1);
  });

  it("spends an attempt on a wrong code but does not consume", async () => {
    mockPrisma.smsOtpCode.findFirst.mockResolvedValue(activeRecord());
    mockPrisma.smsOtpCode.updateMany.mockResolvedValueOnce({ count: 1 }); // claim

    const res = await verifyOtpCode({ ...baseOpts, attemptCode: "000000", now: NOW });

    expect(res).toEqual({ ok: false, reason: "mismatch" });
    // Claim happened; no consume on a mismatch.
    expect(mockPrisma.smsOtpCode.updateMany).toHaveBeenCalledTimes(1);
  });

  it("does not spend an attempt when the code has expired", async () => {
    mockPrisma.smsOtpCode.findFirst.mockResolvedValue(
      activeRecord({ expiresAt: new Date(NOW.getTime() - 1) }),
    );

    const res = await verifyOtpCode({ ...baseOpts, attemptCode: "123456", now: NOW });
 
    expect(res).toEqual({ ok: false, reason: "expired" });
    expect(mockPrisma.smsOtpCode.updateMany).not.toHaveBeenCalled();
  });
 
  it("locks out when cross-code aggregate failed attempts exceed limit", async () => {
    mockPrisma.smsOtpCode.aggregate.mockResolvedValueOnce({ _sum: { attempts: 10 } });
 
    const res = await verifyOtpCode({ ...baseOpts, attemptCode: "123456", now: NOW });
 
    expect(res).toEqual({ ok: false, reason: "locked_out" });
    expect(mockPrisma.smsOtpCode.findFirst).not.toHaveBeenCalled();
    expect(mockPrisma.smsOtpCode.updateMany).not.toHaveBeenCalled();
  });
});
