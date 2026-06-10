import { describe, expect, it } from "vitest";
import {
  canManageElevatedRoles,
  canManageTeam,
  checkAddRole,
  checkRemoveRole,
  isStaffRole,
  STAFF_ROLES,
  staffRoleMeta,
  type RoleChangeContext,
} from "./team-management";

// Base context helper — the happy path is an owner managing a member who
// already holds front_office, in an org with two owners.
function ctx(overrides: Partial<RoleChangeContext> = {}): RoleChangeContext {
  return {
    actorRoles: ["practice_owner"],
    targetRole: "back_office",
    memberCurrentRoles: ["front_office"],
    ownerCount: 2,
    ...overrides,
  };
}

describe("staff role catalog", () => {
  it("excludes platform and realm roles", () => {
    for (const forbidden of [
      "super_admin",
      "implementation_admin",
      "system",
      "leafnerd",
      "patient",
      "kiosk",
    ] as const) {
      expect(isStaffRole(forbidden)).toBe(false);
    }
  });

  it("includes the six §7 staff roles", () => {
    for (const allowed of [
      "front_office",
      "back_office",
      "midlevel",
      "clinician",
      "operator",
      "practice_admin",
      "practice_owner",
    ] as const) {
      expect(isStaffRole(allowed)).toBe(true);
    }
  });

  it("flags only provider-class roles as clinical-authoring", () => {
    const authoring = STAFF_ROLES.filter((r) => r.clinicalAuthoring).map((r) => r.role);
    expect(authoring).toEqual(["midlevel", "clinician", "practice_owner"]);
    // The non-clinical front/back office never carry authoring — the audit's
    // headline guarantee.
    expect(staffRoleMeta("front_office")?.clinicalAuthoring).toBe(false);
    expect(staffRoleMeta("back_office")?.clinicalAuthoring).toBe(false);
    expect(staffRoleMeta("operator")?.clinicalAuthoring).toBe(false);
  });
});

describe("canManageTeam / canManageElevatedRoles", () => {
  it("lets owner, admin, and super-admin manage the team", () => {
    expect(canManageTeam(["practice_owner"])).toBe(true);
    expect(canManageTeam(["practice_admin"])).toBe(true);
    expect(canManageTeam(["super_admin"])).toBe(true);
  });

  it("denies line staff and office manager from managing the team", () => {
    expect(canManageTeam(["front_office"])).toBe(false);
    expect(canManageTeam(["back_office"])).toBe(false);
    expect(canManageTeam(["operator"])).toBe(false);
    expect(canManageTeam(["clinician"])).toBe(false);
  });

  it("restricts elevated-role management to owner and super-admin", () => {
    expect(canManageElevatedRoles(["practice_owner"])).toBe(true);
    expect(canManageElevatedRoles(["super_admin"])).toBe(true);
    expect(canManageElevatedRoles(["practice_admin"])).toBe(false);
  });
});

describe("checkAddRole", () => {
  it("allows an owner to grant a line role", () => {
    expect(checkAddRole(ctx())).toBeNull();
  });

  it("forbids a non-manager", () => {
    expect(checkAddRole(ctx({ actorRoles: ["front_office"] }))).toBe("forbidden");
  });

  it("rejects non-staff roles", () => {
    expect(checkAddRole(ctx({ targetRole: "super_admin" }))).toBe("not_manageable");
  });

  it("blocks a practice_admin from granting an elevated role", () => {
    expect(
      checkAddRole(ctx({ actorRoles: ["practice_admin"], targetRole: "practice_owner" })),
    ).toBe("needs_owner");
  });

  it("lets an owner grant an elevated role", () => {
    expect(
      checkAddRole(ctx({ actorRoles: ["practice_owner"], targetRole: "practice_admin" })),
    ).toBeNull();
  });

  it("is a no-op when the member already holds the role", () => {
    expect(
      checkAddRole(ctx({ targetRole: "front_office", memberCurrentRoles: ["front_office"] })),
    ).toBe("noop");
  });
});

describe("checkRemoveRole", () => {
  it("allows removing a role the member holds (alongside others)", () => {
    expect(
      checkRemoveRole(
        ctx({ targetRole: "front_office", memberCurrentRoles: ["front_office", "back_office"] }),
      ),
    ).toBeNull();
  });

  it("is a no-op when the member doesn't hold the role", () => {
    expect(
      checkRemoveRole(ctx({ targetRole: "back_office", memberCurrentRoles: ["front_office"] })),
    ).toBe("noop");
  });

  it("won't strand a member with zero roles", () => {
    expect(
      checkRemoveRole(ctx({ targetRole: "front_office", memberCurrentRoles: ["front_office"] })),
    ).toBe("last_role");
  });

  it("won't remove the practice's last owner", () => {
    expect(
      checkRemoveRole(
        ctx({
          targetRole: "practice_owner",
          memberCurrentRoles: ["practice_owner", "clinician"],
          ownerCount: 1,
        }),
      ),
    ).toBe("last_owner");
  });

  it("allows removing an owner when another owner remains", () => {
    expect(
      checkRemoveRole(
        ctx({
          targetRole: "practice_owner",
          memberCurrentRoles: ["practice_owner", "clinician"],
          ownerCount: 2,
        }),
      ),
    ).toBeNull();
  });

  it("blocks a practice_admin from revoking an elevated role", () => {
    expect(
      checkRemoveRole(
        ctx({
          actorRoles: ["practice_admin"],
          targetRole: "practice_owner",
          memberCurrentRoles: ["practice_owner", "clinician"],
          ownerCount: 2,
        }),
      ),
    ).toBe("needs_owner");
  });
});
