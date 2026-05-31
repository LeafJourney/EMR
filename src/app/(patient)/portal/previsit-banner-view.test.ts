import { describe, expect, it } from "vitest";

import { buildPrevisitBannerView, describeWhen } from "./previsit-banner-view";
import type { UpcomingVisitReadiness } from "@/lib/scheduling/previsit-readiness";

const NOW = new Date("2026-06-01T12:00:00.000Z");

function view(overrides: Partial<UpcomingVisitReadiness> = {}): UpcomingVisitReadiness {
  return {
    appointmentId: "appt_1",
    startAt: new Date("2026-06-06T16:00:00.000Z"), // 5 days out
    readiness: { isReady: false, missingRequiredIds: ["consent"], outstandingRequiredCount: 1, completionPct: 0.5 },
    missingRequirements: [{ id: "consent", label: "Visit consent", href: "/patient/consents" }],
    ...overrides,
  };
}

describe("buildPrevisitBannerView", () => {
  it("hides when there is no upcoming visit", () => {
    expect(buildPrevisitBannerView(null, NOW)).toBeNull();
  });

  it("hides when the patient is already ready", () => {
    expect(
      buildPrevisitBannerView(
        view({ readiness: { isReady: true, missingRequiredIds: [], outstandingRequiredCount: 0, completionPct: 1 } }),
        NOW,
      ),
    ).toBeNull();
  });

  it("hides when nothing is outstanding even if not flagged ready", () => {
    expect(buildPrevisitBannerView(view({ missingRequirements: [] }), NOW)).toBeNull();
  });

  it("surfaces percent, when-label, and the deep-linked items", () => {
    const banner = buildPrevisitBannerView(view(), NOW);
    expect(banner).toEqual({
      completionPct: 50,
      whenLabel: "in 5 days",
      items: [{ id: "consent", label: "Visit consent", href: "/patient/consents" }],
    });
  });
});

describe("describeWhen", () => {
  it("frames same-day and past as today", () => {
    expect(describeWhen(new Date("2026-06-01T18:00:00Z"), NOW)).toBe("today");
    expect(describeWhen(new Date("2026-05-30T18:00:00Z"), NOW)).toBe("today");
  });
  it("frames tomorrow and multi-day", () => {
    expect(describeWhen(new Date("2026-06-02T12:00:00Z"), NOW)).toBe("tomorrow");
    expect(describeWhen(new Date("2026-06-08T12:00:00Z"), NOW)).toBe("in 7 days");
  });
});
