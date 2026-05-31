import type { Metadata, Viewport } from "next";
import { redirect } from "next/navigation";
import { SignOutButton } from "@clerk/nextjs";
import { getCurrentUser } from "@/lib/auth/session";
import { homeForRoles } from "@/lib/rbac/roles";
import { IdleTimeoutGuard } from "@/components/auth/IdleTimeoutGuard";
import { Wordmark } from "@/components/ui/logo";

export const metadata: Metadata = {
  title: "Check-In Kiosk",
};

// Lock down pinch-zoom / scaling: this surface lives on a fixed front-desk
// tablet, and the touch targets are already sized for it.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

/**
 * Kiosk surface layout. Intentionally NOT the AppShell — a front-desk kiosk
 * has no sidebar, no nav, no command palette. Just a clean full-screen frame
 * with the clinic wordmark and a "Start over / sign out" affordance.
 *
 * Guard: kiosk role only. Anyone else who somehow lands here is bounced to
 * their own home (or sign-in). The kiosk role is also absent from every other
 * route guard (roles.ts), so this confinement is two-way.
 */
export default async function KioskLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/sign-in");
  if (!user.roles.includes("kiosk")) {
    redirect(homeForRoles(user.roles));
  }

  return (
    <div className="min-h-screen flex flex-col bg-bg text-text antialiased">
      <IdleTimeoutGuard roles={user.roles} />
      <header className="flex items-center justify-between px-6 py-4 border-b border-border/40">
        <div className="flex items-center gap-3">
          <Wordmark size="sm" />
          {user.organizationName && (
            <span className="text-sm text-text-subtle">· {user.organizationName}</span>
          )}
        </div>
        <SignOutButton redirectUrl="/sign-in">
          <button
            type="button"
            className="text-xs uppercase tracking-[0.12em] text-text-subtle hover:text-text transition-colors"
          >
            Sign out kiosk
          </button>
        </SignOutButton>
      </header>
      <main id="main-content" className="flex-1 flex flex-col">
        {children}
      </main>
    </div>
  );
}
