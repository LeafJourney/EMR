/**
 * PhysicianShell renderer — module-resolution tests (EMR-445)
 *
 * Vitest config in this repo runs `src/**\/*.test.ts` in a node environment
 * with no DOM and no @testing-library/react available. So we test the pure
 * projection function `resolvePhysicianModules` rather than rendering JSX.
 * That's enough to lock down the shell-shape acceptance criteria:
 *
 *   1. Pain Management published config → ZERO modules whose slug contains
 *      "cannabis" or whose component path is under modules/cannabis/.
 *   2. Internal Medicine likewise excludes cannabis.
 *   3. Cannabis Medicine includes cannabis-flagged surfaces.
 *   4. Three configs through the same resolver produce three distinctly-
 *      shaped shells.
 *
 * Configs are constructed inline — no DB, no Prisma, no network. Manifests
 * are loaded via the existing registry (already validated at module-init).
 */

import { describe, expect, it } from "vitest";

import { getSpecialtyTemplate } from "@/lib/specialty-templates/registry";
import {
  computeActiveModalities,
  resolvePhysicianModules,
  type PhysicianModule,
  type PhysicianModuleResolution,
  type PhysicianModuleSet,
} from "@/lib/shell/physician-modules";
import type { PracticeConfiguration } from "@/lib/practice-config/types";

type ConfigSeed = Pick<
  PracticeConfiguration,
  | "selectedSpecialty"
  | "careModel"
  | "enabledModalities"
  | "disabledModalities"
>;

function syntheticConfig(slug: string): ConfigSeed {
  const manifest = getSpecialtyTemplate(slug);
  if (!manifest) throw new Error(`fixture: unknown specialty ${slug}`);
  return {
    selectedSpecialty: manifest.slug,
    careModel: manifest.default_care_model,
    enabledModalities: [...manifest.default_enabled_modalities],
    disabledModalities: [...manifest.default_disabled_modalities],
  };
}

function assertOk(
  resolution: PhysicianModuleResolution,
): asserts resolution is PhysicianModuleSet {
  if (resolution.kind !== "ok") {
    throw new Error(`expected ok resolution, got ${resolution.kind}`);
  }
}

function allModules(set: PhysicianModuleSet): PhysicianModule[] {
  return [
    ...set.navItems,
    ...set.missionControlCards,
    ...set.chartSections,
    ...set.intakeForms,
    ...set.cdsCards,
  ];
}

function moduleSlugs(modules: PhysicianModule[]): string[] {
  return modules.map((m) => m.slug);
}

