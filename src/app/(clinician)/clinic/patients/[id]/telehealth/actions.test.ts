import { beforeEach, describe, expect, it, vi } from "vitest";

const hoisted = vi.hoisted(() => {
  const mockPrisma = {
    encounter: {
      findFirst: vi.fn(),
      update: vi.fn(),
    },
    callLog: {
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    messageThread: {
      findFirst: vi.fn(),
      create: vi.fn(),
    },
    notification: {
      create: vi.fn(),
    },
  };

  const mockUser = {
    id: "user_1",
    email: "clinician@example.com",
    firstName: "Cli",
    lastName: "Nician",
    roles: ["clinician"],
    organizationId: "org_1",
    organizationName: "Clinic",
  };

  return {
    mockPrisma,
    mockUser,
    requireUserMock: vi.fn(async () => mockUser),
    deliverMessageMock: vi.fn(async () => ({
      messageId: "msg_1",
      delivery: "delivered",
      detail: null,
    })),
    createVideoRoomMock: vi.fn(async (encounterId: string) => ({
      id: `room_${encounterId}`,
      name: `room-${encounterId}`,
      url: `https://example.daily.co/room-${encounterId}`,
      createdAt: "2026-01-01T00:00:00.000Z",
      expiresAt: "2026-01-01T01:00:00.000Z",
      maxParticipants: 4,
      privacyMode: "private",
    })),
    createMeetingTokenMock: vi.fn(async (roomName: string, userName: string, isOwner: boolean) => ({
      token: `${userName}-${isOwner ? "owner" : "guest"}`,
      roomName,
      userName,
      isOwner,
      expiresAt: "2026-01-01T01:00:00.000Z",
    })),
    deleteVideoRoomMock: vi.fn(),
  };
});

vi.mock("@/lib/db/prisma", () => ({
  prisma: hoisted.mockPrisma,
}));

vi.mock("@/lib/auth/session", () => ({
  requireUser: () => hoisted.requireUserMock(),
}));

vi.mock("@/lib/messaging/deliver", () => ({
  deliverMessage: (...args: unknown[]) => hoisted.deliverMessageMock(...(args as [])),
}));

vi.mock("@/lib/domain/telehealth-sdk", () => ({
  createVideoRoom: hoisted.createVideoRoomMock,
  createMeetingToken: hoisted.createMeetingTokenMock,
  deleteVideoRoom: hoisted.deleteVideoRoomMock,
}));

import { endTelehealthVisit, startTelehealthVisit } from "./actions";

const {
  mockPrisma,
  mockUser,
  deliverMessageMock,
  createVideoRoomMock,
  createMeetingTokenMock,
  deleteVideoRoomMock,
} = hoisted;

function resetAll() {
  vi.clearAllMocks();
  mockUser.roles = ["clinician"];
  mockUser.organizationId = "org_1";
  mockPrisma.encounter.findFirst.mockResolvedValue({
    id: "enc_1",
    patientId: "patient_1",
    organizationId: "org_1",
    modality: "video",
    briefingContext: { rooming: { room: "A3" } },
    patient: { userId: "user_p1", firstName: "Maya" },
  });
  mockPrisma.encounter.update.mockResolvedValue({});
  mockPrisma.callLog.findFirst.mockResolvedValue({
    id: "call_1",
    externalSessionId: "room-enc_1",
  });
  mockPrisma.callLog.create.mockResolvedValue({ id: "call_1" });
  mockPrisma.callLog.update.mockResolvedValue({ id: "call_1" });
  mockPrisma.messageThread.findFirst.mockResolvedValue({ id: "thread_1" });
  mockPrisma.messageThread.create.mockResolvedValue({ id: "thread_new" });
  mockPrisma.notification.create.mockResolvedValue({ id: "notif_1" });
}

describe("telehealth actions", () => {
  beforeEach(resetAll);

  it("rejects room creation when the encounter is not in the clinician org", async () => {
    mockPrisma.encounter.findFirst.mockResolvedValue(null);

    await expect(startTelehealthVisit("foreign_patient", "enc_foreign")).rejects.toThrow(
      "Telehealth encounter not found",
    );

    expect(createVideoRoomMock).not.toHaveBeenCalled();
    expect(createMeetingTokenMock).not.toHaveBeenCalled();
    expect(deliverMessageMock).not.toHaveBeenCalled();
  });

  it("creates tokens only after verifying patient, encounter, org, and video modality", async () => {
    const result = await startTelehealthVisit("patient_1", "enc_1");

    expect(mockPrisma.encounter.findFirst).toHaveBeenCalledWith({
      where: {
        id: "enc_1",
        patientId: "patient_1",
        organizationId: "org_1",
        modality: "video",
        patient: { deletedAt: null },
      },
      select: {
        id: true,
        patientId: true,
        organizationId: true,
        briefingContext: true,
        patient: { select: { userId: true, firstName: true } },
      },
    });
    expect(result.providerJoinUrl).toContain("Provider-owner");
    expect(result.patientJoinUrl).toContain("Patient-guest");
  });

  it("rejects non-clinical roles", async () => {
    mockUser.roles = ["patient"];

    await expect(startTelehealthVisit("patient_1", "enc_1")).rejects.toThrow(
      "Clinician role required",
    );
  });

  // ── EMR-1115 (PJ-B3) — patient join-link delivery ────────────────

  it("merges the patient join URL into briefingContext.telehealth without dropping existing keys", async () => {
    const result = await startTelehealthVisit("patient_1", "enc_1");

    expect(mockPrisma.encounter.update).toHaveBeenCalledWith({
      where: { id: "enc_1" },
      data: {
        briefingContext: expect.objectContaining({
          rooming: { room: "A3" },
          telehealth: expect.objectContaining({
            patientJoinUrl: result.patientJoinUrl,
            roomName: "room-enc_1",
          }),
        }),
      },
    });
  });

  it("delivers the join link as a portal message in the patient's thread", async () => {
    const result = await startTelehealthVisit("patient_1", "enc_1");

    expect(deliverMessageMock).toHaveBeenCalledWith(
      expect.objectContaining({
        threadId: "thread_1",
        channel: "portal",
        senderUserId: "user_1",
        organizationId: "org_1",
        body: expect.stringContaining(result.patientJoinUrl),
      }),
    );
    expect(mockPrisma.messageThread.create).not.toHaveBeenCalled();
  });

  it("creates a care-team thread when the patient has none", async () => {
    mockPrisma.messageThread.findFirst.mockResolvedValue(null);

    await startTelehealthVisit("patient_1", "enc_1");

    expect(mockPrisma.messageThread.create).toHaveBeenCalledWith({
      data: { patientId: "patient_1", subject: "Care team" },
      select: { id: true },
    });
    expect(deliverMessageMock).toHaveBeenCalledWith(
      expect.objectContaining({ threadId: "thread_new" }),
    );
  });

  it("writes a Notification row pointing at the portal Appointments page", async () => {
    await startTelehealthVisit("patient_1", "enc_1");

    expect(mockPrisma.notification.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: "user_p1",
        type: "telehealth_join",
        href: "/portal/appointments",
        metadata: { encounterId: "enc_1", roomName: "room-enc_1" },
      }),
    });
  });

  it("skips the Notification (but still messages) when the patient has no portal account", async () => {
    mockPrisma.encounter.findFirst.mockResolvedValue({
      id: "enc_1",
      patientId: "patient_1",
      organizationId: "org_1",
      modality: "video",
      briefingContext: null,
      patient: { userId: null, firstName: "Maya" },
    });

    await startTelehealthVisit("patient_1", "enc_1");

    expect(mockPrisma.notification.create).not.toHaveBeenCalled();
    expect(deliverMessageMock).toHaveBeenCalled();
  });

  it("deletes only rooms recorded on same-org call logs", async () => {
    await endTelehealthVisit("room-enc_1");

    expect(mockPrisma.callLog.findFirst).toHaveBeenCalledWith({
      where: {
        organizationId: "org_1",
        channel: "video",
        externalSessionId: "room-enc_1",
      },
      select: { id: true },
    });
    expect(deleteVideoRoomMock).toHaveBeenCalledWith("room-enc_1");
  });
});
