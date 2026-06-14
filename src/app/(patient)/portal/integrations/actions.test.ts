import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * EMR-054 — patient portal device connections (live-gated).
 *
 * Pins connect/disconnect/sync after the guardrail rewrite: provider
 * availability gating, that live Garmin returns an OAuth redirect (and never
 * writes inline), that mock Garmin runs the simulated ingest, token clearing
 * on disconnect, and audit coverage.
 */

const hoisted = vi.hoisted(() => ({
  GarminReconnectError: class GarminReconnectError extends Error {},
  mockPrisma: {
    patient: { findUnique: vi.fn() },
    deviceConnection: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      upsert: vi.fn(),
      update: vi.fn(),
    },
  },
  requireRoleMock: vi.fn(),
  createAuditLogMock: vi.fn(),
  syncGarminMock: vi.fn(),
  loadLiveTokenMock: vi.fn(),
  deregisterMock: vi.fn(),
  availabilityMock: vi.fn(),
  syncOAuth2Mock: vi.fn(),
  getOAuth2ModuleMock: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/db/prisma", () => ({ prisma: hoisted.mockPrisma }));
vi.mock("@/lib/auth/session", () => ({
  requireRole: (role: string) => hoisted.requireRoleMock(role),
}));
vi.mock("@/lib/domain/audit-logger", () => ({
  createAuditLog: (p: unknown) => hoisted.createAuditLogMock(p),
}));
vi.mock("@/lib/integrations/garmin/sync", () => ({
  syncGarminConnection: (...a: unknown[]) => hoisted.syncGarminMock(...a),
  loadLiveToken: (...a: unknown[]) => hoisted.loadLiveTokenMock(...a),
  GarminReconnectError: hoisted.GarminReconnectError,
}));
vi.mock("@/lib/integrations/garmin/client", () => ({
  garminHealthClient: { deregister: (...a: unknown[]) => hoisted.deregisterMock(...a) },
}));
vi.mock("@/lib/integrations/providers/sync", () => ({
  syncOAuth2Connection: (...a: unknown[]) => hoisted.syncOAuth2Mock(...a),
}));
vi.mock("@/lib/integrations/providers/registry", () => ({
  getOAuth2Module: (...a: unknown[]) => hoisted.getOAuth2ModuleMock(...a),
}));
vi.mock("@/lib/integrations/providers/errors", () => ({
  ProviderReconnectError: class ProviderReconnectError extends Error {},
}));
vi.mock("./availability", () => ({
  providerAvailability: (...a: unknown[]) => hoisted.availabilityMock(...a),
}));

import {
  connectDevice,
  disconnectDevice,
  syncDevice,
  getDeviceConnections,
} from "./actions";

const {
  mockPrisma,
  requireRoleMock,
  createAuditLogMock,
  syncGarminMock,
  availabilityMock,
  syncOAuth2Mock,
  getOAuth2ModuleMock,
} = hoisted;

const MOCK_AVAIL = { available: true, mode: "mock", connectKind: "inline" };
const LIVE_AVAIL = { available: true, mode: "live", connectKind: "oauth-redirect" };
const MOBILE_AVAIL = { available: true, mode: "mobile", connectKind: "mobile-app" };
const UNAVAILABLE = { available: false, mode: null, connectKind: null, reason: "not_implemented" };

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
  syncGarminMock.mockResolvedValue(3);
  syncOAuth2Mock.mockResolvedValue(4);
  getOAuth2ModuleMock.mockImplementation((slug: string) =>
    slug === "oura" || slug === "whoop" ? { slug } : null,
  );
  availabilityMock.mockReturnValue(MOCK_AVAIL);
});

