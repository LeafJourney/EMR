import { getLobbyScopeFor } from "@/lib/check-in/kiosk-lobby-session";
import { LobbyExpired } from "../lobby-expired";
import { LobbyConsentView } from "./lobby-consent-view";

export const dynamic = "force-dynamic";

/**
 * Lobby consent surface. Scoped to "consent" the same way intake is scoped.
 * Reuses the DEFAULT_TEMPLATES + signature capture UX from the portal consent
 * view, but each signed form is STAGED for staff review via lobbySubmitConsent
 * rather than written as a SignedConsent. The patient is re-derived server-side.
 */
export default async function LobbyConsentPage() {
  const identity = await getLobbyScopeFor("consent");
  if (!identity) return <LobbyExpired />;

  return (
    <div className="flex-1 flex flex-col">
      <p className="text-[11px] uppercase tracking-[0.2em] text-accent font-medium mb-2">
        Consent
      </p>
      <h1 className="font-display text-3xl text-text tracking-tight leading-tight mb-2">
        Review &amp; sign
      </h1>
      <p className="text-[15px] text-text-muted mb-7 leading-relaxed">
        Please review and sign the forms below. Your signature is captured securely and
        reviewed by your care team.
      </p>
      <LobbyConsentView />
    </div>
  );
}
