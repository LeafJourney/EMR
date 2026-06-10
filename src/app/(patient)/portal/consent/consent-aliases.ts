// EMR-1114 (PJ-2) — Registration ↔ portal consent template mapping.
//
// The registration packet (portal/registration/actions.ts) writes SignedConsent
// rows with its own template ids ("reg-*"). The portal consent page renders the
// richer DEFAULT_TEMPLATES ("consent-*"). This map declares which registration
// consents are equivalent to which portal templates so a consent signed during
// registration shows as Signed here and is never collected twice.

export const REGISTRATION_TEMPLATE_ALIASES: Record<string, string> = {
  "reg-treatment": "consent-treatment",
  "reg-privacy": "consent-hipaa",
  "reg-telehealth": "consent-telehealth",
};

/** Portal template id a stored row should count toward (identity for portal ids). */
export function canonicalTemplateId(templateId: string): string {
  return REGISTRATION_TEMPLATE_ALIASES[templateId] ?? templateId;
}

/** All stored template ids that satisfy a given portal template (itself + registration aliases). */
export function equivalentTemplateIds(portalTemplateId: string): string[] {
  const ids = [portalTemplateId];
  for (const [regId, portalId] of Object.entries(REGISTRATION_TEMPLATE_ALIASES)) {
    if (portalId === portalTemplateId) ids.push(regId);
  }
  return ids;
}
