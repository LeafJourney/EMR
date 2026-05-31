import { redirect } from "next/navigation";
import { validateHandoffToken } from "@/lib/check-in/kiosk-handoff";
import { getCurrentKioskLobby } from "@/lib/check-in/kiosk-lobby-session";
import { LobbyExpired } from "../lobby-expired";
import { LobbyChallenge } from "./lobby-challenge";

// Token-gated challenge: this is the ONLY public entry to a lobby session.
// Force dynamic — it reads cookies + token state and must never be cached.
export const dynamic = "force-dynamic";

export default async function LobbyChallengePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  // Already inside a live lobby session on this device — skip the challenge.
  const existing = await getCurrentKioskLobby();
  if (existing) redirect("/kiosk/lobby");

  // Validate WITHOUT consuming — a scan/refresh must not burn the ticket.
  const v = await validateHandoffToken(token);
  if (!v.ok) {
    return <LobbyExpired />;
  }

  return <LobbyChallenge token={token} />;
}
