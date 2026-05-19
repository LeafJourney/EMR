/**
 * POST /api/leafmart/signout
 *
 * Destroys the iron-session cookie and (when Clerk is active) returns a
 * URL to Clerk's hosted sign-out so the client can redirect there.
 */

import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function POST() {
  return NextResponse.json({
    ok: true,
    redirectTo: "/sign-in",
  });
}
