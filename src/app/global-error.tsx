"use client";

import { useEffect } from "react";

/**
 * Global error boundary — catches errors thrown above app/error.tsx,
 * which means it MUST render its own <html> + <body> and cannot rely
 * on the root layout, providers, or design-system styles. Stays
 * inline-styled and dependency-free on purpose.
 *
 * Anything we'd normally do in a layout (analytics, sentry) has to be
 * inlined here. We capture to Sentry via dynamic import so a bundling
 * failure of @sentry/nextjs can't take down the last-resort screen.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const Sentry = await import("@sentry/nextjs");
        if (cancelled) return;
        Sentry.captureException(error, {
          tags: { boundary: "global-error" },
          extra: { digest: error.digest },
        });
      } catch {
        // Sentry unavailable — silently swallow; this is the last-resort screen.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          fontFamily:
            "ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
          backgroundColor: "#FEFCF6",
          color: "#1F2A1F",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          minHeight: "100vh",
          padding: "2rem",
          margin: 0,
        }}
      >
        <main style={{ textAlign: "center", maxWidth: "440px" }}>
          {/* Inline monochrome leaf — no external assets allowed here. */}
          <svg
            width="56"
            height="56"
            viewBox="0 0 24 24"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            aria-hidden="true"
            style={{ color: "#3A8560", marginBottom: "1.25rem" }}
          >
            <path
              d="M12 4.5 C 15 8, 15 13.5, 12 19.5 C 9 13.5, 9 8, 12 4.5 Z"
              stroke="currentColor"
              strokeWidth="1.25"
              strokeLinejoin="round"
            />
            <path
              d="M12 6.5 L12 18"
              stroke="currentColor"
              strokeWidth="0.9"
              strokeLinecap="round"
            />
          </svg>

          <p
            style={{
              fontSize: "0.7rem",
              fontWeight: 500,
              letterSpacing: "0.18em",
              textTransform: "uppercase",
              color: "#9CA89E",
              margin: "0 0 0.75rem 0",
            }}
          >
            Unexpected error
          </p>

          <h1
            style={{
              fontSize: "1.65rem",
              fontWeight: 600,
              letterSpacing: "-0.01em",
              margin: "0 0 0.75rem 0",
              lineHeight: 1.15,
            }}
          >
            Something didn&rsquo;t go as planned.
          </h1>

          <p
            style={{
              fontSize: "0.95rem",
              color: "#6B7D6E",
              lineHeight: 1.6,
              margin: "0 0 1.75rem 0",
            }}
          >
            Your data is safe — this is a display problem, not a data
            problem. Try refreshing, or contact your care team if it
            keeps happening.
          </p>

          <div
            style={{
              display: "flex",
              gap: "0.625rem",
              justifyContent: "center",
              flexWrap: "wrap",
            }}
          >
            <button
              onClick={reset}
              style={{
                padding: "0.75rem 1.5rem",
                borderRadius: "0.5rem",
                border: "1px solid #3A8560",
                backgroundColor: "#3A8560",
                color: "white",
                fontSize: "0.9rem",
                fontWeight: 500,
                cursor: "pointer",
              }}
            >
              Try again
            </button>
            <a
              href="/"
              style={{
                padding: "0.75rem 1.5rem",
                borderRadius: "0.5rem",
                border: "1px solid #D6DCD2",
                backgroundColor: "#FFFFFF",
                color: "#1F2A1F",
                fontSize: "0.9rem",
                fontWeight: 500,
                textDecoration: "none",
              }}
            >
              Go home
            </a>
          </div>

          {error.digest && (
            <p
              style={{
                marginTop: "1.75rem",
                fontFamily:
                  "ui-monospace, SFMono-Regular, 'SF Mono', Menlo, monospace",
                fontSize: "0.7rem",
                color: "#9CA89E",
              }}
            >
              Reference: {error.digest}
            </p>
          )}
        </main>
      </body>
    </html>
  );
}
