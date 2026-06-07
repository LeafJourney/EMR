// Pure types and presentation helpers for the practices landing page.
// Kept free of any server-only imports so it can be consumed by both the
// server loader and the client card component.

export type PracticeStakeholder = {
  userId: string;
  name: string;
  email: string;
  role: string;
  title?: string | null;
};

export type PracticeKpi = {
  providerCount: number;
  activeProviderCount: number;
  patientCount: number;
  claimCount: number;
  claimsLast30: number;
  billedCents: number;
  paidCents: number;
  gatewayChargeCents: number;
  encounterCount: number;
  encountersLast30: number;
};

export type PracticeCardData = {
  practiceId: string | null;
  configId: string | null;
  organizationId: string;
  organizationName: string;
  practiceName: string;
  brandName: string | null;
  legalName: string | null;
  city: string | null;
  state: string | null;
  timeZone: string | null;
  primaryContactName: string | null;
  primaryContactEmail: string | null;
  specialty: string | null;
  specialtyVersion: string | null;
  careModel: string | null;
  enabledModalities: string[];
  status: string;
  publishedAt: string | null;
  updatedAt: string | null;
  // EMR — real-readiness enrichment (detail page only; optional so the list
  // loader needn't populate it).
  npi?: string | null;
  launch?: {
    readinessScore: number;
    blockers: string[];
    goLiveAt: string | null;
  } | null;
  specialtyCoverage?: {
    workflows: boolean;
    charting: boolean;
    roles: boolean;
    physicianShell: boolean;
    patientShell: boolean;
  };
  officeManagers: PracticeStakeholder[];
  leadProviders: PracticeStakeholder[];
  kpi: PracticeKpi;
};

export const ZERO_KPI: PracticeKpi = {
  providerCount: 0,
  activeProviderCount: 0,
  patientCount: 0,
  claimCount: 0,
  claimsLast30: 0,
  billedCents: 0,
  paidCents: 0,
  gatewayChargeCents: 0,
  encounterCount: 0,
  encountersLast30: 0,
};

/** Pretty-print a slug like "primary-care@1" → "Primary care". */
export function humanizeSpecialty(slug: string | null | undefined): string {
  if (!slug) return "Specialty not selected";
  const base = slug.split("@")[0] ?? slug;
  return base
    .split("-")
    .map((word) => (word ? word[0].toUpperCase() + word.slice(1) : word))
    .join(" ");
}

/** Pretty-print a care-model slug like "in_person" → "In person". */
export function humanizeCareModel(value: string | null | undefined): string {
  if (!value) return "—";
  return value.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());
}
