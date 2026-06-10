import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

// The sign-off page/layout use JSX without importing React (Next's automatic
// runtime); under vitest's classic transform the factory must be global.
(globalThis as Record<string, unknown>).React = React;

/**
 * EMR-1111 (FO-B5) — the sign-off queue previously loaded notes, labs,
 * refills, and message drafts behind nothing but requireUser(): a role with
 * zero clinical grants (front_office) could browse the clinical queue.
 * These tests pin the gate: roles without `notes.read` are redirected
 * BEFORE any prisma query runs; clinical roles still get the queue.
 */
const hoisted = vi.hoisted(() => ({
  mockPrisma: {
    labResult: { findMany: vi.fn(), count: vi.fn() },
    refillRequest: { findMany: vi.fn(), count: vi.fn() },
    note: { findMany: vi.fn(), count: vi.fn() },
    message: { findMany: vi.fn(), count: vi.fn() },
  },
  requireUserMock: vi.fn(),
  redirectMock: vi.fn((path: string) => {
    // Match Next's real behavior: redirect() throws and halts the component.
    throw new Error(`NEXT_REDIRECT:${path}`);
  }),
}));

vi.mock("@/lib/db/prisma", () => ({ prisma: hoisted.mockPrisma }));
vi.mock("@/lib/auth/session", () => ({ requireUser: () => hoisted.requireUserMock() }));
vi.mock("next/navigation", () => ({
  redirect: (path: string) => hoisted.redirectMock(path),
}));

import SignOffPage from "./page";
import SignOffLayout from "./layout";

const { mockPrisma, requireUserMock, redirectMock } = hoisted;

function userWith(roles: string[]) {
  return { id: "user_1", roles, organizationId: "org_1", firstName: "Robin" };
}

beforeEach(() => {
  vi.clearAllMocks();
  redirectMock.mockImplementation((path: string) => {
    throw new Error(`NEXT_REDIRECT:${path}`);
  });
  mockPrisma.labResult.findMany.mockResolvedValue([]);
  mockPrisma.labResult.count.mockResolvedValue(0);
  mockPrisma.refillRequest.findMany.mockResolvedValue([]);
  mockPrisma.refillRequest.count.mockResolvedValue(0);
  mockPrisma.note.findMany.mockResolvedValue([]);
  mockPrisma.note.count.mockResolvedValue(0);
  mockPrisma.message.findMany.mockResolvedValue([]);
  mockPrisma.message.count.mockResolvedValue(0);
});

describe("SignOffPage — notes.read gate (FO-B5)", () => {
  it("redirects front_office to /clinic before any prisma query runs", async () => {
    requireUserMock.mockResolvedValue(userWith(["front_office"]));

    await expect(SignOffPage()).rejects.toThrow("NEXT_REDIRECT:/clinic");

    expect(redirectMock).toHaveBeenCalledWith("/clinic");
    expect(mockPrisma.labResult.findMany).not.toHaveBeenCalled();
    expect(mockPrisma.refillRequest.findMany).not.toHaveBeenCalled();
    expect(mockPrisma.note.findMany).not.toHaveBeenCalled();
    expect(mockPrisma.message.findMany).not.toHaveBeenCalled();
  });

  it("redirects kiosk and patient roles too", async () => {
    for (const role of ["kiosk", "patient", "operator"]) {
      requireUserMock.mockResolvedValue(userWith([role]));
      await expect(SignOffPage(), role).rejects.toThrow("NEXT_REDIRECT:/clinic");
    }
    expect(mockPrisma.note.findMany).not.toHaveBeenCalled();
  });

  it("renders the queue for clinicians (notes.read holders)", async () => {
    requireUserMock.mockResolvedValue(userWith(["clinician"]));

    const result = await SignOffPage();
    expect(result).toBeDefined();
    expect(redirectMock).not.toHaveBeenCalled();
    expect(mockPrisma.labResult.findMany).toHaveBeenCalledTimes(1);
  });

  it("renders the queue for back_office (read-only clinical role)", async () => {
    requireUserMock.mockResolvedValue(userWith(["back_office"]));

    const result = await SignOffPage();
    expect(result).toBeDefined();
    expect(redirectMock).not.toHaveBeenCalled();
  });
});

describe("SignOffLayout — notes.read gate (FO-B5)", () => {
  it("redirects front_office before counting anything", async () => {
    requireUserMock.mockResolvedValue(userWith(["front_office"]));

    await expect(
      SignOffLayout({ children: null }),
    ).rejects.toThrow("NEXT_REDIRECT:/clinic");

    expect(mockPrisma.labResult.count).not.toHaveBeenCalled();
    expect(mockPrisma.note.count).not.toHaveBeenCalled();
  });

  it("renders the nav counts for clinicians", async () => {
    requireUserMock.mockResolvedValue(userWith(["clinician"]));

    const result = await SignOffLayout({ children: null });
    expect(result).toBeDefined();
    expect(redirectMock).not.toHaveBeenCalled();
    expect(mockPrisma.labResult.count).toHaveBeenCalled();
  });
});
