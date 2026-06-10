"use client";

// Client-only Clerk sign-up widget. Isolated into its own module so the
// `@clerk/nextjs` import only loads when AUTH_PROVIDER=clerk AND the
// user actually navigates here — never during boot of the (auth) group.

import { SignUp } from "@clerk/nextjs";
import { clerkAuthAppearance } from "@/lib/auth/clerk-appearance";

export default function ClerkSignUpBox() {
  return (
    <SignUp
      signInUrl="/sign-in"
      // New accounts are patients and belong in /portal. We intentionally do
      // NOT send sign-up through /post-sign-in: the Prisma user is created by
      // the Clerk webhook, which can lag the redirect, so role resolution may
      // not be ready yet. /portal is the correct landing and avoids that race.
      fallbackRedirectUrl="/portal"
      forceRedirectUrl="/portal"
      appearance={clerkAuthAppearance}
    />
  );
}
