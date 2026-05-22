"use client";

import * as React from "react";
import { useClerk } from "@clerk/nextjs";
import type { Role } from "@prisma/client";
import { Button } from "@/components/ui/button";
import {
  evaluateSession,
  idleLimitForRoles,
  type SessionTimeoutReason,
} from "@/lib/auth/idle-timeouts";

// EMR session-timeout guard. Mounts inside the authenticated AppShell so
// every signed-in surface (clinic, ops, portal, admin) inherits a HIPAA-
// aligned automatic-logoff policy.
//
// Two clocks run in parallel:
//   - Idle clock — reset by user interaction (mouse, keyboard, touch,
//     scroll, focus). Per-role budget from idleLimitForRoles().
//   - Absolute clock — set once when the component first mounts in this
//     browser session. NEVER reset by activity. 12-hour ceiling.
//
// 60s before either clock expires we surface a soft warning modal so the
// user can press "Stay signed in" without losing context. If they don't,
// we call Clerk's signOut() and push them to /sign-in?reason=...
//
// Cross-tab: activity in any tab writes to localStorage; other tabs
// listen on the `storage` event so all tabs reset together.
//
// Storage keys are namespaced under `lj.session.*` so they don't collide
// with anything else in the app.

const STORAGE_KEY_LAST_ACTIVE = "lj.session.lastActiveAt";
const STORAGE_KEY_SESSION_START = "lj.session.startedAt";

// Don't write to localStorage more than once every 2s, even if the user
// is hammering the mouse. Cheap throttle that keeps the storage event
// from firing on every pixel of mouse movement.
const ACTIVITY_THROTTLE_MS = 2_000;

// How often the watchdog interval re-evaluates the clocks. 5s strikes a
// balance between responsiveness (the warning shows within 5s of the
// real threshold) and CPU/wakeup cost.
const TICK_MS = 5_000;

const ACTIVITY_EVENTS: Array<keyof DocumentEventMap> = [
  "mousedown",
  "keydown",
  "touchstart",
  "scroll",
  "wheel",
  "click",
];

type Reason = SessionTimeoutReason;

export interface IdleTimeoutGuardProps {
  roles: Role[];
}

function nowMs(): number {
  return Date.now();
}

function readNumber(key: string): number | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
}

function writeNumber(key: string, value: number): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, String(value));
  } catch {
    // localStorage can throw in private modes / disabled storage. The
    // guard still works within a single tab — we just lose cross-tab
    // sync — so swallow.
  }
}

function clearKeys(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(STORAGE_KEY_LAST_ACTIVE);
    window.localStorage.removeItem(STORAGE_KEY_SESSION_START);
  } catch {
    // no-op
  }
}

