// EMR-1116 (PJ-M2) — communication preferences: real upsert, no setTimeout fake.

import { beforeEach, describe, expect, it, vi } from "vitest";

const hoisted = vi.hoisted(() => {
  const mockPrisma = {
    patient: { findUnique: vi.fn(), update: vi.fn() },
    communicationPreference: { findUnique: vi.fn(), upsert: vi.fn() },
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
  saveCommunicationPreferencesAction,
  type CommunicationPreferencesInput,
} from "./actions";

const { mockPrisma } = hoisted;

const validInput: CommunicationPreferencesInput = {
  smsOptIn: true,
  emailFrequency: "daily",
  quietHoursStart: "22:00",
  quietHoursEnd: "07:00",
  categories: [
    { id: "appointments", email: true, sms: false },
    { id: "billing", email: true, sms: false },
  ],
  contactWindow: "business_hours",
  language: "es",
  emergencyOverride: true,
  marketingOptOut: true,
};

function resetAll() {
  vi.clearAllMocks();
  mockPrisma.patient.findUnique.mockResolvedValue({
    id: "patient_1",
    organizationId: "org_1",
  });
  mockPrisma.communicationPreference.findUnique.mockResolvedValue(null);
  mockPrisma.communicationPreference.upsert.mockResolvedValue({});
  mockPrisma.auditLog.create.mockResolvedValue({});
}

beforeEach(resetAll);

describe("saveCommunicationPreferencesAction", () => {
  it("upserts columns + category JSON keyed by userId", async () => {
    const result = await saveCommunicationPreferencesAction(validInput);

    expect(result).toEqual({ ok: true, savedAt: expect.any(String) });

    const call = mockPrisma.communicationPreference.upsert.mock.calls[0][0];
    expect(call.where).toEqual({ userId: "user_1" });
    expect(call.update).toMatchObject({
      smsOptIn: true,
      emailFrequency: "daily",
      quietHoursStart: "22:00",
      quietHoursEnd: "07:00",
    });
    // Category shape consumed by lib/scheduling/previsit-channels:
    // preferences.appointments = { email, sms }
    expect(call.update.preferences).toMatchObject({
      appointments: { email: true, sms: false },
      billing: { email: true, sms: false },
      general: {
        contactWindow: "business_hours",
        language: "es",
        emergencyOverride: true,
        marketingOptOut: true,
      },
    });

    expect(mockPrisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: "patient.communicationPreferences.updated",
          organizationId: "org_1",
          actorUserId: "user_1",
        }),
      }),
    );
    expect(hoisted.revalidatePathMock).toHaveBeenCalledWith("/portal/profile");
  });

  it("merges with existing JSON blocks (reminders/notificationTypes survive)", async () => {
    mockPrisma.communicationPreference.findUnique.mockResolvedValue({
      preferences: {
        reminders: { smsOptIn: false },
        notificationTypes: { system: { enabled: true, channels: ["in_app"] } },
      },
    });

    await saveCommunicationPreferencesAction(validInput);

    const call = mockPrisma.communicationPreference.upsert.mock.calls[0][0];
    expect(call.update.preferences).toMatchObject({
      reminders: { smsOptIn: false },
      notificationTypes: { system: { enabled: true, channels: ["in_app"] } },
      appointments: { email: true, sms: false },
    });
  });

  it("rejects malformed quiet hours", async () => {
    const result = await saveCommunicationPreferencesAction({
      ...validInput,
      quietHoursStart: "25:99",
    });

    expect(result).toEqual({ ok: false, error: "Invalid preferences." });
    expect(mockPrisma.communicationPreference.upsert).not.toHaveBeenCalled();
  });

  it("fails closed when there is no patient record", async () => {
    mockPrisma.patient.findUnique.mockResolvedValue(null);

    const result = await saveCommunicationPreferencesAction(validInput);

    expect(result).toEqual({ ok: false, error: "No patient profile found." });
    expect(mockPrisma.communicationPreference.upsert).not.toHaveBeenCalled();
  });
});
