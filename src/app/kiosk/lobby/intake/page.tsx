import { getLobbyScopeFor } from "@/lib/check-in/kiosk-lobby-session";
import { LobbyExpired } from "../lobby-expired";
import { LobbyIntakeForm } from "./lobby-intake-form";

export const dynamic = "force-dynamic";

/**
 * Lobby intake surface. Scoped: only reachable when "intake" is an outstanding
 * task for this patient's visit. The guard re-derives patient + scope from the
 * lobby cookie; out-of-scope or no-session => the safe terminal screen (the
 * patient is never let into a room that wasn't prepared for them).
 *
 * We do NOT pre-fill from the chart here — this surface reads no PHI back to the
 * device. The patient supplies fresh answers, which staff review before they
 * touch the chart.
 */
export default async function LobbyIntakePage() {
  const identity = await getLobbyScopeFor("intake");
  if (!identity) return <LobbyExpired />;

  return (
    <div className="flex-1 flex flex-col">
      <p className="text-[11px] uppercase tracking-[0.2em] text-accent font-medium mb-2">
        About your visit
      </p>
      <h1 className="font-display text-3xl text-text tracking-tight leading-tight mb-2">
        Tell us why you&rsquo;re here
      </h1>
      <p className="text-[15px] text-text-muted mb-7 leading-relaxed">
        Share as much or as little as you&rsquo;re comfortable with. This helps your care
        team focus the visit on what matters to you.
      </p>
      <LobbyIntakeForm />
    </div>
  );
}
