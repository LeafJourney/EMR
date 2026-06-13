// EMR-435 — Publish-gate readiness checks (pure, no I/O).
//
// Structural (config-only) go-live requirements for a PracticeConfiguration.
// Kept free of DB/auth imports so it can be unit-tested in isolation and
// reused by the publish route handler. Cross-record checks that need the DB
// (an active provider, a CMS-Luhn-valid practice NPI) live in the handler.

/**
 * Returns the list of structurally-missing required fields for publish.
 * Specialty-adaptive — we never special-case a specific slug here.
 *
 * `enabledModalities` may be empty for some specialties but the ticket
 * requires at least one enabled modality at publish time. Clinical go-live
 * readiness also requires that clinicians have somewhere to document: at least
 * one charting template AND one workflow template — without these a practice
 * could publish a shell that renders no charting surface.
 */
export function findMissing(config: Record<string, unknown>): string[] {
  const missing: string[] = [];

  if (!config.selectedSpecialty) missing.push("selectedSpecialty");
  if (!config.careModel) missing.push("careModel");

  const settings = (config.settings ?? {}) as Record<string, unknown>;
  const enabled = (settings.enabledModalities ??
    (config as Record<string, unknown>).enabledModalities) as
    | unknown[]
    | undefined;

  if (!Array.isArray(enabled) || enabled.length === 0) {
    missing.push("enabledModalities");
  }

  const charting = config.chartingTemplateIds as unknown[] | undefined;
  if (!Array.isArray(charting) || charting.length === 0) {
    missing.push("chartingTemplateIds");
  }

  const workflows = config.workflowTemplateIds as unknown[] | undefined;
  if (!Array.isArray(workflows) || workflows.length === 0) {
    missing.push("workflowTemplateIds");
  }

  return missing;
}