describe("connectDevice", () => {
  it("rejects an unknown provider", async () => {
    const res = await connectDevice("peloton");
    expect(res).toEqual({ ok: false, error: "Unknown device." });
    expect(mockPrisma.deviceConnection.upsert).not.toHaveBeenCalled();
  });

  it("refuses a provider with no real backend (guardrail)", async () => {
    availabilityMock.mockReturnValue(UNAVAILABLE);
    const res = await connectDevice("fitbit");
    expect(res.ok).toBe(false);
    expect(mockPrisma.deviceConnection.upsert).not.toHaveBeenCalled();
    expect(syncGarminMock).not.toHaveBeenCalled();
  });

  it("returns an OAuth redirect for live Garmin and never writes inline", async () => {
    availabilityMock.mockReturnValue(LIVE_AVAIL);
    const res = await connectDevice("garmin");
    expect(res).toEqual({
      ok: true,
      redirect: "/api/integrations/garmin/connect",
    });
    expect(mockPrisma.deviceConnection.upsert).not.toHaveBeenCalled();
    expect(syncGarminMock).not.toHaveBeenCalled();
  });

  it("returns the generic OAuth2 redirect for live Oura", async () => {
    availabilityMock.mockReturnValue(LIVE_AVAIL);
    const res = await connectDevice("oura");
    expect(res).toEqual({
      ok: true,
      redirect: "/api/integrations/oauth2/oura/connect",
    });
    expect(mockPrisma.deviceConnection.upsert).not.toHaveBeenCalled();
  });

  it("points mobile providers at the app instead of connecting on the web", async () => {
    availabilityMock.mockReturnValue(MOBILE_AVAIL);
    const res = await connectDevice("apple-health");
    expect(res.ok).toBe(false);
    if (res.ok) throw new Error("expected failure");
    expect(res.error).toMatch(/mobile app/i);
    expect(mockPrisma.deviceConnection.upsert).not.toHaveBeenCalled();
  });

  it("runs the simulated ingest for mock Garmin and records the mode", async () => {
    availabilityMock.mockReturnValue(MOCK_AVAIL);
    const res = await connectDevice("garmin");
    expect(res.ok).toBe(true);
    if (!res.ok || !("state" in res)) throw new Error("expected inline state");
    expect(res.recordsSynced).toBe(3);
    expect(res.state.connected).toBe(true);
    expect(syncGarminMock).toHaveBeenCalledTimes(1);

    const audit = createAuditLogMock.mock.calls[0][0];
    expect(audit.action).toBe("patient.device_connected");
    expect(audit.metadata).toMatchObject({ provider: "garmin", mode: "mock", recordsSynced: 3 });
  });
});

describe("disconnectDevice", () => {
  it("marks disconnected and clears stored credentials", async () => {
    mockPrisma.deviceConnection.findUnique.mockResolvedValue({ mode: "mock" });
    const res = await disconnectDevice("garmin");
    expect(res.ok).toBe(true);
    const upsertArgs = mockPrisma.deviceConnection.upsert.mock.calls[0][0];
    expect(upsertArgs.update).toEqual({
      connected: false,
      accessToken: null,
      accessTokenSecret: null,
      tokenExpiresAt: null,
      providerUserId: null,
      oauthState: null,
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
    expect(syncGarminMock).not.toHaveBeenCalled();
  });

  it("re-runs the Garmin ingestion when connected", async () => {
    mockPrisma.deviceConnection.findUnique.mockResolvedValue({
      connected: true,
      accessToken: "enc-token",
      accessTokenSecret: "enc-secret",
    });
    const res = await syncDevice("garmin");
    expect(res.ok).toBe(true);
    expect(syncGarminMock).toHaveBeenCalledTimes(1);
    expect(createAuditLogMock.mock.calls[0][0].action).toBe("patient.device_synced");
  });

  it("re-runs the OAuth2 ingestion for a connected Oura device", async () => {
    mockPrisma.deviceConnection.findUnique.mockResolvedValue({
      connected: true,
      accessToken: "enc-token",
      accessTokenSecret: "enc-refresh",
      tokenExpiresAt: null,
    });
    const res = await syncDevice("oura");
    expect(res.ok).toBe(true);
    if (!res.ok || !("recordsSynced" in res)) throw new Error("expected sync state");
    expect(res.recordsSynced).toBe(4);
    expect(syncOAuth2Mock).toHaveBeenCalledTimes(1);
    expect(syncGarminMock).not.toHaveBeenCalled();
  });

  it("surfaces a reconnect prompt when the token expired", async () => {
    mockPrisma.deviceConnection.findUnique.mockResolvedValue({
      connected: true,
      accessToken: "enc-token",
      accessTokenSecret: "enc-secret",
    });
    syncGarminMock.mockRejectedValueOnce(new hoisted.GarminReconnectError());
    const res = await syncDevice("garmin");
    expect(res.ok).toBe(false);
    if (res.ok) throw new Error("expected failure");
    expect(res.error).toMatch(/reconnect/i);
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
