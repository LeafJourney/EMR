// Pre-visit *completion* reminder copy. STRICTLY no PHI.
//
// This is distinct from the appointment reminders in ./templates.ts (which
// greet the patient by name and name the provider). A pre-visit completion
// nudge is sent only when required intake items remain incomplete, and it must
// reveal nothing about the patient, the visit, or the clinical context — it
// says only "you have pre-visit items ready" and links to the bare portal
// origin. Identity/appointment specifics live behind portal login.
//
// Kept pure + deterministic so the "no PHI" property is unit-testable and the
// nudge can be sent from a cron tick with no token cost.

export type PrevisitMilestone = "7day" | "2day" | "morning_of";

export interface PrevisitReminderInput {
  /** Generic portal origin, e.g. https://portal.leafjourney.com. No path/query. */
  portalUrl: string;
}

export const PREVISIT_PORTAL_CTA = "Finish your pre-visit check-in";

const URGENCY: Record<PrevisitMilestone, string> = {
  "7day": "before your upcoming visit",
  "2day": "before your visit in 2 days",
  morning_of: "before your visit today",
};

/**
 * Guard against a portal URL carrying a path/query/hash — a classic vector for
 * smuggling an appointment id / DOB / token into otherwise "no PHI" copy. We
 * only ever link to the bare https origin.
 */
function assertGenericPortalUrl(portalUrl: string): string {
  let parsed: URL;
  try {
    parsed = new URL(portalUrl);
  } catch {
    throw new Error(`Invalid portal url: ${portalUrl}`);
  }
  if (parsed.protocol !== "https:") {
    throw new Error("Invalid portal url: must be https");
  }
  const hasExtras =
    (parsed.pathname && parsed.pathname !== "/") ||
    parsed.search !== "" ||
    parsed.hash !== "";
  if (hasExtras) {
    throw new Error(
      "Invalid portal url: pre-visit reminders link to the bare origin only (no path/query/hash)",
    );
  }
  return parsed.origin;
}

/**
 * Render the SMS/email/push body for a pre-visit completion nudge. Single
 * sentence + single link so it fits one SMS segment and reads the same across
 * channels. No greeting-by-name (PHI) — the CTA stands on its own.
 */
export function renderPrevisitReminder(
  milestone: PrevisitMilestone,
  input: PrevisitReminderInput,
): string {
  const origin = assertGenericPortalUrl(input.portalUrl);
  const urgency = URGENCY[milestone];
  return `You have pre-visit items ready. ${PREVISIT_PORTAL_CTA} ${urgency}: ${origin}`;
}
