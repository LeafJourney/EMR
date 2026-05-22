// EMR-742 Phase 2 — "Viewing as <practice>" sticky banner.
//
// Server component. Mounted in src/app/(super-admin)/layout.tsx ABOVE
// the AppShell so it spans the entire viewport regardless of which
// drawer / nav state the shell is in. Renders nothing when there is no
// active impersonation session — keeping it inert is cheap because
// `readImpersonationFromCookies` is a single cookie read + HMAC verify.
//
// The banner is intentionally undismissable: closing it without
// actually ending the impersonation session would be a security
// foot-gun (a super-admin could forget they're impersonating). The
// only way to make it disappear is to hit Exit (which calls
// /api/admin/impersonate/exit and clears the cookie).
//
// Visuals: high-contrast amber stripe. We do not use a Tailwind
// design-system token for this because the banner needs to scream
// regardless of role-theme — amber-400 is the universal "you are in a
// state that is not your normal state" colour across the codebase
// (see PinButton, NavSections badge severities, ambient warnings).

import { getCurrentUser } from "@/lib/auth/session";
import { readImpersonationFromCookies } from "@/lib/auth/impersonation";
import { ImpersonationExitButton } from "./impersonation-exit-button";

function formatRemaining(ms: number): string {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  if (m <= 0) return `${s}s left`;
  return `${m}m ${s.toString().padStart(2, "0")}s left`;
}

export async function ImpersonationBanner() {
  const user = await getCurrentUser();
  if (!user) return null;

  // readImpersonationFromCookies throws outside a request scope; inside
  // a layout it's always safe. We still guard with try/catch so a
  // malformed cookie never blows up the whole shell.
  let session;
  try {
    session = await readImpersonationFromCookies(user.id);
  } catch {
    return null;
  }
  if (!session) return null;

  const remainingMs = session.expiresAt - Date.now();
  const remainingLabel = formatRemaining(remainingMs);

  return (
    <div
      role="status"
      aria-live="polite"
      data-impersonation-banner
      className={
        "sticky top-0 z-[60] w-full " +
        "bg-amber-400 text-amber-950 " +
        "border-b border-amber-600/40 shadow-[0_1px_0_rgba(0,0,0,0.05)]"
      }
    >
      <div className="mx-auto flex items-center justify-between gap-4 px-4 py-2 max-w-[1600px]">
        <div className="flex items-center gap-3 min-w-0">
          <span
            aria-hidden
            className="inline-block h-2 w-2 rounded-full bg-amber-900 animate-pulse"
          />
          <p className="text-[13px] font-semibold truncate">
            Viewing as{" "}
            <span className="font-bold">{session.practiceName}</span>
          </p>
          <span
            className={
              "inline-flex items-center rounded-full " +
              "bg-amber-900/15 text-amber-950 " +
              "px-2 py-0.5 text-[11px] font-medium tabular-nums " +
              "whitespace-nowrap"
            }
            title={`Auto-expires at ${new Date(session.expiresAt).toLocaleTimeString()}`}
          >
            {remainingLabel}
          </span>
        </div>
        <ImpersonationExitButton />
      </div>
    </div>
  );
}
