import type { Metadata, Viewport } from "next";
import { Wordmark } from "@/components/ui/logo";
import { LobbyIdleGuard } from "./lobby-idle-guard";

export const metadata: Metadata = {
  title: "Continue your check-in",
  // The lobby is a public, token-gated patient surface — keep it out of search
  // indexes entirely.
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

/**
 * Public LOBBY layout for the kiosk→phone hand-off.
 *
 * ARCHITECTURE (non-negotiable): this surface is a DELEGATED, SCOPED, EXPIRING
 * patient session — never the authenticated EMR shell. There is intentionally
 * NO AppShell, NO sidebar, NO staff nav, NO chart search, NO Clerk guard here.
 * Just a clinic wordmark and the patient's own pre-visit completion flow. The
 * lobby cookie is path-scoped to /kiosk/lobby so it can never ride along to a
 * clinical/portal route, and the per-page guards re-derive the patient + scope
 * server-side from that cookie. "The patient is only let into the room prepared
 * for them; the door locks behind them."
 *
 * This layout lives at src/app/kiosk/lobby/ — there is NO layout at
 * src/app/kiosk/ level, so the staff console (src/app/kiosk/(console)) and this
 * lobby never share a layout or a guard.
 */
export default function LobbyLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col bg-bg text-text antialiased">
      <LobbyIdleGuard />
      <header className="flex items-center justify-center px-6 py-5 border-b border-border/40">
        <Wordmark size="sm" />
      </header>
      <main id="main-content" className="flex-1 flex flex-col px-5 py-8">
        <div className="w-full max-w-md mx-auto flex-1 flex flex-col">{children}</div>
      </main>
      <footer className="px-6 py-4 text-center">
        <p className="text-[11px] text-text-subtle">
          A private, temporary check-in session. It locks itself after 30 minutes.
        </p>
      </footer>
    </div>
  );
}
