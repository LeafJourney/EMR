/**
 * Cannabis / Psilocybin module gating.
 *
 * Dr. Patel's directive (EMR-873, EMR-859, EMR-881, EMR-883): cannabis and
 * psilocybin are *modular* layers of the EMR. If the provider/org has not
 * opted in, EVERY trace — words, bubbles, workflows, dose-log trackers —
 * must be scrubbed from the chart.
 *
 * We cannot add a schema column (track constraint), so opt-in is resolved
 * from data we already have plus an org-level allowlist env override. The
 * default for LeafJourney (a cannabis clinic) is opted-IN for cannabis;
 * psilocybin defaults OFF until explicitly enabled. Either can be forced
 * via env without a migration.
 */

export type ControlledModule = "cannabis" | "psilocybin";

export interface ModuleFlags {
  cannabis: boolean;
  psilocybin: boolean;
}

export interface ModuleSignals {
  /** True if the org has any active cannabis product formulary. */
  hasCannabisFormulary?: boolean;
  /** True if the patient has any cannabis dosing regimen on file. */
  hasCannabisRegimen?: boolean;
  /** Explicit per-org override, e.g. from organization settings JSON. */
  orgOptIn?: Partial<ModuleFlags>;
}

/**
 * Parse a comma list env var like `psilocybin,cannabis` into flags. Used to
 * force-enable a module org-wide without a DB change.
 */
function envModules(raw: string | undefined): Partial<ModuleFlags> {
  if (!raw) return {};
  const set = new Set(
    raw
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean),
  );
  const out: Partial<ModuleFlags> = {};
  if (set.has("cannabis")) out.cannabis = true;
  if (set.has("psilocybin")) out.psilocybin = true;
  return out;
}

/**
 * Resolve which controlled modules are active for this render.
 *
 * Precedence (highest first): explicit org opt-in → env override → data
 * signals → defaults (cannabis on, psilocybin off).
 */
export function resolveModuleFlags(signals: ModuleSignals = {}): ModuleFlags {
  const env = envModules(
    typeof process !== "undefined" ? process.env?.LEAFJOURNEY_MODULES : undefined,
  );

  const cannabisDefault =
    signals.hasCannabisFormulary || signals.hasCannabisRegimen || true; // cannabis clinic → on by default
  const psilocybinDefault = false;

  return {
    cannabis:
      signals.orgOptIn?.cannabis ??
      env.cannabis ??
      Boolean(cannabisDefault),
    psilocybin:
      signals.orgOptIn?.psilocybin ??
      env.psilocybin ??
      psilocybinDefault,
  };
}

/** Convenience: is *either* controlled module active? */
export function anyControlledModule(flags: ModuleFlags): boolean {
  return flags.cannabis || flags.psilocybin;
}

/**
 * Scrub cannabis/psilocybin references from a free-text string when the
 * corresponding module is off. Conservative: collapses the resulting double
 * spaces but never invents wording. Used to clean section titles like
 * "Cannabis Rx" / "Cannabis Prescription" when the module is disabled
 * (EMR-873, EMR-883).
 */
export function scrubModuleWords(text: string, flags: ModuleFlags): string {
  let out = text;
  if (!flags.cannabis) {
    out = out.replace(/\bcannabis\b/gi, "");
  }
  if (!flags.psilocybin) {
    out = out.replace(/\bpsilocybin\b/gi, "");
  }
  return out.replace(/\s{2,}/g, " ").trim();
}
