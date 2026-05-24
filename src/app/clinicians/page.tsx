// ---------------------------------------------------------------------------
// EMR-311 — Public clinician directory
// ---------------------------------------------------------------------------
// Server component. Renders the seed listings; the patient-state filter
// is a client island that calls into the compliance matcher.
//
// UX polish (ux/marketing-polish-stripe-tier): the directory route was
// previously chrome-less — no SiteHeader, no SiteFooter, no closing CTA,
// just a header + filter. Visitors hitting /clinicians from a search engine
// had no path back into the rest of the marketing site. This pass adds the
// shared marketing chrome, an Eyebrow + larger hero, supporting copy that
// reinforces the value prop, and a closing CTA so the page doesn't dead-end.
// ---------------------------------------------------------------------------

import Link from "next/link";

import { listListings } from "@/lib/clinicians";
import { Button } from "@/components/ui/button";
import { Eyebrow, EditorialRule } from "@/components/ui/ornament";
import { SiteHeader } from "@/components/marketing/SiteHeader";
import { SiteFooter } from "@/components/marketing/SiteFooter";

import { DirectoryFilters } from "./DirectoryFilters";

export const metadata = {
  title: "Find a clinician — Leafjourney",
  description:
    "Browse verified cannabis-friendly clinicians. Filtered by state, visit type, and program rules so every result is one you can actually book.",
};

export default async function ClinicianDirectoryPage() {
  const listings = listListings();

  return (
    <div className="min-h-screen bg-bg relative overflow-hidden">
      {/* Ambient wash — matches /about + /security */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 -z-10"
        style={{
          background:
            "radial-gradient(ellipse 60% 50% at 85% 10%, var(--highlight-soft), transparent 65%)," +
            "radial-gradient(ellipse 50% 60% at 10% 90%, var(--accent-soft), transparent 60%)",
        }}
      />

      <SiteHeader />

      <main id="main-content">
        {/* Hero */}
        <section className="max-w-[1200px] mx-auto px-6 lg:px-12 pt-12 pb-10">
          <Eyebrow className="mb-6">Find a clinician</Eyebrow>
          <h1 className="font-display text-4xl md:text-5xl lg:text-6xl leading-[1.05] tracking-tight text-text max-w-3xl">
            Verified cannabis-friendly{" "}
            <span className="text-accent">clinicians</span>.
          </h1>
          <p className="text-[17px] md:text-lg text-text-muted mt-7 max-w-2xl leading-relaxed">
            We only show you clinicians who can legally see you for the visit
            you need — based on your state, what you&apos;re looking for, and any
            state cannabis-program rules in play.
          </p>
        </section>

        <EditorialRule className="max-w-[1200px] mx-auto px-6 lg:px-12" />

        {/* Directory */}
        <section className="max-w-[1200px] mx-auto px-6 lg:px-12 py-10">
          <DirectoryFilters listings={listings} />
        </section>

        {/* Closing CTA — every marketing page needs a way forward */}
        <section className="max-w-[1200px] mx-auto px-6 lg:px-12 pb-24 pt-6">
          <div className="relative overflow-hidden rounded-3xl border border-border bg-surface-raised p-10 md:p-14 ambient">
            <div className="relative max-w-2xl">
              <Eyebrow className="mb-4">Clinicians</Eyebrow>
              <h2 className="font-display text-3xl md:text-4xl text-text tracking-tight leading-[1.1]">
                Want to be listed here?
              </h2>
              <p className="text-[15px] text-text-muted mt-4 leading-relaxed">
                Leafjourney&apos;s clinician network is opening to new
                cannabis-friendly providers across the country. If you
                practice cannabis medicine and want a directory presence —
                plus the full Leafjourney clinician workspace — we&apos;d love
                to talk.
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <Link href="/book-demo">
                  <Button size="lg">Request a demo</Button>
                </Link>
                <Link href="/pricing">
                  <Button size="lg" variant="ghost">
                    See pricing
                  </Button>
                </Link>
              </div>
            </div>
          </div>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}
