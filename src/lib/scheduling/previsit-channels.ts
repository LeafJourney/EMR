// EMR-914 — which channels a pre-visit completion nudge should go out on for a
// given patient, derived from CommunicationPreference.
//
// PRODUCT DECISION (opt-OUT model): a channel is used whenever the patient is
// reachable on it AND hasn't EXPLICITLY turned it off. This preserves today's
// behaviour (SMS to anyone with a phone) and *adds* email + in-app, rather than
// silently going dark by gating SMS on the default-false `smsOptIn`. The
// explicit off switches are:
//   - SMS:   per-category `sms: false`
//   - Email: `emailFrequency === "off"` OR per-category `email: false`
//   - In-app: requires a portal account; per-category `inapp: false`
// No CommunicationPreference row at all ⇒ every reachable channel is used.
//
// Pure + deterministic so the policy is unit-testable away from the DB.

export type PrevisitChannel = "sms" | "email" | "inapp";

/** Per-category channel toggles, read from `CommunicationPreference.preferences`. */
export interface PrevisitCategoryToggles {
  sms?: boolean;
  email?: boolean;
  inapp?: boolean;
}

export interface PrevisitChannelPrefs {
  /** `CommunicationPreference.emailFrequency`; "off" suppresses email. */
  emailFrequency?: string | null;
  /** `preferences.previsit ?? preferences.appointments` toggles. */
  category?: PrevisitCategoryToggles | null;
}

export interface PrevisitChannelInputs {
  /** True only when the patient has a deliverable (normalizable) phone. */
  hasPhone: boolean;
  /** True only when the patient has an email on file. */
  hasEmail: boolean;
  /** True only when the patient has a linked portal User (for in-app). */
  hasPortalUser: boolean;
  /** The patient's preferences, or null when there is no row. */
  prefs: PrevisitChannelPrefs | null;
}

export function resolvePrevisitChannels(input: PrevisitChannelInputs): PrevisitChannel[] {
  const cat = input.prefs?.category ?? {};
  const channels: PrevisitChannel[] = [];

  // SMS — opt-out: send unless explicitly disabled for this category.
  if (input.hasPhone && cat.sms !== false) channels.push("sms");

  // Email — needs an address, a non-"off" frequency, and category not disabled.
  const emailFrequency = input.prefs?.emailFrequency ?? "instant";
  if (input.hasEmail && emailFrequency !== "off" && cat.email !== false) {
    channels.push("email");
  }

  // In-app — only patients with a portal account, category not disabled.
  if (input.hasPortalUser && cat.inapp !== false) channels.push("inapp");

  return channels;
}

/**
 * Pull the pre-visit category toggles out of the free-form
 * `CommunicationPreference.preferences` JSON. Prefers a `previsit` block, falls
 * back to the broader `appointments` block, and tolerates any shape (returns an
 * empty object when absent/malformed, so the opt-out default stands).
 */
export function readPrevisitCategoryToggles(preferences: unknown): PrevisitCategoryToggles {
  if (!preferences || typeof preferences !== "object") return {};
  const p = preferences as Record<string, unknown>;
  const block = (p.previsit ?? p.appointments) as Record<string, unknown> | undefined;
  if (!block || typeof block !== "object") return {};
  const pick = (v: unknown): boolean | undefined => (typeof v === "boolean" ? v : undefined);
  return { sms: pick(block.sms), email: pick(block.email), inapp: pick(block.inapp) };
}
