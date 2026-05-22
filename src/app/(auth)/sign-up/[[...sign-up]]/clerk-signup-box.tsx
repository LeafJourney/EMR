"use client";

// Client-only Clerk sign-up widget. Isolated into its own module so the
// `@clerk/nextjs` import only loads when AUTH_PROVIDER=clerk AND the
// user actually navigates here — never during boot of the (auth) group.

import { SignUp } from "@clerk/nextjs";

export default function ClerkSignUpBox() {
  return (
    <SignUp
      signInUrl="/sign-in"
      fallbackRedirectUrl="/post-sign-in"
      forceRedirectUrl="/post-sign-in"
      appearance={{
        variables: {
          colorPrimary: "#2E5A44",
          colorText: "#152119",
          colorTextSecondary: "#5E6C64",
          colorBackground: "white",
          colorInputBackground: "white",
          colorInputText: "#152119",
        },
        elements: {
          rootBox: "w-full",
          cardBox: "shadow-none border-none",
          card: "shadow-none border-none",
          headerTitle: "hidden",
          headerSubtitle: "hidden",
        },
        layout: {
          socialButtonsPlacement: "top",
          socialButtonsVariant: "blockButton",
        },
      }}
    />
  );
}
