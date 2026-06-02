import { beforeEach, describe, expect, it, vi } from "vitest";

const hoisted = vi.hoisted(() => ({
  prisma: { patientAssessmentOverride: { findMany: vi.fn() } },
}));
vi.mock("@/lib/db/prisma", () => ({ prisma: hoisted.prisma }));

import { isAssessmentOverride, loadAssessmentOverrides } from "./assessment-overrides";

const { prisma } = hoisted;

beforeEach(() => vi.clearAllMocks());

describe("isAssessmentOverride", () => {
  it("accepts only the three engine override values", () => {
    expect(isAssessmentOverride("require")).toBe(true);
    expect(isAssessmentOverride("skip")).toBe(true);
    expect(isAssessmentOverride("not_applicable")).toBe(true);
    expect(isAssessmentOverride("REQUIRE")).toBe(false);
    expect(isAssessmentOverride("")).toBe(false);
    expect(isAssessmentOverride("delete")).toBe(false);
  });
});

describe("loadAssessmentOverrides", () => {
  it("maps stored rows into the engine's overrides record, org-scoped", async () => {
    prisma.patientAssessmentOverride.findMany.mockResolvedValue([
      { assessmentSlug: "phq-9", override: "require" },
      { assessmentSlug: "gad-7", override: "skip" },
    ]);

    const out = await loadAssessmentOverrides("pat_1", "org_1");

    expect(out).toEqual({ "phq-9": "require", "gad-7": "skip" });
    expect(prisma.patientAssessmentOverride.findMany).toHaveBeenCalledWith({
      where: { patientId: "pat_1", organizationId: "org_1" },
      select: { assessmentSlug: true, override: true },
    });
  });

  it("drops any stored value the engine doesn't understand", async () => {
    prisma.patientAssessmentOverride.findMany.mockResolvedValue([
      { assessmentSlug: "phq-9", override: "require" },
      { assessmentSlug: "c-ssrs", override: "garbage" },
    ]);

    const out = await loadAssessmentOverrides("pat_1", "org_1");
    expect(out).toEqual({ "phq-9": "require" });
  });
});
