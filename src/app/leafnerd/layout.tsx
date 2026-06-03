import type { Metadata } from "next";
// Scoped "botanical" theme for the Leafnerd FHIR Intelligence SPA. Every rule is
// namespaced under `.ln-root`, so importing it here does not affect the rest of
// the EMR. The SPA renders its own rail + command bar, so this layout is just a
// full-bleed, full-height wrapper.
import "@/components/leafnerd/fhir-intelligence/leafnerd-theme.css";

export const metadata: Metadata = {
  title: "Leafnerd — FHIR Intelligence",
  description: "Population-health intelligence and FHIR data quality, with provenance on every number.",
};

export default function LeafNerdLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {/* Geist matches the prototype; gracefully falls back to system fonts (theme --font) if the CDN is unavailable. */}
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      <link
        href="https://fonts.googleapis.com/css2?family=Geist+Mono:wght@400..600&family=Geist:wght@300;400;450;500;550;600;700&display=swap"
        rel="stylesheet"
      />
      <div style={{ height: "100vh", overflow: "hidden" }} suppressHydrationWarning>
        {children}
      </div>
    </>
  );
}
