import nextDynamic from "next/dynamic";

export const metadata = { title: "Signing you in…" };

// Force-dynamic so this never serves a cached shell.
export const dynamic = "force-dynamic";
export const revalidate = 0;

// Post-sign-in landing — single source of truth for "where does this user go
// after Clerk finishes authenticating them?"
//
// This used to be a Server Component that called auth() and redirect()ed inline.
// That bounced freshly-authenticated users back to /sign-in on the first attempt
// (Clerk dev-instance handshake hadn't synced the __session cookie yet — see
// post-sign-in-resolver.tsx for the full write-up). We now defer the decision to
// a client resolver that waits for Clerk to load, then resolves the role home via
// the resolveHomePath server action (homeForRoles → landingRole, so a clinician
// who also carries an admin role lands on /clinic, not the onboarding wizard).
const PostSignInResolver = nextDynamic(
  () => import("./post-sign-in-resolver"),
  { ssr: false },
);

export default function PostSignInPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-bg px-6">
      <PostSignInResolver />
    </div>
  );
}
