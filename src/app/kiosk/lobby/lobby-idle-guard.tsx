"use client";

import { useEffect, useRef, useState, useCallback } from "react";

/**
 * Inactivity-safe expiry for the lobby. The server session is 30-min TTL, but a
 * phone left on a chair shouldn't keep a half-filled form on screen. After
 * `minutes` of no interaction we hard-cover the surface with a locked screen
 * (no PHI, no resume) so a passer-by can't pick up where the patient left off.
 *
 * Purely client-side belt-and-suspenders on top of the server TTL — the cookie
 * still expires server-side regardless of this overlay.
 */
export function LobbyIdleGuard({ minutes = 5 }: { minutes?: number }) {
  const [locked, setLocked] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const reset = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setLocked(true), minutes * 60 * 1000);
  }, [minutes]);

  useEffect(() => {
    if (locked) {
      if (timer.current) clearTimeout(timer.current);
      return;
    }
    const events = ["pointerdown", "keydown", "touchstart", "scroll"] as const;
    const handler = () => reset();
    reset();
    events.forEach((e) => window.addEventListener(e, handler, { passive: true }));
    return () => {
      if (timer.current) clearTimeout(timer.current);
      events.forEach((e) => window.removeEventListener(e, handler));
    };
  }, [reset, locked]);

  if (!locked) return null;

  return (
    <div className="fixed inset-0 z-50 bg-bg flex flex-col items-center justify-center text-center px-6">
      <div className="text-5xl mb-5" aria-hidden="true">
        🔒
      </div>
      <h1 className="font-display text-2xl text-text tracking-tight mb-3">Session locked</h1>
      <p className="text-[15px] text-text-muted max-w-sm leading-relaxed">
        We locked this check-in for your privacy after a while of inactivity. Please scan
        the code again from the front desk to continue.
      </p>
    </div>
  );
}
