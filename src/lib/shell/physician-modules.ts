/**
 * PhysicianShell module resolver — EMR-445
 *
 * Pure projection from a (config, manifest) pair to the concrete set of
 * navigation items, Mission Control cards, chart sections, intake forms,
 * and CDS surfaces that the PhysicianShell will render.
 *
 * Architecture invariants (HARD constraints — see CLAUDE.md / Epic 2):
 *   - LeafJourney is specialty-adaptive, NOT cannabis-first. This resolver
 *     never branches on `specialty === 'cannabis-medicine'`. All variation
 *     comes from the manifest plus the PracticeConfiguration's modality
 *     state.
 *   - Pain Management acceptance gate: a Pain-Management published config
 *     rendered through this resolver MUST yield zero modules whose
 *     requirement set contains "cannabis-medicine". The resolver enforces
 *     this by mapping each known slug to its required modality and dropping
 *     any module whose requirement is not in the active modality set.
 *   - Cannabis-specific UI lives only behind <ModalityGate
 *     modality="cannabis-medicine"> at render time. This resolver still
 *     pre-filters statically so the shell shape is correct even before any
 *     gate evaluation.
 *
 * No React in this file. The renderer in
 * src/components/shell/physician-shell.tsx imports the output and maps
 * `componentRef` strings to existing components.
 */

import type { PracticeConfiguration } from "@/lib/practice-config/types";
import type { SpecialtyManifest } from "@/lib/specialty-templates/manifest-schema";
import {
  PHYSICIAN_SHELL_TEMPLATES,
  deriveSpecialtyPhysicianTemplate,
} from "@/lib/onboarding/known-shell-templates";

// ---------------------------------------------------------------------------
// Modality meta — minimal local shape so the resolver can run without a
// hard dep on EMR-410. The renderer in physician-shell.tsx imports the
// canonical MODALITY_META from "@/lib/modality/registry" and passes it in.
// ---------------------------------------------------------------------------

export interface ModalityMetaLike {
  /** Modalities that must also be enabled for this one to satisfy `requires`. */
  requires?: readonly string[];
}

export type ModalityMetaMap = Readonly<Record<string, ModalityMetaLike>>;

// ---------------------------------------------------------------------------
// Output types
// ---------------------------------------------------------------------------

export type PhysicianModuleKind =
  | "mission-control-card"
  | "nav-item"
  | "chart-section"
  | "intake-form"
  | "cds-card"
  | "module";

/**
 * One renderable surface in the shell. `componentRef` is a key the renderer
 * maps to a known existing component (under src/components/shell or
 * src/components/clinical / command / etc). Unknown slugs fall through to
 * `UnimplementedModuleNotice`.
 */
export interface PhysicianModule {
  slug: string;
  kind: PhysicianModuleKind;
  /** Required modality. Module is dropped if not in the active modality set. */
  requiresModality: string | null;
  /** Stable ref the renderer uses to pick a component. Never null. */
  componentRef: string;
  /** Static fallback path under src/components/. Useful for snapshots. */
  componentPath: string;
  /** Human-friendly title for fallback rendering. */
  title: string;
  /** True when no concrete component is wired up for this slug. */
  unimplemented: boolean;
}

export interface PhysicianModuleSet {
  kind: "ok";
  specialtySlug: string;
  specialtyName: string;
  careModel: string;
  activeModalities: string[];
  navItems: PhysicianModule[];
  missionControlCards: PhysicianModule[];
  chartSections: PhysicianModule[];
  intakeForms: PhysicianModule[];
  cdsCards: PhysicianModule[];
}

export interface PhysicianModuleError {
  kind: "unknown-specialty";
  slug: string | null;
  message: string;
}

export type PhysicianModuleResolution = PhysicianModuleSet | PhysicianModuleError;

// ---------------------------------------------------------------------------
// Slug → component / modality mapping
//
// This table is the single place the resolver knows about specific module
// slugs. It does NOT branch on specialty — every entry is keyed by the
// modality that owns the surface, which keeps cannabis cards out of a
// pain-management config automatically: the cannabis-medicine modality is
// not in the active set for that practice, so any module mapped to it is
// filtered out.
// ---------------------------------------------------------------------------

interface SlugRegistryEntry {
  componentRef: string;
  componentPath: string;
  title: string;
  requiresModality: string | null;
  /** When false, the renderer should use UnimplementedModuleNotice. */
  hasComponent: boolean;
}

