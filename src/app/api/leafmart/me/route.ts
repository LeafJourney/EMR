/**
 * GET /api/leafmart/me
 *
 * Lightweight identity probe for the Leafmart header. Returns the current
 * user (or null) without bundling Clerk into the client. Works under both
 * iron-session and Clerk because it goes through getCurrentUser().
 */

import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ user: null });
    return NextResponse.json({
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
      },
    });
  } catch {
    return NextResponse.json({ user: null });
  }
}
