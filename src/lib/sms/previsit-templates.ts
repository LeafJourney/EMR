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

export interface PrevisitEmailContent {
  subject: string;
  /** Plain-text fallback (also the body for text-only clients). */
  text: string;
  /** Minimal branded HTML. Still STRICTLY PHI-free — no name, no visit detail. */
  html: string;
}

/**
 * Render the EMAIL form of the pre-visit completion nudge. Branded but under the
 * same PHI-free contract as the SMS copy: it names no patient, no provider, no
 * appointment, and links only to the bare portal origin. The subject is generic
 * so it leaks nothing in a lock-screen preview.
 */
export function renderPrevisitEmail(
  milestone: PrevisitMilestone,
  input: PrevisitReminderInput,
): PrevisitEmailContent {
  const origin = assertGenericPortalUrl(input.portalUrl);
  const urgency = URGENCY[milestone];
  const subject = PREVISIT_PORTAL_CTA;
  const text = `You have pre-visit items ready. ${PREVISIT_PORTAL_CTA} ${urgency}: ${origin}`;
  const html = [
    `<div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:480px;margin:0 auto;padding:24px;color:#1a1a1a">`,
    `<h1 style="font-size:20px;margin:0 0 12px">${PREVISIT_PORTAL_CTA}</h1>`,
    `<p style="font-size:15px;line-height:1.5;margin:0 0 20px">You have pre-visit items ready. Finishing them now keeps your visit on time — it only takes a minute.</p>`,
    `<p style="margin:0 0 20px"><a href="${origin}" style="display:inline-block;background:#16a34a;color:#fff;text-decoration:none;padding:12px 20px;border-radius:10px;font-weight:600">Open your patient portal</a></p>`,
    `<p style="font-size:13px;color:#6b7280;margin:0">Please complete them ${urgency}.</p>`,
    `</div>`,
  ].join("");
  return { subject, text, html };
}

export interface PrevisitInAppContent {
  title: string;
  body: string;
  /** Deep link target. In-app notifications live behind portal login, so this
   * may be a real link; we keep it to the bare origin in v1 (no appt id). */
  href: string;
}

/**
 * Render the IN-APP (portal Notification) form. Stored in our own DB behind
 * portal login — not in transit to a third party — but we keep the same
 * PHI-free copy for consistency and so a future push mirror stays safe.
 */
export function renderPrevisitInApp(
  milestone: PrevisitMilestone,
  input: PrevisitReminderInput,
): PrevisitInAppContent {
  const origin = assertGenericPortalUrl(input.portalUrl);
  return {
    title: PREVISIT_PORTAL_CTA,
    body: `You have pre-visit items ready — please complete them ${URGENCY[milestone]}.`,
    href: origin,
  };
}