describe("resolvePhysicianModules", () => {
  // ------------------------------------------------------------------
  // P0 acceptance gate: Pain Management non-cannabis must yield ZERO
  // cannabis-related modules.
  // ------------------------------------------------------------------
  it("excludes ALL cannabis-related modules from a Pain Management config", () => {
    const config = syntheticConfig("pain-management-non-cannabis");
    const manifest = getSpecialtyTemplate("pain-management-non-cannabis");
    const result = resolvePhysicianModules(config, manifest);
    assertOk(result);

    const modules = allModules(result);
    expect(modules.length).toBeGreaterThan(0);

    for (const m of modules) {
      expect(m.slug.toLowerCase()).not.toContain("cannabis");
      expect(m.componentPath).not.toMatch(/modules\/cannabis\//);
      expect(m.requiresModality).not.toBe("cannabis-medicine");
      expect(m.requiresModality).not.toBe("commerce-leafmart");
    }

    // active modality set must not contain cannabis-medicine — explicit
    // disable, not absence (matches manifest invariant from EMR-408).
    expect(result.activeModalities).not.toContain("cannabis-medicine");
    expect(result.activeModalities).not.toContain("commerce-leafmart");

    // structural snapshot — locks the resolved shape so a regression is
    // visible in test output.
    expect({
      specialtySlug: result.specialtySlug,
      activeModalities: result.activeModalities,
      navItems: moduleSlugs(result.navItems),
      missionControlCards: moduleSlugs(result.missionControlCards),
      chartSections: moduleSlugs(result.chartSections),
      intakeForms: moduleSlugs(result.intakeForms),
      cdsCards: moduleSlugs(result.cdsCards),
    }).toEqual({
      specialtySlug: "pain-management-non-cannabis",
      activeModalities: [
        "functional-pain",
        "imaging",
        "pain-medications",
        "patient-reported-outcomes",
        "physical-therapy",
        "procedures",
        "referrals",
      ],
      navItems: [
        "scheduling",
        "charting",
        "imaging",
        "procedures",
        "e-prescribing-controlled",
        "referrals",
        "patient-portal",
        "billing",
        "pdmp-check",
      ],
      missionControlCards: [
        "todays-schedule",
        "procedure-board",
        "open-charts",
        "imaging-pending-review",
        "controlled-substance-monitoring",
        "messages-inbox",
        // refill-requests requires "medications" which is NOT in the
        // pain-management active set (pain-medications is) — so it drops.
      ],
      chartSections: ["pain-consult", "pain-followup", "procedure-note"],
      intakeForms: [
        "new-pain-consult",
        "pain-followup",
        "procedure-note",
        "imaging-review",
        "medication-review",
      ],
      cdsCards: [
        "functional-pain-cds",
        "imaging-cds",
        "pain-medications-cds",
        "patient-reported-outcomes-cds",
        "physical-therapy-cds",
        "procedures-cds",
        "referrals-cds",
      ],
    });
  });

  // ------------------------------------------------------------------
  // Internal Medicine likewise excludes cannabis.
  // ------------------------------------------------------------------
  it("excludes cannabis modules from an Internal Medicine config", () => {
    const config = syntheticConfig("internal-medicine");
    const manifest = getSpecialtyTemplate("internal-medicine");
    const result = resolvePhysicianModules(config, manifest);
    assertOk(result);

    const modules = allModules(result);
    expect(modules.length).toBeGreaterThan(0);

    for (const m of modules) {
      expect(m.slug.toLowerCase()).not.toContain("cannabis");
      expect(m.componentPath).not.toMatch(/modules\/cannabis\//);
      expect(m.requiresModality).not.toBe("cannabis-medicine");
      expect(m.requiresModality).not.toBe("commerce-leafmart");
    }

    expect(result.activeModalities).not.toContain("cannabis-medicine");
    expect(result.activeModalities).not.toContain("commerce-leafmart");

    expect({
      specialtySlug: result.specialtySlug,
      activeModalities: result.activeModalities,
      navItems: moduleSlugs(result.navItems),
      missionControlCards: moduleSlugs(result.missionControlCards),
      chartSections: moduleSlugs(result.chartSections),
      intakeForms: moduleSlugs(result.intakeForms),
      cdsCards: moduleSlugs(result.cdsCards),
    }).toEqual({
      specialtySlug: "internal-medicine",
      activeModalities: [
        "imaging",
        "labs",
        "lifestyle",
        "medications",
        "patient-reported-outcomes",
        "referrals",
      ],
      navItems: [
        "scheduling",
        "charting",
        "labs",
        "imaging",
        "e-prescribing",
        "referrals",
        "patient-portal",
        "billing",
      ],
      missionControlCards: [
        "todays-schedule",
        "open-charts",
        "lab-results-pending-review",
        "imaging-pending-review",
        "messages-inbox",
        "refill-requests",
      ],
      chartSections: ["soap-note", "annual-wellness-note", "problem-focused-note"],
      intakeForms: [
        "new-patient-intake",
        "annual-wellness",
        "chronic-condition-followup",
        "lab-review",
        "medication-reconciliation",
      ],
      cdsCards: [
        "imaging-cds",
        "labs-cds",
        "lifestyle-cds",
        "medications-cds",
        "patient-reported-outcomes-cds",
        "referrals-cds",
      ],
    });
  });

  // ------------------------------------------------------------------
  // Cannabis Medicine — cannabis-flagged surfaces ARE present.
  // ------------------------------------------------------------------
  it("includes cannabis nav and Mission Control items for a Cannabis Medicine config", () => {
    const config = syntheticConfig("cannabis-medicine");
    const manifest = getSpecialtyTemplate("cannabis-medicine");
    const result = resolvePhysicianModules(config, manifest);
    assertOk(result);

    expect(result.activeModalities).toContain("cannabis-medicine");
    expect(result.activeModalities).toContain("commerce-leafmart");

    // Affirmative checks — cannabis-specific slugs survive resolution.
    const allSlugs = moduleSlugs(allModules(result));
    expect(allSlugs).toContain("certifications-due");
    expect(allSlugs).toContain("outcome-checkins");
    expect(allSlugs).toContain("cannabis-recommendation");
    expect(allSlugs).toContain("leafmart-commerce");
    expect(allSlugs).toContain("outcome-tracking");
    expect(allSlugs).toContain("cannabis-medicine-cds");
    expect(allSlugs).toContain("commerce-leafmart-cds");

    expect({
      specialtySlug: result.specialtySlug,
      activeModalities: result.activeModalities,
      navItems: moduleSlugs(result.navItems),
      missionControlCards: moduleSlugs(result.missionControlCards),
      chartSections: moduleSlugs(result.chartSections),
      intakeForms: moduleSlugs(result.intakeForms),
      cdsCards: moduleSlugs(result.cdsCards),
    }).toEqual({
      specialtySlug: "cannabis-medicine",
      activeModalities: [
        "cannabis-medicine",
        "commerce-leafmart",
        "lifestyle",
        "medications",
        "patient-reported-outcomes",
      ],
      navItems: [
        "scheduling",
        "charting",
        "e-prescribing",
        "patient-portal",
        "billing",
        "cannabis-recommendation",
        "leafmart-commerce",
        "outcome-tracking",
      ],
      missionControlCards: [
        "todays-schedule",
        "open-charts",
        "certifications-due",
        "outcome-checkins",
        "messages-inbox",
      ],
      chartSections: ["cannabis-certification-note", "followup-note"],
      intakeForms: [
        "cannabis-certification",
        "dosing-titration",
        "outcome-followup",
      ],
      cdsCards: [
        "cannabis-medicine-cds",
        "commerce-leafmart-cds",
        "lifestyle-cds",
        "medications-cds",
        "patient-reported-outcomes-cds",
      ],
    });
  });

  // ------------------------------------------------------------------
  // Same renderer, three distinctly-shaped shells.
  // ------------------------------------------------------------------
  it("produces three distinctly-shaped shells from one resolver (specialty-adaptive)", () => {
    const im = resolvePhysicianModules(
      syntheticConfig("internal-medicine"),
      getSpecialtyTemplate("internal-medicine"),
    );
    const pm = resolvePhysicianModules(
      syntheticConfig("pain-management-non-cannabis"),
      getSpecialtyTemplate("pain-management-non-cannabis"),
    );
    const cm = resolvePhysicianModules(
      syntheticConfig("cannabis-medicine"),
      getSpecialtyTemplate("cannabis-medicine"),
    );
    assertOk(im);
    assertOk(pm);
    assertOk(cm);

    const imShape = JSON.stringify({
      nav: moduleSlugs(im.navItems),
      mc: moduleSlugs(im.missionControlCards),
      mods: im.activeModalities,
    });
    const pmShape = JSON.stringify({
      nav: moduleSlugs(pm.navItems),
      mc: moduleSlugs(pm.missionControlCards),
      mods: pm.activeModalities,
    });
    const cmShape = JSON.stringify({
      nav: moduleSlugs(cm.navItems),
      mc: moduleSlugs(cm.missionControlCards),
      mods: cm.activeModalities,
    });

    expect(imShape).not.toBe(pmShape);
    expect(pmShape).not.toBe(cmShape);
    expect(imShape).not.toBe(cmShape);
  });

  // ------------------------------------------------------------------
  // Unknown specialty → fallback resolution, not a crash.
  // ------------------------------------------------------------------
  it("returns an unknown-specialty resolution when the manifest is null", () => {
    const result = resolvePhysicianModules(
      {
        selectedSpecialty: "not-a-real-specialty",
        careModel: null,
        enabledModalities: [],
        disabledModalities: [],
      },
      null,
    );
    expect(result.kind).toBe("unknown-specialty");
    if (result.kind === "unknown-specialty") {
      expect(result.slug).toBe("not-a-real-specialty");
      expect(result.message).toMatch(/Configuration error/);
    }
  });

  // ------------------------------------------------------------------
  // Specialty-blindness invariant: the resolver must not branch on slug.
  // We verify this behaviorally by feeding a custom manifest whose slug
  // is "cannabis-medicine" but with non-cannabis modalities — the
  // resolver should still drop the cannabis surfaces because the
  // modality set decides, not the slug.
  // ------------------------------------------------------------------
  it("does not branch on specialty slug — modality set decides cannabis surfaces", () => {
    const cannabisManifest = getSpecialtyTemplate("cannabis-medicine");
    expect(cannabisManifest).not.toBeNull();

    // Override: turn cannabis-medicine OFF in the config even though the
    // manifest is the cannabis one. A resolver that branches on slug would
    // still emit cannabis surfaces. A specialty-adaptive resolver drops
    // them because the active modality set excludes cannabis-medicine.
    const config: ConfigSeed = {
      selectedSpecialty: "cannabis-medicine",
      careModel: cannabisManifest!.default_care_model,
      enabledModalities: ["medications", "lifestyle"],
      disabledModalities: ["cannabis-medicine", "commerce-leafmart"],
    };

    const result = resolvePhysicianModules(config, cannabisManifest);
    assertOk(result);
    expect(result.activeModalities).not.toContain("cannabis-medicine");
    for (const m of allModules(result)) {
      expect(m.requiresModality).not.toBe("cannabis-medicine");
      expect(m.requiresModality).not.toBe("commerce-leafmart");
      expect(m.componentPath).not.toMatch(/modules\/cannabis\//);
    }
  });

  it("uses custom physicianShellTemplateId cards and custom workflowTemplateIds", () => {
    const config = {
      selectedSpecialty: "internal-medicine",
      careModel: "longitudinal",
      enabledModalities: ["medications", "labs", "imaging"],
      disabledModalities: [],
      physicianShellTemplateId: "physician-shell-clinic-day",
      workflowTemplateIds: ["lab-review", "medication-reconciliation"],
    };
    const manifest = getSpecialtyTemplate("internal-medicine");
    const result = resolvePhysicianModules(config, manifest);
    assertOk(result);

    const cardSlugs = result.missionControlCards.map((c) => c.slug);
    expect(cardSlugs).toEqual(["todays-schedule", "open-charts", "messages-inbox", "refill-requests"]);

    const workflowSlugs = result.intakeForms.map((w) => w.slug);
    expect(workflowSlugs).toEqual(["lab-review", "medication-reconciliation"]);
  });
});

describe("computeActiveModalities", () => {
  it("subtracts disabled modalities", () => {
    expect(
      computeActiveModalities(["medications", "labs", "imaging"], ["imaging"]),
    ).toEqual(["labs", "medications"]);
  });

  it("drops modalities whose `requires` is unsatisfied", () => {
    const meta = {
      "commerce-leafmart": { requires: ["cannabis-medicine"] },
    };
    expect(
      computeActiveModalities(["commerce-leafmart"], [], meta),
    ).toEqual([]);
    expect(
      computeActiveModalities(
        ["cannabis-medicine", "commerce-leafmart"],
        [],
        meta,
      ),
    ).toEqual(["cannabis-medicine", "commerce-leafmart"]);
  });

  it("cascades transitive requirement failures to a fixed point", () => {
    const meta = {
      a: { requires: ["b"] },
      b: { requires: ["c"] },
      c: { requires: ["d"] }, // d never enabled → c drops → b drops → a drops
    };
    expect(computeActiveModalities(["a", "b", "c"], [], meta)).toEqual([]);
  });
});
