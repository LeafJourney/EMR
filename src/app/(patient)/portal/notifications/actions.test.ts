// EMR-1116 (PJ-M2) — notification mark-read + preference persistence.

import { beforeEach, describe, expect, it, vi } from "vitest";

const hoisted = vi.hoisted(() => {
  const mockPrisma = {
    notification: { updateMany: vi.fn() },
    communicationPreference: { findUnique: vi.fn(), upsert: vi.fn() },
    patient: { findUnique: vi.fn() },
    auditLog: { create: vi.fn() },
  };
  const mockUser = {
    id: "user_1",
    email: "patient@demo.health",
    firstName: "Maya",
    lastName: "Reyes",
    roles: ["patient"],
    organizationId: "org_1",
    organizationName: "Clinic",
  };
  return {
    mockPrisma,
    requireRoleMock: vi.fn(async () => mockUser),
    revalidatePathMock: vi.fn(),
  };
});

vi.mock("next/cache", () => ({
  revalidatePath: (...args: unknown[]) => hoisted.revalidatePathMock(...args),
}));

vi.mock("@/lib/db/prisma", () => ({
  prisma: hoisted.mockPrisma,
}));

vi.mock("@/lib/auth/session", () => ({
  requireRole: () => hoisted.requireRoleMock(),
}));

import {
  markAllNotificationsReadAction,
  markNotificationReadAction,
  saveNotificationPreferencesAction,
} from "./actions";

const { mockPrisma } = hoisted;

function resetAll() {
  vi.clearAllMocks();
  mockPrisma.notification.updateMany.mockResolvedValue({ count: 1 });
  mockPrisma.communicationPreference.findUnique.mockResolvedValue(null);
  mockPrisma.communicationPreference.upsert.mockResolvedValue({});
  mockPrisma.patient.findUnique.mockResolvedValue({
    id: "patient_1",
    organizationId: "org_1",
  });
  mockPrisma.auditLog.create.mockResolvedValue({});
}

beforeEach(resetAll);

describe("markNotificationReadAction", () => {
  it("persists readAt scoped to the signed-in user's row", async () => {
    const result = await markNotificationReadAction("notif_1");

    expect(result).toEqual({ ok: true });
    expect(mockPrisma.notification.updateMany).toHaveBeenCalledWith({
      where: { id: "notif_1", userId: "user_1", read: false },
      data: { read: true, readAt: expect.any(Date) },
    });
    expect(hoisted.revalidatePathMock).toHaveBeenCalledWith(
      "/portal/notifications",
    );
  });

  it("rejects a missing id", async () => {
    const result = await markNotificationReadAction("");
    expect(result).toEqual({ ok: false, error: "Missing notification id." });
    expect(mockPrisma.notification.updateMany).not.toHaveBeenCalled();
  });
});

describe("markAllNotificationsReadAction", () => {
  it("marks only the signed-in user's unread rows", async () => {
    const result = await markAllNotificationsReadAction();

    expect(result).toEqual({ ok: true });
    expect(mockPrisma.notification.updateMany).toHaveBeenCalledWith({
      where: { userId: "user_1", read: false },
      data: { read: true, readAt: expect.any(Date) },
    });
  });
});

describe("saveNotificationPreferencesAction", () => {
  const prefs = [
    {
      type: "appointment_reminder" as const,
      enabled: true,
      channels: ["in_app" as const, "sms" as const],
    },
    {
      type: "dosing_reminder" as const,
      enabled: false,
      channels: [],
    },
  ];

  it("upserts the per-type prefs into CommunicationPreference.preferences", async () => {
    const result = await saveNotificationPreferencesAction(prefs);

    expect(result).toEqual({ ok: true, savedAt: expect.any(String) });
    expect(mockPrisma.communicationPreference.upsert).toHaveBeenCalledWith({
      where: { userId: "user_1" },
      create: {
        userId: "user_1",
        preferences: {
          notificationTypes: {
            appointment_reminder: { enabled: true, channels: ["in_app", "sms"] },
            dosing_reminder: { enabled: false, channels: [] },
          },
        },
      },
      update: {
        preferences: {
          notificationTypes: {
            appointment_reminder: { enabled: true, channels: ["in_app", "sms"] },
            dosing_reminder: { enabled: false, channels: [] },
          },
        },
      },
    });
    expect(mockPrisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: "patient.notificationPreferences.updated",
          actorUserId: "user_1",
        }),
      }),
    );
  });

  it("merges with existing preference blocks instead of clobbering them", async () => {
    mockPrisma.communicationPreference.findUnique.mockResolvedValue({
      preferences: {
        reminders: { smsOptIn: true },
        appointments: { sms: false },
      },
    });

    await saveNotificationPreferencesAction(prefs);

    const call = mockPrisma.communicationPreference.upsert.mock.calls[0][0];
    expect(call.update.preferences).toMatchObject({
      reminders: { smsOptIn: true },
      appointments: { sms: false },
      notificationTypes: {
        appointment_reminder: { enabled: true },
      },
    });
  });

  it("rejects unknown types/channels", async () => {
    const result = await saveNotificationPreferencesAction([
      { type: "carrier_pigeon" as never, enabled: true, channels: [] },
    ]);

    expect(result).toEqual({
      ok: false,
      error: "Invalid notification preferences.",
    });
    expect(mockPrisma.communicationPreference.upsert).not.toHaveBeenCalled();
  });
});
