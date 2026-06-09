import { beforeEach, describe, expect, it, vi } from "vitest";

const hoisted = vi.hoisted(() => {
  const mockPrisma = {
    patient: { findFirst: vi.fn() },
    messageThread: { create: vi.fn(), update: vi.fn() },
    message: { create: vi.fn() },
    auditLog: { create: vi.fn() },
    document: { create: vi.fn() },
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
  return { mockPrisma, requireUserMock: vi.fn(async () => mockUser) };
});

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  redirect: vi.fn(),
}));

vi.mock("@/lib/db/prisma", () => ({
  prisma: hoisted.mockPrisma,
}));

vi.mock("@/lib/auth/session", () => ({
  requireUser: () => hoisted.requireUserMock(),
}));

vi.mock("@/lib/orchestration/dispatch", () => ({
  dispatch: vi.fn(),
}));

vi.mock("@/lib/observability/log", () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

import { logCorrespondence } from "./actions";

const { mockPrisma } = hoisted;

function resetAll() {
  vi.clearAllMocks();
  mockPrisma.patient.findFirst.mockResolvedValue({ id: "patient_1", email: null, phone: null });
  mockPrisma.messageThread.create.mockResolvedValue({ id: "thread_1" });
  mockPrisma.messageThread.update.mockResolvedValue({});
  mockPrisma.message.create.mockResolvedValue({ id: "message_1" });
  mockPrisma.auditLog.create.mockResolvedValue({});
}

describe("logCorrespondence", () => {
  beforeEach(resetAll);

  it("does not create fake Document records for inline attachments", async () => {
    await logCorrespondence("patient_1", "email", "Follow up", "See attached.", [
      {
        name: "instructions.pdf",
        type: "application/pdf",
        size: 2048,
        base64: "data:application/pdf;base64,abc123",
      },
    ]);

    expect(mockPrisma.document.create).not.toHaveBeenCalled();
    expect(mockPrisma.message.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          body: expect.stringContaining("instructions.pdf"),
          channel: "email",
        }),
      }),
    );
  });
});
