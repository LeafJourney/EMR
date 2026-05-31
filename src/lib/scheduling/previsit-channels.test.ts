import { describe, expect, it } from "vitest";

import {
  resolvePrevisitChannels,
  readPrevisitCategoryToggles,
} from "./previsit-channels";

describe("resolvePrevisitChannels (opt-out model)", () => {
  it("uses every reachable channel when there is no preference row", () => {
    expect(
      resolvePrevisitChannels({
        hasPhone: true,
        hasEmail: true,
        hasPortalUser: true,
        prefs: null,
      }),
    ).toEqual(["sms", "email", "inapp"]);
  });

  it("preserves SMS-to-anyone-with-a-phone (no opt-in gate)", () => {
    expect(
      resolvePrevisitChannels({ hasPhone: true, hasEmail: false, hasPortalUser: false, prefs: null }),
    ).toEqual(["sms"]);
  });

  it("drops a channel only when EXPLICITLY turned off per category", () => {
    expect(
      resolvePrevisitChannels({
        hasPhone: true,
        hasEmail: true,
        hasPortalUser: true,
        prefs: { category: { sms: false } },
      }),
    ).toEqual(["email", "inapp"]);
  });

  it("suppresses email when emailFrequency is off", () => {
    expect(
      resolvePrevisitChannels({
        hasPhone: true,
        hasEmail: true,
        hasPortalUser: false,
        prefs: { emailFrequency: "off" },
      }),
    ).toEqual(["sms"]);
  });

  it("suppresses email when the category disables it", () => {
    expect(
      resolvePrevisitChannels({
        hasPhone: false,
        hasEmail: true,
        hasPortalUser: false,
        prefs: { category: { email: false } },
      }),
    ).toEqual([]);
  });

  it("only offers in-app to patients with a portal account", () => {
    expect(
      resolvePrevisitChannels({ hasPhone: false, hasEmail: false, hasPortalUser: false, prefs: null }),
    ).toEqual([]);
    expect(
      resolvePrevisitChannels({
        hasPhone: false,
        hasEmail: false,
        hasPortalUser: true,
        prefs: { category: { inapp: false } },
      }),
    ).toEqual([]);
  });
});

describe("readPrevisitCategoryToggles", () => {
  it("returns empty for missing/malformed preferences (opt-out default stands)", () => {
    expect(readPrevisitCategoryToggles(null)).toEqual({});
    expect(readPrevisitCategoryToggles("nope")).toEqual({});
    expect(readPrevisitCategoryToggles({})).toEqual({});
    expect(readPrevisitCategoryToggles({ appointments: "x" })).toEqual({});
  });

  it("prefers a previsit block over the broader appointments block", () => {
    expect(
      readPrevisitCategoryToggles({
        appointments: { sms: true, email: true },
        previsit: { sms: false },
      }),
    ).toEqual({ sms: false, email: undefined, inapp: undefined });
  });

  it("falls back to the appointments block and ignores non-booleans", () => {
    expect(
      readPrevisitCategoryToggles({ appointments: { sms: false, email: "yes", inapp: true } }),
    ).toEqual({ sms: false, email: undefined, inapp: true });
  });
});
