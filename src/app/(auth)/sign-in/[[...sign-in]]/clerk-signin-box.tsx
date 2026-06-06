"use client";

// Client-only Clerk sign-in widget. Isolated into its own module so the
// `@clerk/nextjs` import only loads when AUTH_PROVIDER=clerk AND the
// user actually navigates here — never during boot of the (auth) group.

import { SignIn } from "@clerk/nextjs";
import { clerkAuthAppearance } from "@/lib/auth/clerk-appearance";

export default function ClerkSignInBox() {
  return (
    <SignIn
      signUpUrl="/sign-up"
      // Route through /post-sign-in so the server resolves the right home for
      // the user's roles (homeForRoles). Hard-coding /portal here forced every
      // role — clinician, operator, super_admin — through the patient shell's
      // reject-and-redirect, which is the "logged in but bounced to the wrong
      // place / Something went wrong" behavior.
      fallbackRedirectUrl="/post-sign-in"
      forceRedirectUrl="/post-sign-in"
      appearance={clerkAuthAppearance}
    />
  );
}
