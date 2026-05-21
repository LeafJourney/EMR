import { describe, it, expect, vi, beforeEach } from "vitest";
import util from "util";
import ClinicHomePage from "./page";
import * as session from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";

vi.mock("@/lib/auth/session", () => ({
  requireUser: vi.fn(),
  getCurrentUser: vi.fn(),
}));

vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    encounter: { findMany: vi.fn(), count: vi.fn() },
    note: { findMany: vi.fn(), count: vi.fn() },
    agentJob: { findMany: vi.fn(), count: vi.fn() },
    messageThread: { count: vi.fn() },
    patient: { count: vi.fn() },
    assessmentResponse: { findMany: vi.fn() },
    message: { findMany: vi.fn() },
    document: { findMany: vi.fn() },
    chartSummary: { findMany: vi.fn() },
    clinicalObservation: { findMany: vi.fn() },
    practiceConfiguration: { findFirst: vi.fn() },
  },
}));

vi.mock("next/navigation", () => ({
  redirect: vi.fn(),
}));

describe("ClinicHomePage Server Component", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders the fallback gracefully when the database queries hang (EMR-205 regression test)", async () => {
    vi.mocked(session.requireUser).mockResolvedValue({ id: "user-123", organizationId: "org-123", firstName: "Test" } as any);

    // Mock Prisma to return a Promise that NEVER resolves
    vi.mocked(prisma.encounter.findMany).mockImplementation(() => new Promise(() => {}) as any);
    vi.mocked(prisma.note.count).mockImplementation(() => new Promise(() => {}) as any);

    const start = Date.now();
    const result = await ClinicHomePage();
    const end = Date.now();

    // The timeout for clinic/page.tsx is 8000ms
    expect(end - start).toBeGreaterThanOrEqual(7500);
    expect(end - start).toBeLessThan(9000);

    const resultStr = util.inspect(result, { depth: null });
    // Look for empty state components or specific elements from the fallback
    // The fallback gives an empty array for encounters, so todaysEncounters is empty.
    // It should render the command strip properly.
    expect(resultStr).toContain("Patients today");
  }, 15000);
});
