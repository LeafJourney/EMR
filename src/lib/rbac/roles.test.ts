import { describe, expect, it } from "vitest";
import { homeForRoles, primaryRole, ROLE_HOME } from "./roles";

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

describe("homeForRoles", () => {
  it("routes by highest privilege rather than role array order", () => {
    expect(homeForRoles(["patient", "practice_owner"])).toBe("/ops");
    expect(homeForRoles(["practice_owner", "patient"])).toBe("/ops");
  });

  it("uses the primary-role fallback for empty role lists", () => {
    expect(homeForRoles([], "/sign-in")).toBe("/portal");
  });
});