export function IdleTimeoutGuard({ roles }: IdleTimeoutGuardProps) {
  const { signOut } = useClerk();
  const idleLimitMs = React.useMemo(() => idleLimitForRoles(roles), [roles]);

  // lastActivityAt drives the idle clock; sessionStartedAt drives the
  // absolute clock. Both live in refs so the activity listeners can read
  // them synchronously without re-binding on every state update.
  const lastActivityRef = React.useRef<number>(nowMs());
  const sessionStartRef = React.useRef<number>(nowMs());
  const lastWriteRef = React.useRef<number>(0);

  // Warning state — when non-null, the dialog is shown and the number is
  // the seconds remaining until forced sign-out. The countdown ticks
  // independently of the watchdog interval so the displayed number is
  // smooth.
  const [warning, setWarning] = React.useState<{
    reason: Reason;
    secondsLeft: number;
  } | null>(null);
  const signingOutRef = React.useRef(false);

  // ── Bootstrapping: pull existing timestamps from storage so reloads
  // and cross-tab activity carry over. If sessionStartedAt isn't stored
  // yet we stamp it now — the first authenticated page-load defines the
  // absolute clock's origin.
  React.useEffect(() => {
    const storedActivity = readNumber(STORAGE_KEY_LAST_ACTIVE);
    if (storedActivity !== null) lastActivityRef.current = storedActivity;

    const storedStart = readNumber(STORAGE_KEY_SESSION_START);
    if (storedStart !== null) {
      sessionStartRef.current = storedStart;
    } else {
      writeNumber(STORAGE_KEY_SESSION_START, sessionStartRef.current);
    }
  }, []);

  const recordActivity = React.useCallback(() => {
    const now = nowMs();
    lastActivityRef.current = now;
    if (now - lastWriteRef.current >= ACTIVITY_THROTTLE_MS) {
      lastWriteRef.current = now;
      writeNumber(STORAGE_KEY_LAST_ACTIVE, now);
    }
  }, []);

  // ── Activity listeners + cross-tab sync.
  React.useEffect(() => {
    for (const evt of ACTIVITY_EVENTS) {
      document.addEventListener(evt, recordActivity, { passive: true });
    }
    const onVisible = () => {
      if (document.visibilityState === "visible") recordActivity();
    };
    document.addEventListener("visibilitychange", onVisible);

    const onStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY_LAST_ACTIVE && e.newValue) {
        const n = Number(e.newValue);
        if (Number.isFinite(n)) lastActivityRef.current = n;
      }
    };
    window.addEventListener("storage", onStorage);

    return () => {
      for (const evt of ACTIVITY_EVENTS) {
        document.removeEventListener(evt, recordActivity);
      }
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("storage", onStorage);
    };
  }, [recordActivity]);

  const forceSignOut = React.useCallback(
    async (reason: Reason) => {
      if (signingOutRef.current) return;
      signingOutRef.current = true;
      clearKeys();
      try {
        await signOut({ redirectUrl: `/sign-in?reason=${reason}` });
      } catch {
        // If Clerk signOut throws for any reason, fall back to a hard
        // navigation so the session at least appears terminated client-
        // side.
        window.location.href = `/sign-in?reason=${reason}`;
      }
    },
    [signOut],
  );

  // Single decision routine — used by both the watchdog (every TICK_MS)
  // and the smooth countdown (every 1s while the modal is up). Both
  // intervals route through the same pure evaluator so they can never
  // disagree about state.
  const evaluate = React.useCallback(() => {
    if (signingOutRef.current) return;
    const decision = evaluateSession({
      now: nowMs(),
      lastActivityAt: lastActivityRef.current,
      sessionStartedAt: sessionStartRef.current,
      idleLimitMs,
    });
    if (decision.kind === "force_signout") {
      void forceSignOut(decision.reason);
      return;
    }
    if (decision.kind === "ok") {
      setWarning((prev) => (prev ? null : prev));
      return;
    }
    setWarning((prev) =>
      prev &&
      prev.reason === decision.reason &&
      prev.secondsLeft === decision.secondsLeft
        ? prev
        : { reason: decision.reason, secondsLeft: decision.secondsLeft },
    );
  }, [idleLimitMs, forceSignOut]);

  // ── Watchdog tick.
  React.useEffect(() => {
    evaluate();
    const id = window.setInterval(evaluate, TICK_MS);
    return () => window.clearInterval(id);
  }, [evaluate]);

  // ── Smooth countdown while the warning is up.
  React.useEffect(() => {
    if (!warning) return;
    const id = window.setInterval(evaluate, 1000);
    return () => window.clearInterval(id);
  }, [warning, evaluate]);

  const handleStay = React.useCallback(() => {
    // "Stay signed in" only extends the IDLE clock — the absolute clock
    // is by design unreset-able, so when the warning is for session_max
    // the only choice is to sign out and re-authenticate.
    if (warning?.reason === "session_max") {
      void forceSignOut("session_max");
      return;
    }
    const now = nowMs();
    lastActivityRef.current = now;
    lastWriteRef.current = now;
    writeNumber(STORAGE_KEY_LAST_ACTIVE, now);
    setWarning(null);
  }, [warning, forceSignOut]);

  const handleSignOutNow = React.useCallback(() => {
    void forceSignOut(warning?.reason ?? "idle");
  }, [warning, forceSignOut]);

  if (!warning) return null;

  const title =
    warning.reason === "session_max"
      ? "Session is ending"
      : "Still there?";
  const description =
    warning.reason === "session_max"
      ? `Your session has reached the 12-hour limit. You'll need to sign in again in ${warning.secondsLeft}s.`
      : `For your protection, we'll sign you out in ${warning.secondsLeft}s due to inactivity.`;
  const primaryLabel =
    warning.reason === "session_max" ? "Sign in again" : "Stay signed in";

  // Self-contained modal so we don't depend on the Dialog provider being
  // mounted somewhere up-tree. Inline styles keep this readable even if
  // CSS hasn't loaded yet (a sign-out path can run very early).
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="idle-timeout-title"
      aria-describedby="idle-timeout-desc"
      className="fixed inset-0 z-[1000] flex items-center justify-center p-4"
    >
      <div className="absolute inset-0 bg-black/50" aria-hidden />
      <div className="relative w-full max-w-sm rounded-2xl bg-surface-raised border border-border shadow-xl p-6">
        <h2
          id="idle-timeout-title"
          className="font-display text-lg text-text tracking-tight mb-2"
        >
          {title}
        </h2>
        <p
          id="idle-timeout-desc"
          className="text-sm text-text-muted leading-relaxed mb-6"
        >
          {description}
        </p>
        <div className="flex gap-3 justify-end">
          <Button
            type="button"
            variant="secondary"
            onClick={handleSignOutNow}
          >
            Sign out now
          </Button>
          <Button type="button" onClick={handleStay} autoFocus>
            {primaryLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
