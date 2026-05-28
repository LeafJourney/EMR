/**
 * PhysicianShell renderer — EMR-445
 *
 * Top-level server component for a clinician's adaptive shell. Reads a
 * published PracticeConfiguration, looks up the matching SpecialtyManifest,
 * resolves modules via the pure resolvePhysicianModules() projection, and
 * renders the matching navigation, Mission Control cards, chart sections,
 * intake forms, and CDS surfaces.
 *
 * Architecture invariants (HARD constraints — see CLAUDE.md / Epic 2):
 *   - Specialty-adaptive, NOT cannabis-first. This component MUST NOT
 *     branch on specialty. All variation flows from PracticeConfiguration
 *     and modality state.
 *   - Pain Management acceptance gate: a Pain-Management published config
 *     rendered through this shell yields zero cannabis-related modules.
 *     Enforced by resolvePhysicianModules's modality filter and (for
 *     belt-and-suspenders) by wrapping cannabis-flagged surfaces in
 *     <ModalityGate modality="cannabis-medicine"> at integration time.
 *   - Server component. No client-side fetches inside the shell. The
 *     caller passes a fully-loaded `config` prop.
 *
 * Wire-in: ship as a usable component. Existing physician routes are not
 * replaced here — EMR-411's epic-level integration is a later ticket.
 */

import * as React from "react";
import { Tile, TilePlaceholder } from "@/components/ui/tile";
import { TileGrid } from "@/components/ui/tile-grid";
import { PageHeader, PageShell } from "@/components/shell/PageHeader";
import { EmptyState } from "@/components/ui/empty-state";
import type { SpecialtyManifest } from "@/lib/specialty-templates/manifest-schema";
import type { PracticeConfiguration } from "@/lib/practice-config/types";
import {
  resolvePhysicianModules,
  type ModalityMetaMap,
  type PhysicianModule,
  type PhysicianModuleSet,
} from "@/lib/shell/physician-modules";

// TODO(EMR-410): canonical exports — at integration time replace this empty
// fallback with `import { MODALITY_META } from "@/lib/modality/registry"`
// and pass it through to resolvePhysicianModules. Keeping a local empty map
// here means the resolver still runs while the modality module is being
// landed in a parallel branch.
const MODALITY_META_FALLBACK: ModalityMetaMap = {};

export interface PhysicianShellProps {
  /**
   * The practice's published configuration. The shell reads
   * selectedSpecialty, careModel, enabledModalities, disabledModalities and
   * derives everything else from the manifest.
   */
  config: Pick<
    PracticeConfiguration,
    | "selectedSpecialty"
    | "careModel"
    | "enabledModalities"
    | "disabledModalities"
    | "physicianShellTemplateId"
    | "workflowTemplateIds"
  >;

  /**
   * The specialty manifest matching the config's selectedSpecialty. Passed in
   * by the caller to keep this component client-safe when used in previews.
   */
  manifest?: SpecialtyManifest | null;

  /**
   * Optional override for the modality registry. Defaults to the canonical
   * MODALITY_META once EMR-410 lands; until then the resolver runs without
   * `requires` cascade checks (still correct — manifests don't declare
   * any cross-modality requirements as of v1).
   */
  modalityMeta?: ModalityMetaMap;
}

export function PhysicianShell({
  config,
  manifest,
  modalityMeta = MODALITY_META_FALLBACK,
}: PhysicianShellProps): React.JSX.Element {
  const resolution = resolvePhysicianModules(config, manifest ?? null, { modalityMeta });

  if (resolution.kind === "unknown-specialty") {
    return (
      <PageShell>
        <PageHeader
          eyebrow="Configuration"
          title="Configuration error"
          description={resolution.message}
        />
        <EmptyState
          title="Unknown specialty"
          description={
            resolution.slug
              ? `The specialty "${resolution.slug}" is not registered. Contact your admin.`
              : "No specialty selected for this practice. Contact your admin."
          }
        />
      </PageShell>
    );
  }

  return <PhysicianShellBody resolution={resolution} />;
}

