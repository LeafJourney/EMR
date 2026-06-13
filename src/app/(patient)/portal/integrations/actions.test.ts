import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * EMR-054 — patient portal device connections.
 *
 * Pins the connect/disconnect/sync server actions: provider validation,
 * patient scoping, that Garmin (and only Garmin) drives a real ingestion
 * pass, token clearing on disconnect, and audit coverage.
 */

const hoisted = vi.hoisted(() => ({
  mockPrisma: {
    patient: { findUnique: vi.fn() },
    deviceConnection: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      upsert: vi.fn(),
      update: vi.fn(),
    },
    outcomeLog: { findMany: vi.fn() },
    clinicalObservation: { findMany: vi.fn() },
  },
  requireRoleMock: vi.fn(),
  garminSyncMock: vi.fn(),
  createAuditLogMock: vi.fn(),
  evaluateCDSMock: vi.fn(),
  routeCDSMock: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/db/prisma", () => ({ prisma: hoisted.mockPrisma }));
vi.mock("@/lib/auth/session", () => ({
  requireRole: (role: string) => hoisted.requireRoleMock(role),
}));
vi.mock("@/lib/domain/audit-logger", () => ({
  createAuditLog: (p: unknown) => hoisted.createAuditLogMock(p),
}));
vi.mock("@/lib/integrations/garmin-vitals", () => ({
  garminClient: { syncPatientData: (...a: unknown[]) => hoisted.garminSyncMock(...a) },
}));
vi.mock("@/lib/cds/engine", () => ({
  evaluatePatientCDS: (...a: unknown[]) => hoisted.evaluateCDSMock(...a),
}));
vi.mock("@/lib/cds/alerts", () => ({
  routeCDSTriggers: (...a: unknown[]) => hoisted.routeCDSMock(...a),
}));

import { connectDevice, disconnectDevice, syncDevice, getDeviceConnections } from "./actions";

const {
  mockPrisma,
  requireRoleMock,
  garminSyncMock,
  createAuditLogMock,
  evaluateCDSMock,
  routeCDSMock,
} = hoisted;

beforeEach(() => {
  vi.clearAllMocks();
  requireRoleMock.mockResolvedValue({ id: "user_1" });
  mockPrisma.patient.findUnique.mockResolvedValue({
    id: "patient_1",
    organizationId: "org_1",
  });
  mockPrisma.deviceConnection.upsert.mockImplementation(({ update, create }: any) => ({
    connected: update?.connected ?? create?.connected ?? false,
    lastSyncedAt: update?.lastSyncedAt ?? create?.lastSyncedAt ?? null,
    lastError: update?.lastError ?? create?.lastError ?? null,
  }));
  mockPrisma.deviceConnection.update.mockImplementation(({ data }: any) => ({
    connected: true,
    lastSyncedAt: data?.lastSyncedAt ?? null,
    lastError: data?.lastError ?? null,
  }));
  mockPrisma.outcomeLog.findMany.mockResolvedValue([]);
  mockPrisma.clinicalObservation.findMany.mockResolvedValue([]);
  garminSyncMock.mockResolvedValue(3);
  evaluateCDSMock.mockReturnValue([]);
});

describe("connectDevice", () => {
  it("rejects an unknown provider", async () => {
    const res = await connectDevice("peloton");
    expect(res).toEqual({ ok: false, error: "Unknown device." });
    expect(mockPrisma.deviceConnection.upsert).not.toHaveBeenCalled();
  });

  it("runs the Garmin ingestion pass and records how many logs synced", async () => {
    const res = await connectDevice("garmin");
    expect(res.ok).toBe(true);
    if (!res.ok) throw new Error("expected ok");
    expect(res.recordsSynced).toBe(3);
    expect(res.state.connected).toBe(true);

    expect(garminSyncMock).toHaveBeenCalledTimes(1);
    const upsertArgs = mockPrisma.deviceConnection.upsert.mock.calls[0][0];
    expect(upsertArgs.where.patientId_provider).toEqual({
      patientId: "patient_1",
      provider: "garmin",
    });
    expect(upsertArgs.update.connected).toBe(true);

    const audit = createAuditLogMock.mock.calls[0][0];
    expect(audit.action).toBe("patient.device_connected");
    expect(audit.metadata).toMatchObject({ provider: "garmin", recordsSynced: 3 });
  });

  it("connects a non-Garmin provider without an ingestion pass", async () => {
    const res = await connectDevice("fitbit");
    expect(res.ok).toBe(true);
    expect(garminSyncMock).not.toHaveBeenCalled();
  });
});

describe("disconnectDevice", () => {
  it("marks disconnected and clears the stored token", async () => {
    const res = await disconnectDevice("garmin");
    expect(res.ok).toBe(true);
    const upsertArgs = mockPrisma.deviceConnection.upsert.mock.calls[0][0];
    expect(upsertArgs.update).toEqual({
      connected: false,
      accessToken: null,
      lastError: null,
    });
    expect(createAuditLogMock.mock.calls[0][0].action).toBe(
      "patient.device_disconnected",
    );
  });
});

describe("syncDevice", () => {
  it("refuses to sync a device that isn't connected", async () => {
    mockPrisma.deviceConnection.findUnique.mockResolvedValue(null);
    const res = await syncDevice("garmin");
    expect(res).toEqual({ ok: false, error: "Connect this device before syncing." });
    expect(garminSyncMock).not.toHaveBeenCalled();
  });

  it("re-runs the Garmin ingestion when connected", async () => {
    mockPrisma.deviceConnection.findUnique.mockResolvedValue({
      connected: true,
      accessToken: "mock-garmin-token",
    });
    const res = await syncDevice("garmin");
    expect(res.ok).toBe(true);
    expect(garminSyncMock).toHaveBeenCalledTimes(1);
    expect(createAuditLogMock.mock.calls[0][0].action).toBe("patient.device_synced");
  });
});

describe("getDeviceConnections", () => {
  it("maps saved rows keyed by provider slug", async () => {
    const when = new Date("2026-06-13T10:00:00.000Z");
    mockPrisma.deviceConnection.findMany.mockResolvedValue([
      { provider: "garmin", connected: true, lastSyncedAt: when, lastError: null },
    ]);
    const out = await getDeviceConnections();
    expect(out.garmin).toEqual({
      connected: true,
      lastSync: when.toISOString(),
      error: null,
    });
  });
});
