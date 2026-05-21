// EMR-746 — Human labels for PracticeConfiguration JSON keys.
//
// Used by the version diff viewer to render "Selected specialty changed
// from Internal Medicine to Cardiology" instead of `selectedSpecialty:
// internal_medicine → cardiology`. The map covers every field on the
// PracticeConfiguration Prisma model; unknown keys fall back to a
// camelCase-to-Sentence-case humanizer.

const LABELS: Record<string, string> = {
  id: "Configuration ID",
  organizationId: "Organization",
  practiceId: "Practice",
  selectedSpecialty: "Selected specialty",
  selectedSpecialtyVersion: "Specialty version",
  careModel: "Care model",
  enabledModalities: "Enabled modalities",
  disabledModalities: "Disabled modalities",
  workflowTemplateIds: "Workflow templates",
  chartingTemplateIds: "Charting templates",
  rolePermissionTemplateIds: "Role-permission templates",
  physicianShellTemplateId: "Physician shell template",
  patientShellTemplateId: "Patient shell template",
  migrationProfileId: "Migration profile",
  regulatoryFlags: "Regulatory flags",
  status: "Status",
  version: "Version",
  publishedAt: "Published at",
  publishedBy: "Published by",
  createdAt: "Created at",
  updatedAt: "Updated at",
};

const PATH_SEPARATOR = ".";

/** Humanizes a camelCase identifier as a fallback ("careModel" → "Care model"). */
function humanizeIdentifier(input: string): string {
  if (!input) return input;
  // Split camelCase / snake_case / kebab-case
  const tokens = input
    .replace(/[_-]+/g, " ")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .toLowerCase()
    .split(/\s+/);
  if (tokens.length === 0) return input;
  return tokens
    .map((t, i) => (i === 0 ? t.charAt(0).toUpperCase() + t.slice(1) : t))
    .join(" ");
}

/**
 * Translate a dotted JSON path into a human-readable label.
 *
 * Examples:
 *   labelFor("selectedSpecialty")       → "Selected specialty"
 *   labelFor("regulatoryFlags.hipaa")   → "Regulatory flags · Hipaa"
 *   labelFor("enabledModalities.0")     → "Enabled modalities · Item 1"
 */
export function labelFor(path: string): string {
  if (!path) return "";
  const segments = path.split(PATH_SEPARATOR);
  return segments
    .map((seg, i) => {
      const key = segments.slice(0, i + 1).join(PATH_SEPARATOR);
      const exact = LABELS[key] ?? LABELS[seg];
      if (exact) return exact;
      // Numeric array index → "Item N+1" (1-based for the UI)
      if (/^\d+$/.test(seg)) return `Item ${Number(seg) + 1}`;
      return humanizeIdentifier(seg);
    })
    .join(" · ");
}

export { LABELS as PRACTICE_CONFIG_LABELS };
