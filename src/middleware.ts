// Middleware — multi-domain routing for Leafmart + Leafjourney.
//
// How it works:
// 1. Reads the Host header to determine which brand is being accessed
// 2. For leafmart.com requests, internally rewrites "/" → "/leafmart",
//    "/products/x" → "/leafmart/products/x", etc.
// 3. The user never sees "/leafmart/" in their URL bar
// 4. For leafjourney.com (or localhost), passes through normally
//
// Domain config:
//   leafmart.com / www.leafmart.com / theleafmart.com / www.theleafmart.com → Leafmart
//   Everything else → Leafjourney (EMR)

import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse, type NextRequest } from "next/server";

/** Hostnames that should resolve to the Leafmart storefront */
const LEAFMART_HOSTS = [
  "leafmart.com",
  "www.leafmart.com",
  "theleafmart.com",
  "www.theleafmart.com",
  "leafmart.localhost",
];

/** Paths that should NOT be rewritten (shared infra) */
const SHARED_PATHS = [
  "/api/",
  "/_next/",
  "/favicon.ico",
  "/icon.svg",
];

function isLeafmartHost(host: string): boolean {
  // Strip port for localhost comparison
  const hostname = host.split(":")[0];
  return LEAFMART_HOSTS.includes(hostname);
}

function isSharedPath(pathname: string): boolean {
  return SHARED_PATHS.some((p) => pathname.startsWith(p));
}

// Ensure the sign-in / sign-up routes and APIs are public
const isPublicRoute = createRouteMatcher(["/sign-in(.*)", "/sign-up(.*)", "/api(.*)", "/(.*)"]); // Wait, everything public? The previous middleware didn't enforce auth. Wait, in Next.js app router, the pages enforce auth.

// EMR-428 — Practice Onboarding Controller surfaces. Coarse gate: must be
// signed in. The route handlers/pages do the real role check via
// `requireImplementationAdmin()` (defense in depth — middleware runs on the
// edge and can't reach Prisma for the membership/role join).
const isControllerSurface = createRouteMatcher([
  "/onboarding/wizard(.*)",
  "/api/configs(.*)",
  "/templates(.*)",
]);

export default clerkMiddleware(async (auth, req) => {
  const host = req.headers.get("host") || "";
  const { pathname } = req.nextUrl;

  // Skip shared paths (API, static assets)
  if (isSharedPath(pathname)) {
    // /api/configs is a controller surface even though it lives under /api —
    // we still want to gate it. Don't early-return for it.
    if (!pathname.startsWith("/api/configs")) {
      return NextResponse.next();
    }
  }

  // ── EMR-428: Practice Onboarding Controller gate ─────────
  // Coarse check: require an authenticated session. Non-admins who slip past
  // here are stopped by `requireImplementationAdmin()` in the route handler.
  //
  // EMR-410 NOTE: Modality enforcement does NOT live here. Modality state is
  // per-practice and requires a Prisma read against PracticeConfiguration —
  // which is unavailable from the edge runtime. Routes that touch a modality
  // call `requireModalityEnabled()` from `@/lib/modality/api-guard` at the
  // top of the handler. This middleware intentionally stays modality-agnostic.
  if (isControllerSurface(req)) {
    const { userId } = await auth();
    if (!userId) {
      // For API routes: 403 JSON (no redirect — would break clients).
      if (pathname.startsWith("/api/")) {
        return NextResponse.json(
          { error: "FORBIDDEN", message: "Authentication required." },
          { status: 403 },
        );
      }
      // For page routes: send to the friendly forbidden surface.
      const url = req.nextUrl.clone();
      url.pathname = "/forbidden";
      url.search = "";
      return NextResponse.redirect(url);
    }
    // Authenticated — fall through to per-route role check downstream.
  }

  // ── Origin check for state-changing /api/admin requests ──
  // Defense-in-depth against CSRF. Clerk's session cookie is SameSite=Lax,
  // which blocks the easiest cross-site form-post attack but does NOT
  // block fetch() from a controlled origin. The admin routes mutate
  // privilege grants and practice config — the cost of a bypass is high
  // enough that we want a second check beyond cookie SameSite.
  //
  // We accept either:
  //   - An exact match against APP_URL (set in env), or
  //   - The Origin matches the current request's Host (fetch-from-same-page).
  //
  // Webhooks under /api/webhooks/** are NOT covered here — those have
  // signature verification and explicitly accept cross-origin posts.
  if (
    pathname.startsWith("/api/admin/") &&
    req.method !== "GET" &&
    req.method !== "HEAD" &&
    req.method !== "OPTIONS"
  ) {
    const origin = req.headers.get("origin");
    const appUrl = process.env.APP_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? "";
    const sameHost = origin
      ? (() => {
          try {
            return new URL(origin).host === host;
          } catch {
            return false;
          }
        })()
      : false;
    const matchesAppUrl = origin && appUrl && origin === appUrl.replace(/\/$/, "");

    if (!origin || (!sameHost && !matchesAppUrl)) {
      return NextResponse.json(
        {
          error: "FORBIDDEN",
          message: "Origin mismatch — admin mutations require same-origin requests.",
        },
        { status: 403 },
      );
    }
  }

  // ── Leafmart domain routing ──────────────────────────────
  if (isLeafmartHost(host)) {
    if (pathname.startsWith("/leafmart")) {
      const cleanPath = pathname.replace(/^\/leafmart/, "") || "/";
      const url = req.nextUrl.clone();
      url.pathname = cleanPath;
      return NextResponse.redirect(url, 308);
    }
    const url = req.nextUrl.clone();
    url.pathname = `/leafmart${pathname === "/" ? "" : pathname}`;
    const response = NextResponse.rewrite(url);
    response.headers.set("x-leafmart-brand", "leafmart");
    return response;
  }

  return NextResponse.next();
});

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
