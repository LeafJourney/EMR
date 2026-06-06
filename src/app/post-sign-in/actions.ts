"use server";

import { getCurrentUser } from "@/lib/auth/session";
import { homeForRoles } from "@/lib/rbac/roles";

// Server action invoked by the client-side PostSignInResolver *after* Clerk has
// finished loading the session on the client (isLoaded === true). By that point
// the dev-instance handshake has completed and the `__session` cookie is present
// on this request, so `auth()` reliably resolves — which is exactly what the old
// server-component version of /post-sign-in could not guarantee (it ran on the
// first soft navigation, before the handshake, saw a null user, and bounced the
// freshly-authenticated user back to /sign-in).
//
// Returns the role-appropriate home path, or null when there is genuinely no
// session (the resolver then sends the user to /sign-in).
export async function resolveHomePath(): Promise<string | null> {
  const user = await getCurrentUser();
  if (!user) return null;
  return homeForRoles(user.roles);
}