/**
 * Known slugs the renderer can map to existing components. Keep in sync with
 * src/components/shell, src/components/command, src/components/clinical,
 * src/components/leafmart.
 *
 * Slugs without `hasComponent: true` still resolve cleanly — the shell
 * renders <UnimplementedModuleNotice> in their place. The shape stays
 * visible without crashing.
 */
const SLUG_REGISTRY: Readonly<Record<string, SlugRegistryEntry>> = {
  // ---- Mission Control cards (specialty-neutral) ----
  "todays-schedule": {
    componentRef: "command/ScheduleTile",
    componentPath: "components/command/schedule-tile.tsx",
    title: "Today's Schedule",
    requiresModality: null,
    hasComponent: true,
  },
  "open-charts": {
    componentRef: "command/ClinicalFlowTile",
    componentPath: "components/command/clinical-flow-tile.tsx",
    title: "Open Charts",
    requiresModality: null,
    hasComponent: true,
  },
  "messages-inbox": {
    componentRef: "command/MessagesTile",
    componentPath: "components/command/messages-tile.tsx",
    title: "Messages",
    requiresModality: null,
    hasComponent: true,
  },
  "refill-requests": {
    componentRef: "command/PatientImpactTile",
    componentPath: "components/command/patient-impact-tile.tsx",
    title: "Refill Requests",
    requiresModality: "medications",
    hasComponent: true,
  },

  // ---- Modality-gated Mission Control cards ----
  "lab-results-pending-review": {
    componentRef: "command/ClinicalDiscoveryTile",
    componentPath: "components/command/clinical-discovery-tile.tsx",
    title: "Lab Results — Pending Review",
    requiresModality: "labs",
    hasComponent: true,
  },
  "imaging-pending-review": {
    componentRef: "imaging/RadiologyReportPanel",
    componentPath: "components/imaging/radiology-report-panel.tsx",
    title: "Imaging — Pending Review",
    requiresModality: "imaging",
    hasComponent: true,
  },
  "procedure-board": {
    componentRef: "shell/ProcedureBoard",
    componentPath: "components/shell/procedure-board.tsx",
    title: "Procedure Board",
    requiresModality: "procedures",
    hasComponent: false,
  },
  "controlled-substance-monitoring": {
    componentRef: "shell/PdmpMonitor",
    componentPath: "components/shell/pdmp-monitor.tsx",
    title: "Controlled-Substance Monitoring",
    requiresModality: "pain-medications",
    hasComponent: false,
  },
  "certifications-due": {
    // Cannabis-specific surface — gated by cannabis-medicine modality.
    componentRef: "shell/CannabisCertificationsDue",
    componentPath: "components/shell/cannabis-certifications-due.tsx",
    title: "Certifications Due",
    requiresModality: "cannabis-medicine",
    hasComponent: false,
  },
  "outcome-checkins": {
    // Per-product post-dose check-ins — cannabis modality.
    componentRef: "shell/CannabisOutcomeCheckins",
    componentPath: "components/shell/cannabis-outcome-checkins.tsx",
    title: "Outcome Check-ins",
    requiresModality: "cannabis-medicine",
    hasComponent: false,
  },

  // ---- Modules (nav items) ----
  scheduling: {
    componentRef: "scheduling/CalendarGrid",
    componentPath: "components/scheduling/CalendarGrid.tsx",
    title: "Scheduling",
    requiresModality: null,
    hasComponent: true,
  },
  charting: {
    componentRef: "shell/PatientSectionNav",
    componentPath: "components/shell/PatientSectionNav.tsx",
    title: "Charting",
    requiresModality: null,
    hasComponent: true,
  },
  "patient-portal": {
    componentRef: "portal/PortalShell",
    componentPath: "components/portal/portal-shell.tsx",
    title: "Patient Portal",
    requiresModality: null,
    hasComponent: false,
  },
  billing: {
    componentRef: "shell/BillingNav",
    componentPath: "components/shell/billing-nav.tsx",
    title: "Billing",
    requiresModality: null,
    hasComponent: false,
  },
  labs: {
    componentRef: "clinical/LabExplainer",
    componentPath: "components/clinical/LabExplainer.tsx",
    title: "Labs",
    requiresModality: "labs",
    hasComponent: true,
  },
  imaging: {
    componentRef: "imaging/ClinicianImagingWorkspace",
    componentPath: "components/imaging/clinician-imaging-workspace.tsx",
    title: "Imaging",
    requiresModality: "imaging",
    hasComponent: true,
  },
  "e-prescribing": {
    componentRef: "prescribing/ContraindicationWarning",
    componentPath: "components/prescribing/ContraindicationWarning.tsx",
    title: "e-Prescribing",
    requiresModality: "medications",
    hasComponent: true,
  },
  "e-prescribing-controlled": {
    componentRef: "prescribing/ContraindicationWarning",
    componentPath: "components/prescribing/ContraindicationWarning.tsx",
    title: "e-Prescribing (Controlled)",
    requiresModality: "pain-medications",
    hasComponent: true,
  },
  referrals: {
    componentRef: "shell/ReferralsModule",
    componentPath: "components/shell/referrals-module.tsx",
    title: "Referrals",
    requiresModality: "referrals",
    hasComponent: false,
  },
  procedures: {
    componentRef: "shell/ProceduresModule",
    componentPath: "components/shell/procedures-module.tsx",
    title: "Procedures",
    requiresModality: "procedures",
    hasComponent: false,
  },
  "pdmp-check": {
    componentRef: "shell/PdmpCheckModule",
    componentPath: "components/shell/pdmp-check-module.tsx",
    title: "PDMP Check",
    requiresModality: "pain-medications",
    hasComponent: false,
  },
  "cannabis-recommendation": {
    componentRef: "shell/CannabisRecommendation",
    componentPath: "components/shell/modules/cannabis/recommendation.tsx",
    title: "Cannabis Recommendation",
    requiresModality: "cannabis-medicine",
    hasComponent: false,
  },
  "leafmart-commerce": {
    componentRef: "leafmart/ShopShelf",
    componentPath: "components/leafmart/ShopShelf.tsx",
    title: "Leafmart Commerce",
    requiresModality: "commerce-leafmart",
    hasComponent: true,
  },
  "outcome-tracking": {
    componentRef: "shell/OutcomeTracking",
    componentPath: "components/shell/modules/cannabis/outcome-tracking.tsx",
    title: "Outcome Tracking",
    requiresModality: "cannabis-medicine",
    hasComponent: false,
  },
};

