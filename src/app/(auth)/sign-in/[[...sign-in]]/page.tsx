// Clerk Sign-In page — gated behind AUTH_PROVIDER=clerk.
//
// EMR-205: the top-level `import { SignIn } from "@clerk/nextjs"` used to
// run at module load and crashed the whole (auth) route group when Clerk
// env vars weren't set — including /login, which shares this group.
// Dynamic-importing inside the render path keeps @clerk/nextjs out of
// the hot boot path until Clerk is actually wired.

import nextDynamic from "next/dynamic";

export const metadata = { title: "Sign in — Leafjourney" };

// Disable caching on this route so every visit pulls a fresh sign-in
// widget — addresses the "Sign in button must always open with all login
// methods available" requirement.
export const dynamic = "force-dynamic";
export const revalidate = 0;

const ClerkSignInBox = nextDynamic(() => import("./clerk-signin-box"), {
  ssr: false,
});

export default function SignInPage() {
  return (
    <div className="flex flex-col items-center">
      <h1 className="font-display text-2xl text-text tracking-tight mb-2">
        Welcome back
      </h1>
      <p className="text-sm text-text-muted mb-8 text-center">
        Sign in to your Leafjourney account
      </p>
      <ClerkSignInBox />
      <p className="mt-6 text-xs text-text-muted text-center max-w-sm leading-relaxed">
        Your password must contain 8 or more characters including one capital
        letter and a special character.
      </p>
    </div>
  );
}
