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
// Redefined here because importing from impersonation.ts pulls in node crypto 
// which crashes the Edge runtime.
const IMPERSONATION_COOKIE = "lj_impersonation";

/** Hostnames that should resolve to the Leafmart storefront */
const LEAFMART_HOSTS = [
  "leafmart.com",
  "www.leafmart.com",
  "theleafmart.com",
  "www.theleafmart.com",
  "leafmart.localhost",
];

/** Hostnames that should resolve to the LeafNerd data product */
const LEAFNERD_HOSTS = [
  "leafnerd.leafjourney.com",
  "leafnerd.localhost",
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

function isLeafnerdHost(host: string): boolean {
  const hostname = host.split(":")[0];
  return LEAFNERD_HOSTS.includes(hostname);
}

function isSharedPath(pathname: string): boolean {
  return SHARED_PATHS.some((p) => pathname.startsWith(p));
}

// Auth model: Clerk's middleware attaches session state to the request,
// but does NOT auto-protect routes. Per-page protection happens in the
// route handlers and Server Components via requireUser() / requireRole()
// from @/lib/auth/session and the new requireApiAuth() in @/lib/auth/api-gate.
// The middleware below only adds two cross-cutting concerns: (1) coarse
// auth gate on the onboarding-controller surface, (2) origin check on
// admin mutations.
//
// (A previous version of this file declared `isPublicRoute = createRouteMatcher`
// matching every path, with a confused comment. It was never invoked.
// Removed in chore/middleware-dead-route-matcher.)

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

  // ── EMR-742: belt-and-braces impersonation read-only at the edge ──
  // The authoritative check lives in requireApiAuth (verifies the cookie
  // signature, binds to the Clerk user id, etc.). This middleware layer
  // is a second line of defense that catches non-API mutations — server
  // actions in particular, which are POSTs to a page path and bypass
  // /api/** routing entirely.
  //
  // We are intentionally permissive here:
  //   - We trust the presence of the cookie as a strong hint without
  //     verifying its signature (no Node crypto in the edge runtime by
  //     default). Forging the cookie to ENABLE read-only is harmless;
  //     forging it to DISABLE read-only is the threat, and that's
  //     prevented by requireApiAuth's signed-cookie verification.
  //   - We exempt the impersonation exit route so the user can always
  //     terminate the session even if they somehow trip the read-only
  //     check.
  if (
    req.method !== "GET" &&
    req.method !== "HEAD" &&
    req.method !== "OPTIONS"
  ) {
    const hasImpersonationCookie = !!req.cookies.get(IMPERSONATION_COOKIE);
    const isImpersonationExit =
      pathname === "/api/admin/impersonate/exit";
    if (hasImpersonationCookie && !isImpersonationExit) {
      // Page POSTs (server actions) get a JSON 403 here — Next will
      // surface the error to the client action wrapper. API POSTs hit
      // requireApiAuth's check and receive the same envelope; defining
      // it twice keeps both layers self-consistent.
      if (pathname.startsWith("/api/")) {
        // Let the API gate handle it (richer error envelope, includes
        // practiceId, structured logging). Fall through.
      } else {
        return NextResponse.json(
          {
            error: "impersonation_read_only",
            message:
              "Mutations are not permitted while viewing as a practice.",
          },
          { status: 403 },
        );
      }
    }
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

  // ── LeafNerd domain routing ──────────────────────────────
  if (isLeafnerdHost(host)) {
    if (pathname.startsWith("/leafnerd")) {
      const cleanPath = pathname.replace(/^\/leafnerd/, "") || "/";
      const url = req.nextUrl.clone();
      url.pathname = cleanPath;
      return NextResponse.redirect(url, 308);
    }
    const url = req.nextUrl.clone();
    url.pathname = `/leafnerd${pathname === "/" ? "" : pathname}`;
    const response = NextResponse.rewrite(url);
    response.headers.set("x-leafnerd-brand", "leafnerd");
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
