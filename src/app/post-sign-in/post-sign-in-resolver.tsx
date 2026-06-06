"use client";

// Post-sign-in resolver — fixes the "first sign-in attempt bounces back to
// /sign-in, second attempt works" glitch on Clerk development instances.
//
// Root cause: the previous /post-sign-in was a Server Component that called
// auth() the instant Clerk's <SignIn> soft-navigated here. On a dev instance
// the cross-domain (*.accounts.dev → localhost) handshake that syncs the
// __session cookie hasn't completed yet on that first hit, so auth() returned
// null and the page did redirect("/sign-in") — bouncing an already-authenticated
// user. By the next pass the handshake had settled, so it "worked the 2nd time".
//
// Fix: wait for Clerk to finish loading on the CLIENT (useAuth().isLoaded), by
// which point the session cookie is established, then ask the server (via the
// resolveHomePath action) for the role-appropriate landing. Only fall back to
// /sign-in when there is genuinely no session. This also transparently supports
// the dev-cookie bypass (getCurrentUser reads dev_user_email when there is no
// Clerk session), since the destination decision is made server-side.

import { useAuth } from "@clerk/nextjs";
import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";
import { Wordmark } from "@/components/ui/logo";
import { resolveHomePath } from "./actions";

export default function PostSignInResolver() {
  const { isLoaded } = useAuth();
  const router = useRouter();
  const handled = useRef(false);

  useEffect(() => {
    // Wait until Clerk has settled. Until then we cannot tell "not signed in"
    // apart from "handshake still in flight" — the distinction the old code got
    // wrong.
    if (!isLoaded || handled.current) return;
    handled.current = true;

    let cancelled = false;
    (async () => {
      // The session cookie can lag the client `isLoaded` flip by a beat on dev
      // instances; give the server up to two quick attempts before giving up.
      for (let attempt = 0; attempt < 2; attempt++) {
        const path = await resolveHomePath();
        if (cancelled) return;
        if (path) {
          router.replace(path);
          return;
        }
        await new Promise((r) => setTimeout(r, 400));
      }
      if (!cancelled) router.replace("/sign-in");
    })();

    return () => {
      cancelled = true;
    };
  }, [isLoaded, router]);

  return (
    <div className="flex flex-col items-center gap-6 py-4" role="status" aria-live="polite">
      <Wordmark size="md" />
      <div
        aria-hidden="true"
        className="h-6 w-6 rounded-full border-2 border-border border-t-accent animate-spin"
      />
      <p className="text-sm text-text-muted">Signing you in…</p>
    </div>
  );
}
