import { describe, expect, it } from "vitest";

import {
  PREVISIT_PORTAL_CTA,
  renderPrevisitReminder,
  type PrevisitMilestone,
} from "./previsit-templates";

const PORTAL = "https://portal.leafjourney.com";

// Tokens that would indicate PHI leaked into the copy. NONE of these are passed
// into the renderer, so none may ever appear in the output for any milestone.
const PHI_NEEDLES = [
  "maya",
  "patel",
  "1985",
  "diagnos",
  "cannabis",
  "insurance",
  "allerg",
  "mrn",
  "+1555",
  "appointment with dr",
];

const MILESTONES: PrevisitMilestone[] = ["7day", "2day", "morning_of"];

describe("renderPrevisitReminder", () => {
  it("includes the portal origin and a generic CTA", () => {
    const body = renderPrevisitReminder("7day", { portalUrl: PORTAL });
    expect(body).toContain(PORTAL);
    expect(body).toContain(PREVISIT_PORTAL_CTA);
  });

  it("never contains PHI for any milestone", () => {
    for (const milestone of MILESTONES) {
      const body = renderPrevisitReminder(milestone, { portalUrl: PORTAL }).toLowerCase();
      for (const needle of PHI_NEEDLES) {
        expect(body, `milestone ${milestone} leaked "${needle}"`).not.toContain(needle);
      }
    }
  });

  it("keeps the body within a single SMS segment and links exactly once", () => {
    for (const milestone of MILESTONES) {
      const body = renderPrevisitReminder(milestone, { portalUrl: PORTAL });
      expect(body.length).toBeLessThanOrEqual(160);
      const urls = body.match(/https?:\/\/\S+/g) ?? [];
      expect(urls).toHaveLength(1);
    }
  });

  it("uses morning-of urgency wording only for the morning_of milestone", () => {
    expect(renderPrevisitReminder("morning_of", { portalUrl: PORTAL }).toLowerCase()).toContain(
      "today",
    );
    expect(renderPrevisitReminder("7day", { portalUrl: PORTAL }).toLowerCase()).not.toContain(
      "today",
    );
  });

  it("rejects a portal url that smuggles a path/query (a PHI carrier)", () => {
    expect(() =>
      renderPrevisitReminder("7day", { portalUrl: `${PORTAL}/appt/appt_1?dob=1985-01-01` }),
    ).toThrow(/portal url/i);
  });

  it("rejects a non-https portal url", () => {
    expect(() => renderPrevisitReminder("7day", { portalUrl: "http://portal.leafjourney.com" })).toThrow(
      /portal url/i,
    );
  });
});
