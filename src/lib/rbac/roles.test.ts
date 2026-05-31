import { describe, expect, it } from "vitest";
import { canAccessPath, homeForRoles, landingRole, primaryRole, ROLE_HOME } from "./roles";

// primaryRole picks the highest-privilege role from a user's membership set
// and is load-bearing for post-sign-in routing — Clerk lands every user on
// /post-sign-in, which calls primaryRole(user.roles) to decide whether to
// send them to /portal, /ops, /admin/hq, etc. The cases below lock in the
// priority ordering so a future tweak to the role enum can't quietly
// re-route the wrong role group.

describe("primaryRole", () => {
  it("returns patient when given only patient", () => {
    expect(primaryRole(["patient"])).toBe("patient");
  });

  it("prefers practice_owner over patient when both present", () => {
    // The exact bug we're fixing: a practice_owner with an older patient
    // membership row was getting routed to /portal because roles[0] is
    // creation-date ordered. primaryRole must ignore order entirely.
    expect(primaryRole(["patient", "practice_owner"])).toBe("practice_owner");
    expect(primaryRole(["practice_owner", "patient"])).toBe("practice_owner");
  });

  it("super_admin outranks every other role", () => {
    expect(
      primaryRole([
        "patient",
        "clinician",
        "practice_owner",
        "super_admin",
      ]),
    ).toBe("super_admin");
  });

  it("implementation_admin outranks practice roles", () => {
    expect(
      primaryRole(["practice_owner", "implementation_admin"]),
    ).toBe("implementation_admin");
  });

  it("falls back to patient on an empty role list", () => {
    expect(primaryRole([])).toBe("patient");
  });

  it("every Role returned by primaryRole has a ROLE_HOME entry", () => {
    // Sanity check that post-sign-in's `redirect(ROLE_HOME[role] ?? "/")`
    // never has to fall through to "/". Any new role added to the enum
    // must be added to ROLE_HOME at the same time.
    for (const role of [
      "patient",
      "clinician",
      "midlevel",
      "back_office",
      "front_office",
      "operator",
      "practice_owner",
      "practice_admin",
      "implementation_admin",
      "super_admin",
      "system",
    ] as const) {
      expect(ROLE_HOME[role]).toBeTruthy();
    }
  });
});

// landingRole answers a *different* question from primaryRole: not "what is
// this user's highest privilege?" but "which surface do they actually work in
// day to day?" The Practice Onboarding tool (home of super_admin /
// implementation_admin) is an occasional setup task, so operational roles win
// the landing — a physician who also carries an admin role must NOT be dumped
// into the onboarding wizard.
describe("landingRole", () => {
  it("prefers the clinical surface over an admin onboarding role", () => {
    expect(landingRole(["clinician", "super_admin"])).toBe("clinician");
    expect(landingRole(["super_admin", "clinician"])).toBe("clinician");
    expect(landingRole(["implementation_admin", "clinician"])).toBe("clinician");
  });

  it("prefers operational roles over admin onboarding roles", () => {
    expect(landingRole(["practice_owner", "super_admin"])).toBe("practice_owner");
    expect(landingRole(["front_office", "implementation_admin"])).toBe("front_office");
  });

  it("lands a pure admin on their own role", () => {
    expect(landingRole(["super_admin"])).toBe("super_admin");
    expect(landingRole(["implementation_admin"])).toBe("implementation_admin");
  });

  it("falls back to patient on an empty role list", () => {
    expect(landingRole([])).toBe("patient");
  });
});

describe("homeForRoles", () => {
  it("routes by landing precedence rather than role array order", () => {
    expect(homeForRoles(["patient", "practice_owner"])).toBe("/ops");
    expect(homeForRoles(["practice_owner", "patient"])).toBe("/ops");
  });

  it("sends a clinician+admin to the clinic, not the onboarding wizard", () => {
    expect(homeForRoles(["clinician", "super_admin"])).toBe("/clinic");
    expect(homeForRoles(["implementation_admin", "clinician"])).toBe("/clinic");
  });

  it("sends a pure super_admin to the HQ command center, not the onboarding tool", () => {
    expect(homeForRoles(["super_admin"])).toBe("/admin/hq");
  });

  it("still sends a pure implementation_admin to the onboarding controller", () => {
    expect(homeForRoles(["implementation_admin"])).toBe("/onboarding");
  });

  it("uses the patient home for empty role lists", () => {
    expect(homeForRoles([], "/sign-in")).toBe("/portal");
  });

  it("lands a kiosk-only login on the kiosk surface", () => {
    expect(homeForRoles(["kiosk"])).toBe("/kiosk");
  });

  it("never lands a combined account on the kiosk — operational roles win", () => {
    // A device account that somehow also carries a clinical role must not be
    // dumped onto the kiosk; the daily-driver surface takes precedence.
    expect(homeForRoles(["kiosk", "clinician"])).toBe("/clinic");
    expect(homeForRoles(["kiosk", "front_office"])).toBe("/clinic");
  });
});

// The kiosk is a hard-confined surface: the kiosk role reaches /kiosk and
// nothing else, and no other role can reach /kiosk. This two-way fence is the
// whole security story for a shared, unattended front-desk login, so lock it
// down here.
describe("canAccessPath — kiosk confinement", () => {
  it("lets the kiosk role into /kiosk", () => {
    expect(canAccessPath("kiosk", "/kiosk")).toBe(true);
    expect(canAccessPath("kiosk", "/kiosk/anything")).toBe(true);
  });

  it("keeps the kiosk role out of every PHI surface", () => {
    expect(canAccessPath("kiosk", "/portal")).toBe(false);
    expect(canAccessPath("kiosk", "/clinic")).toBe(false);
    expect(canAccessPath("kiosk", "/ops")).toBe(false);
  });

  it("keeps every other role out of /kiosk", () => {
    expect(canAccessPath("patient", "/kiosk")).toBe(false);
    expect(canAccessPath("clinician", "/kiosk")).toBe(false);
    expect(canAccessPath("front_office", "/kiosk")).toBe(false);
    expect(canAccessPath("super_admin", "/kiosk")).toBe(false);
  });
});