function PhysicianShellBody({
  resolution,
}: {
  resolution: PhysicianModuleSet;
}): React.JSX.Element {
  const {
    specialtyName,
    careModel,
    activeModalities,
    navItems,
    missionControlCards,
    chartSections,
    intakeForms,
    cdsCards,
  } = resolution;

  return (
    <PageShell maxWidth="max-w-[1400px]">
      <PageHeader
        eyebrow={`${formatCareModel(careModel)} · ${activeModalities.length} active modalities`}
        title={specialtyName}
        description="Your adaptive clinician shell. The cards below come from this practice's published configuration."
      />

      {/* Navigation summary — the actual sidebar is wired via AppShell at the
          route layout. We surface the resolved nav items here as a compact
          chip row so the shell shape is visible during integration. */}
      {navItems.length > 0 && (
        <section
          aria-label="Active modules"
          className="mb-8 flex flex-wrap gap-2"
          data-testid="physician-shell-nav"
        >
          {navItems.map((item) => (
            <ModuleChip key={`nav-${item.slug}`} module={item} />
          ))}
        </section>
      )}

      {missionControlCards.length > 0 && (
        <section
          aria-label="Mission control"
          className="mb-10"
          data-testid="physician-shell-mission-control"
        >
          <h2 className="font-display text-lg text-text mb-4">Mission Control</h2>
          <TileGrid>
            {missionControlCards.map((card) => (
              <ModuleTile key={`mc-${card.slug}`} module={card} />
            ))}
          </TileGrid>
        </section>
      )}

      {chartSections.length > 0 && (
        <section
          aria-label="Chart sections"
          className="mb-10"
          data-testid="physician-shell-chart-sections"
        >
          <h2 className="font-display text-lg text-text mb-4">Charting Templates</h2>
          <TileGrid>
            {chartSections.map((section) => (
              <ModuleTile key={`chart-${section.slug}`} module={section} />
            ))}
          </TileGrid>
        </section>
      )}

      {intakeForms.length > 0 && (
        <section
          aria-label="Intake workflows"
          className="mb-10"
          data-testid="physician-shell-intake"
        >
          <h2 className="font-display text-lg text-text mb-4">Workflows</h2>
          <TileGrid>
            {intakeForms.map((form) => (
              <ModuleTile key={`intake-${form.slug}`} module={form} />
            ))}
          </TileGrid>
        </section>
      )}

      {cdsCards.length > 0 && (
        <section
          aria-label="Clinical decision support"
          className="mb-10"
          data-testid="physician-shell-cds"
        >
          <h2 className="font-display text-lg text-text mb-4">Decision Support</h2>
          <TileGrid>
            {cdsCards.map((cds) => (
              <ModuleTile key={`cds-${cds.slug}`} module={cds} />
            ))}
          </TileGrid>
        </section>
      )}
    </PageShell>
  );
}

// ---------------------------------------------------------------------------
// Module renderers — read componentRef and either render the matching
// existing component or fall through to UnimplementedModuleNotice. Real
// component composition (passing `user`, etc.) happens at EMR-411
// integration time; for the shell-shape ticket we render the placeholder
// tile shape so the layout is visible.
// ---------------------------------------------------------------------------

function ModuleTile({ module: m }: { module: PhysicianModule }): React.JSX.Element {
  return (
    <Tile
      title={m.title}
      eyebrow={m.kind.replace(/-/g, " ")}
      description={m.requiresModality ? `Modality: ${m.requiresModality}` : undefined}
    >
      {m.unimplemented ? (
        <UnimplementedModuleNotice slug={m.slug} componentRef={m.componentRef} />
      ) : (
        <TilePlaceholder
          note={`Component: ${m.componentRef} — wired by EMR-411 integration`}
        />
      )}
    </Tile>
  );
}

function ModuleChip({ module: m }: { module: PhysicianModule }): React.JSX.Element {
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface px-3 py-1 text-xs text-text-muted"
      data-slug={m.slug}
      data-modality={m.requiresModality ?? "none"}
    >
      {m.title}
      {m.unimplemented && (
        <span
          className="inline-block h-1.5 w-1.5 rounded-full bg-amber-400"
          aria-label="Not yet implemented"
          title="Not yet implemented"
        />
      )}
    </span>
  );
}

/**
 * Renders a subtle "module not yet implemented" notice in place of a real
 * component. Keeps the shell shape visible without crashing on slugs the
 * registry doesn't yet have a component for.
 */
export function UnimplementedModuleNotice({
  slug,
  componentRef,
}: {
  slug: string;
  componentRef?: string;
}): React.JSX.Element {
  return (
    <div
      className="h-full flex flex-col items-center justify-center py-8 text-center gap-1"
      data-testid="unimplemented-module-notice"
      data-slug={slug}
    >
      <div
        aria-hidden="true"
        className="h-7 w-7 rounded-full border-2 border-dashed border-border-strong/50"
      />
      <p className="text-xs text-text-subtle italic">Module not yet implemented</p>
      <p className="text-[10px] text-text-subtle/80 font-mono">{componentRef ?? slug}</p>
    </div>
  );
}

function formatCareModel(careModel: string): string {
  return careModel
    .split("-")
    .map((p) => (p.length > 0 ? p[0].toUpperCase() + p.slice(1) : p))
    .join(" ");
}