/**
 * Heuristic fallback when a slug isn't in SLUG_REGISTRY: anything containing
 * "cannabis" or "leafmart" is gated by its respective modality so a
 * future-added cannabis slug can't accidentally bleed into a non-cannabis
 * config.
 */
function inferRequiredModality(slug: string): string | null {
  const lower = slug.toLowerCase();
  if (lower.includes("cannabis")) return "cannabis-medicine";
  if (lower.includes("leafmart")) return "commerce-leafmart";
  if (lower.includes("pdmp") || lower.includes("controlled-substance")) {
    return "pain-medications";
  }
  if (lower.includes("imaging") || lower.includes("radiology")) return "imaging";
  if (lower.includes("procedure")) return "procedures";
  if (lower.startsWith("lab-") || lower === "labs") return "labs";
  return null;
}

function lookupSlug(slug: string): SlugRegistryEntry {
  const known = SLUG_REGISTRY[slug];
  if (known) return known;
  const requiresModality = inferRequiredModality(slug);
  return {
    componentRef: "shell/UnimplementedModuleNotice",
    componentPath: requiresModality
      ? `components/shell/modules/${requiresModality}/${slug}.tsx`
      : `components/shell/modules/${slug}.tsx`,
    title: slug
      .split("-")
      .map((p) => (p.length > 0 ? p[0].toUpperCase() + p.slice(1) : p))
      .join(" "),
    requiresModality,
    hasComponent: false,
  };
}

// ---------------------------------------------------------------------------
// Active modality computation
// ---------------------------------------------------------------------------

/**
 * Compute the active modality set from a configuration:
 *   1. Start with `config.enabledModalities`.
 *   2. Subtract anything in `config.disabledModalities` (defense in depth —
 *      a published config should not have overlap, but if it does the
 *      disabled list wins).
 *   3. Drop any modality whose `requires` (per modalityMeta) is not also
 *      satisfied. Iterates to a fixed point so transitive requirements
 *      cascade correctly.
 */
