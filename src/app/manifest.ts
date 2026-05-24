import type { MetadataRoute } from "next";

/**
 * PWA manifest — Next 14's `app/manifest.ts` route emits
 * `/manifest.webmanifest` with the correct content-type.
 *
 * Aesthetic: matches the "Verdant Apothecary" tokens in
 * `src/app/globals.css` so the installed home-screen app reads as one
 * piece with the web shell.
 *   --bg      #FFFCF7  (warm parchment)
 *   --leaf    #1F4D37  (deep forest accent)
 *
 * Icons live under `public/icons/*` as SVG (crisp on every density).
 * Follow-ups (tracked in PR description, not blocking install):
 *   - designer pass on the leaf glyph
 *   - PNG fallback icons (192/512) for older Android launchers
 *   - service-worker caching strategy (review-gated, separate PR)
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "LeafJourney EMR",
    short_name: "LeafJourney",
    description:
      "AI-native specialty-adaptive EMR — patient portal, clinician workspace, and practice operations in one home.",
    // "/" lets the auth gate route the user to the right surface
    // (clinician → /clinic, patient → /portal, etc.) without forcing a
    // role-specific landing for installs that come from public pages.
    start_url: "/",
    scope: "/",
    display: "standalone",
    display_override: ["window-controls-overlay", "standalone", "minimal-ui"],
    orientation: "portrait",
    background_color: "#FFFCF7",
    theme_color: "#1F4D37",
    lang: "en",
    dir: "ltr",
    categories: ["medical", "productivity", "health"],
    icons: [
      {
        src: "/icon.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "any",
      },
      {
        src: "/icons/icon-192.svg",
        sizes: "192x192",
        type: "image/svg+xml",
        purpose: "any",
      },
      {
        src: "/icons/icon-512.svg",
        sizes: "512x512",
        type: "image/svg+xml",
        purpose: "any",
      },
      {
        src: "/icons/icon-maskable-512.svg",
        sizes: "512x512",
        type: "image/svg+xml",
        purpose: "maskable",
      },
    ],
    shortcuts: [
      {
        name: "Log a dose",
        short_name: "Log dose",
        description: "Quick post-dose check-in.",
        url: "/portal/log-dose",
        icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml" }],
      },
      {
        name: "Today's check-in",
        short_name: "Check-in",
        description: "How are you feeling today?",
        url: "/portal/outcomes",
        icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml" }],
      },
      {
        name: "Messages",
        short_name: "Messages",
        description: "Talk to your care team.",
        url: "/portal/messages",
        icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml" }],
      },
    ],
    prefer_related_applications: false,
  };
}
