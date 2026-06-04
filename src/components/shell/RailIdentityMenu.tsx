"use client";

import * as React from "react";
import { Avatar } from "@/components/ui/avatar";
import { SignOutButton } from "@clerk/nextjs";
import type { AuthedUser } from "@/lib/auth/session";
import { cn } from "@/lib/utils/cn";
import { ThemeToggle } from "@/components/ui/theme-toggle";

export function RailIdentityMenu({
  user,
  roleLabel,
}: {
  user: AuthedUser;
  roleLabel: string;
}) {
  const [open, setOpen] = React.useState(false);
  const containerRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!open) return;

    function onPointerDown(event: PointerEvent) {
      if (!containerRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }

    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div ref={containerRef} className="relative flex justify-center pb-3">
      {open && (
        <div
          role="menu"
          aria-label={`${roleLabel} identity menu`}
          className={cn(
            "absolute bottom-12 left-12 z-50 w-64 rounded-xl border border-border",
            "liquid-glass bg-surface-raised p-3 shadow-xl",
          )}
        >
          <div className="flex items-center gap-3 rounded-lg bg-surface-muted/60 px-3 py-2.5">
            <Avatar firstName={user.firstName} lastName={user.lastName} size="md" />
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-text">
                {user.firstName} {user.lastName}
              </p>
              <p className="truncate text-xs text-text-subtle">{user.email}</p>
              <p className="mt-1 text-[10px] font-medium uppercase tracking-[0.14em] text-text-subtle">
                {roleLabel}
              </p>
            </div>
          </div>

          <div className="mt-2 border-t border-border/70 pt-2">
            <div className="px-3 pb-2">
              <p className="mb-1.5 text-[10px] font-medium uppercase tracking-[0.14em] text-text-subtle">
                Appearance
              </p>
              <ThemeToggle className="w-full justify-between" />
            </div>
          </div>

          <div className="mt-1 border-t border-border/70 pt-2">
            {typeof window !== "undefined" && !!process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY ? (
              <SignOutButton redirectUrl="/sign-in">
                <button
                  role="menuitem"
                  className="w-full rounded-md px-3 py-2 text-left text-sm text-text-subtle transition-colors hover:bg-surface-muted hover:text-text"
                >
                  Sign out
                </button>
              </SignOutButton>
            ) : (
              <a
                href={process.env.NODE_ENV !== "production" ? "/api/dev/logout?redirect=/sign-in" : "/sign-in"}
                role="menuitem"
                className="block w-full rounded-md px-3 py-2 text-left text-sm text-text-subtle transition-colors hover:bg-surface-muted hover:text-text"
              >
                Sign out
              </a>
            )}
          </div>
        </div>
      )}

      <button
        type="button"
        aria-label={`Open ${roleLabel} menu`}
        aria-expanded={open}
        title={roleLabel}
        onClick={() => setOpen((value) => !value)}
        className={cn(
          "flex h-11 w-11 items-center justify-center rounded-xl transition-colors",
          "text-text-subtle hover:bg-surface-muted hover:text-text",
          open && "bg-surface-muted text-text",
        )}
      >
        <Avatar firstName={user.firstName} lastName={user.lastName} size="sm" />
      </button>
    </div>
  );
}