export function computeActiveModalities(
  enabled: readonly string[],
  disabled: readonly string[],
  modalityMeta: ModalityMetaMap = {},
): string[] {
  const disabledSet = new Set(disabled);
  let active = new Set(enabled.filter((m) => !disabledSet.has(m)));

  // Iterate until no further modality is dropped. Bounded by the initial
  // size of the active set — a single drop per iteration in the worst case
  // would still terminate within `initialSize + 1` rounds.
  const initialSize = active.size;
  for (let i = 0; i < initialSize + 1; i++) {
    let dropped = false;
    for (const m of Array.from(active)) {
      const meta = modalityMeta[m];
      if (!meta?.requires) continue;
      for (const req of meta.requires) {
        if (!active.has(req)) {
          active.delete(m);
          dropped = true;
          break;
        }
      }
    }
    if (!dropped) break;
  }

  return Array.from(active).sort();
}

// ---------------------------------------------------------------------------
// Resolver
// ---------------------------------------------------------------------------

export interface ResolvePhysicianModulesOptions {
  modalityMeta?: ModalityMetaMap;
}

/**
 * Pure projection: (config, manifest) → renderable module set.
 *
 * Returns `{ kind: "unknown-specialty", ... }` when the manifest is null
 * (e.g. caller couldn't find a manifest for `config.selectedSpecialty`).
 * The renderer surfaces this as a "Configuration error" card.
 */
export function resolvePhysicianModules(
  config: Pick<
    PracticeConfiguration,
    "selectedSpecialty" | "careModel" | "enabledModalities" | "disabledModalities"
  > & {
    physicianShellTemplateId?: string | null;
    workflowTemplateIds?: string[];
  },
  manifest: SpecialtyManifest | null,
  options: ResolvePhysicianModulesOptions = {},
): PhysicianModuleResolution {
  if (!manifest) {
    return {
      kind: "unknown-specialty",
      slug: config.selectedSpecialty ?? null,
      message: `Configuration error — unknown specialty ${
        config.selectedSpecialty ?? "(none selected)"
      }. Contact your admin.`,
    };
  }

  const activeModalities = computeActiveModalities(
    config.enabledModalities ?? [],
    config.disabledModalities ?? [],
    options.modalityMeta,
  );
  const activeSet = new Set(activeModalities);

  const buildModule = (slug: string, kind: PhysicianModuleKind): PhysicianModule => {
    const entry = lookupSlug(slug);
    return {
      slug,
      kind,
      requiresModality: entry.requiresModality,
      componentRef: entry.componentRef,
      componentPath: entry.componentPath,
      title: entry.title,
      unimplemented: !entry.hasComponent,
    };
  };

  const modalitySatisfied = (m: PhysicianModule): boolean =>
    m.requiresModality === null || activeSet.has(m.requiresModality);

  let cardsSource = manifest.default_mission_control_cards;
  const templateId = config.physicianShellTemplateId;
  if (templateId) {
    let tpl = PHYSICIAN_SHELL_TEMPLATES.find((t) => t.id === templateId) ?? null;
    if (!tpl && templateId === `${manifest.slug}-physician-shell`) {
      tpl = deriveSpecialtyPhysicianTemplate(manifest.slug, manifest.name, manifest.default_mission_control_cards);
    }
    if (tpl) {
      cardsSource = tpl.cards;
    }
  }

  const missionControlCards = cardsSource
    .map((s) => buildModule(s, "mission-control-card"))
    .filter(modalitySatisfied);

  const navItems = manifest.default_modules
    .map((s) => buildModule(s, "nav-item"))
    .filter(modalitySatisfied);

  const chartSections = manifest.default_charting_templates
    .map((s) => buildModule(s, "chart-section"))
    .filter(modalitySatisfied);

  const workflowsSource = Array.isArray(config.workflowTemplateIds) && config.workflowTemplateIds.length > 0
    ? config.workflowTemplateIds
    : manifest.default_workflows;

  const intakeForms = workflowsSource
    .map((s) => buildModule(s, "intake-form"))
    .filter(modalitySatisfied);

  // CDS cards are derived from the active modality set rather than declared
  // explicitly on manifests yet — this keeps the shape stable while the
  // CDS surface (EMR-4xx) lands. For now every active modality contributes
  // at most one CDS slot keyed by `${modality}-cds`.
  const cdsCards: PhysicianModule[] = activeModalities.map((mod) =>
    buildModule(`${mod}-cds`, "cds-card"),
  );

  return {
    kind: "ok",
    specialtySlug: manifest.slug,
    specialtyName: manifest.name,
    careModel: manifest.default_care_model,
    activeModalities,
    navItems,
    missionControlCards,
    chartSections,
    intakeForms,
    cdsCards,
  };
}
