import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft, Pill } from "lucide-react";
import { SiteHeader } from "@/components/marketing/SiteHeader";
import { SiteFooter } from "@/components/marketing/SiteFooter";
import { Eyebrow } from "@/components/ui/ornament";
import { DrugMixChecker } from "@/components/education/DrugMixChecker";
import { SITE_URL } from "@/lib/seo";

/**
 * EMR-617 — Drug Mix standalone module.
 *
 * Public, patient-facing drug-interaction checker. No login required and no
 * PHI is captured (everything lives in component state). The same
 * `DrugMixChecker` is also embedded as a tab on /education for users who
 * arrive at the hub first.
 */
export const metadata: Metadata = {
  title: "Drug Mix — Cannabis interaction checker — Leafjourney",
  description:
    "Add all of your medications and supplements to see if they interact with cannabis. Green/yellow/red verdicts from the same evidence base our clinicians use.",
  alternates: { canonical: `${SITE_URL}/education/drug-mix` },
  robots: { index: true, follow: true },
  openGraph: {
    title: "Drug Mix — Cannabis interaction checker",
    description:
      "Patient-friendly cannabis interaction checker. No login required.",
    url: `${SITE_URL}/education/drug-mix`,
    siteName: "Leafjourney",
    type: "website",
  },
};

export default function DrugMixPage() {
  return (
    <div className="min-h-screen bg-bg">
      <SiteHeader />

      <main id="main-content">
        <section className="max-w-[1320px] mx-auto px-6 lg:px-12 pt-12 pb-8 lg:pt-16 lg:pb-10">
          <Link
            href="/education"
            className="inline-flex items-center gap-1 text-sm font-semibold text-text-muted hover:text-accent transition-colors mb-6"
          >
            <ChevronLeft className="w-4 h-4" aria-hidden="true" />
            Back to Education
          </Link>

          <div className="text-center">
            <Eyebrow className="justify-center mb-5 text-accent">
              <Pill className="w-3.5 h-3.5" aria-hidden="true" />
              Drug Mix
            </Eyebrow>
            <h1 className="font-display text-4xl md:text-5xl lg:text-6xl tracking-tight text-text leading-[1.05] mb-5">
              Cannabis Interaction Checker
            </h1>
            <p className="text-lg md:text-xl text-text-muted max-w-2xl mx-auto leading-relaxed">
              Add all of your medications and supplements to see if they
              interact with cannabis.
            </p>
          </div>
        </section>

        <section className="max-w-[1320px] mx-auto px-6 lg:px-12 pb-20">
          <DrugMixChecker heading={null} />
        </section>

        <section className="max-w-3xl mx-auto px-6 lg:px-12 pb-20 text-xs text-text-muted leading-relaxed">
          <p className="mb-2">
            <strong className="text-text">For education only.</strong> This
            checker draws on the same interaction database used by clinicians
            on Leafjourney, but it is not a substitute for advice from your
            doctor or pharmacist. Always discuss new medications, supplements,
            or cannabis use with your care team.
          </p>
          <p>
            We do not store the list you enter. Nothing is sent to a Leafjourney
            account, and no record is kept in your browser after you leave.
          </p>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}
