import { describe, expect, it } from "vitest";
import type { Role } from "@prisma/client";
import {
  canManageAgentFleet,
  canManageApprovalDefaults,
  canManageCredentialing,
} from "./ops-governance";

const u = (...roles: Role[]) => ({ roles });

describe("ops-governance role predicates", () => {
  it("agent fleet: operators and practice staff/owner may manage; clinicians/patients may not", () => {
    expect(canManageAgentFleet(u("operator"))).toBe(true);
    expect(canManageAgentFleet(u("practice_owner"))).toBe(true);
    expect(canManageAgentFleet(u("practice_admin"))).toBe(true);
    expect(canManageAgentFleet(u("super_admin"))).toBe(true);
    expect(canManageAgentFleet(u("clinician"))).toBe(false);
    expect(canManageAgentFleet(u("patient"))).toBe(false);
  });

  it("approval defaults: owner-level only (no plain operator)", () => {
    expect(canManageApprovalDefaults(u("practice_owner"))).toBe(true);
    expect(canManageApprovalDefaults(u("super_admin"))).toBe(true);
    expect(canManageApprovalDefaults(u("operator"))).toBe(false);
    expect(canManageApprovalDefaults(u("clinician"))).toBe(false);
  });

  it("credentialing: compliance/admin staff may manage", () => {
    expect(canManageCredentialing(u("operator"))).toBe(true);
    expect(canManageCredentialing(u("practice_admin"))).toBe(true);
    expect(canManageCredentialing(u("super_admin"))).toBe(true);
    expect(canManageCredentialing(u("patient"))).toBe(false);
  });

  it("honors multi-role users via union", () => {
    expect(canManageApprovalDefaults(u("clinician", "practice_owner"))).toBe(true);
  });
});
