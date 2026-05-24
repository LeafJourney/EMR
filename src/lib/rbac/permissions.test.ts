import { describe, expect, it } from "vitest";
import type { Role } from "@prisma/client";
import {
  canEditSection,
  canViewSection,
  ForbiddenError,
  hasPermission,
  maskIfMissing,
  requirePermission,
  requiresCosignature,
} from "./permissions";

// EMR-786 — These tests lock in the role-permission matrix. If a role
// loses or gains a permission below, *something is changing about who
// can see PHI* — review carefully before bumping a snapshot.

function user(...roles: Role[]) {
  return { roles };
}

describe("hasPermission — front_office", () => {
  it("can read & edit demographics and billing", () => {
    const u = user("front_office");
    expect(hasPermission(u, "patient.demographics.read")).toBe(true);
    expect(hasPermission(u, "patient.demographics.edit")).toBe(true);
    expect(hasPermission(u, "billing.read")).toBe(true);
    expect(hasPermission(u, "billing.edit")).toBe(true);
  });

  it("is denied notes, clinical history, and sensitive diagnoses", () => {
    const u = user("front_office");
    expect(hasPermission(u, "notes.read")).toBe(false);
    expect(hasPermission(u, "notes.edit")).toBe(false);
    expect(hasPermission(u, "clinical_history.read")).toBe(false);
    expect(hasPermission(u, "sensitive_diagnoses.read")).toBe(false);
    expect(hasPermission(u, "prescriptions.read")).toBe(false);
  });
});

describe("hasPermission — back_office", () => {
  it("can read notes but cannot edit them", () => {
    const u = user("back_office");
    expect(hasPermission(u, "notes.read")).toBe(true);
    expect(hasPermission(u, "notes.edit")).toBe(false);
  });

  it("can edit billing", () => {
    expect(hasPermission(user("back_office"), "billing.edit")).toBe(true);
  });
});

describe("hasPermission — midlevel", () => {
  it("can view and edit notes", () => {
    const u = user("midlevel");
    expect(hasPermission(u, "notes.read")).toBe(true);
    expect(hasPermission(u, "notes.edit")).toBe(true);
  });

  it("carries notes.cosign_required so the workflow routes to clinician", () => {
    expect(hasPermission(user("midlevel"), "notes.cosign_required")).toBe(true);
    expect(requiresCosignature(user("midlevel"))).toBe(true);
  });

  it("a midlevel who is also a clinician does not need co-sign", () => {
    expect(requiresCosignature(user("midlevel", "clinician"))).toBe(false);
  });
});

describe("hasPermission — clinician", () => {
  it("does not require co-signature", () => {
    expect(requiresCosignature(user("clinician"))).toBe(false);
  });

  it("can manage chart privacy", () => {
    expect(hasPermission(user("clinician"), "chart.privacy.manage")).toBe(true);
  });
});

describe("requirePermission", () => {
  it("throws ForbiddenError on denial", () => {
    expect(() =>
      requirePermission(user("front_office"), "notes.edit"),
    ).toThrow(ForbiddenError);
  });

  it("is a no-op on success", () => {
    expect(() =>
      requirePermission(user("clinician"), "notes.edit"),
    ).not.toThrow();
  });
});

describe("maskIfMissing", () => {
  it("returns the value when the user has the permission", () => {
    expect(
      maskIfMissing(user("clinician"), "sensitive_diagnoses.read", "PTSD"),
    ).toBe("PTSD");
  });

  it("returns the mask when the user does not", () => {
    expect(
      maskIfMissing(user("front_office"), "sensitive_diagnoses.read", "PTSD"),
    ).toBe("[REDACTED]");
  });
});

describe("canViewSection / canEditSection", () => {
  it("front_office: demographics visible, notes hidden", () => {
    expect(canViewSection(user("front_office"), "demographics")).toBe(true);
    expect(canViewSection(user("front_office"), "notes")).toBe(false);
  });

  it("back_office: notes visible read-only", () => {
    expect(canViewSection(user("back_office"), "notes")).toBe(true);
    expect(canEditSection(user("back_office"), "notes")).toBe(false);
  });

  it("clinician: full edit on notes + demographics", () => {
    expect(canEditSection(user("clinician"), "notes")).toBe(true);
    expect(canEditSection(user("clinician"), "demographics")).toBe(true);
  });
});
