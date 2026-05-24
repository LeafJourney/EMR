import { SiteHeader } from "@/components/marketing/SiteHeader";
import { SiteFooter } from "@/components/marketing/SiteFooter";
import { Eyebrow, EditorialRule } from "@/components/ui/ornament";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  CheckCircle2,
  Shield,
  Brain,
  Stethoscope,
  LineChart,
  Pill,
  Sprout,
  MessageSquare,
  ArrowRight,
} from "lucide-react";
import Link from "next/link";

export const metadata = {
  title: "Features — Leafjourney",
  description:
    "AI-native charting, clinical decision support, the Cannabis Combo Wheel, and outcome tracking — every tool a modern cannabis clinic needs in one place.",
};

const FEATURES = [
  {
    icon: Brain,
    title: "AI-Native Charting",
    description:
      "Our fleet of 13 autonomous subagents reviews patient history, listens to the encounter, and drafts complete SOAP notes before you even leave the room.",
  },
  {
    icon: Stethoscope,
    title: "Clinical Decision Support",
    description:
      "Real-time drug interaction checking and condition-to-cannabinoid matching powered by our proprietary database of 11,000+ peer-reviewed studies.",
  },
  {
    icon: Sprout,
    title: "Pharmacopeia Combo Wheel",
    description:
      "Visualize complex cannabinoid and terpene synergies with our interactive D3.js visualization to find the perfect botanical formula.",
  },
  {
    icon: LineChart,
    title: "Outcome Tracking",
    description:
      "Patients log their doses and symptom relief via the portal. You get beautiful sparklines and trend graphs right in the clinical dashboard.",
  },
  {
    icon: Pill,
    title: "E-Prescribing & Leafmart",
    description:
      "Write cannabis recommendations that seamlessly sync to Leafmart, allowing patients to securely purchase and ship verified botanical products.",
  },
  {
    icon: MessageSquare,
    title: "Secure Messaging & Triage",
    description:
      "HIPAA-compliant asynchronous chat with patients, featuring AI-triage that automatically flags high-risk symptoms for immediate clinical review.",
  },
];

export default function FeaturesPage() {
  return (
    <div className="min-h-screen bg-bg relative overflow-hidden">
      {/* Ambient wash — consistent with the rest of the marketing surface */}
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

      <main
        id="main-content"
        className="max-w-[1320px] mx-auto px-6 lg:px-12 pt-16 pb-24"
      >
        {/* Hero — Stripe-style: one-sentence value prop, two CTAs */}
        <div className="max-w-3xl mx-auto text-center mb-16 animate-in fade-in slide-in-from-bottom-4 duration-700">
          <Eyebrow className="justify-center mb-6">Platform capabilities</Eyebrow>
          <h1 className="font-display text-5xl md:text-6xl text-text leading-[1.05] tracking-tight mb-6">
            Everything you need to{" "}
            <span className="text-accent italic">practice modern medicine</span>.
          </h1>
          <p className="text-lg md:text-xl text-text-muted leading-relaxed">
            Leafjourney unifies the patient experience, clinical charting, and
            dispensary fulfillment into one intelligent platform.
          </p>
          <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
            <Link href="/book-demo">
              <Button size="lg" trailingIcon={<ArrowRight className="w-4 h-4" />}>
                Request a demo
              </Button>
            </Link>
            <Link href="/pricing">
              <Button size="lg" variant="secondary">
                See pricing
              </Button>
            </Link>
          </div>
        </div>

        <EditorialRule />

        {/* Feature grid */}
        <section
          aria-labelledby="features-heading"
          className="pt-16 pb-20 animate-in fade-in slide-in-from-bottom-8 duration-700 delay-150"
        >
          <h2 id="features-heading" className="sr-only">
            Platform features
          </h2>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6 lg:gap-8">
            {FEATURES.map((feature) => (
              <article
                key={feature.title}
                className="bg-surface-raised rounded-3xl p-8 border border-border hover:border-accent/40 hover:shadow-md transition-all duration-300 group h-full"
              >
                <div className="w-14 h-14 bg-surface border border-border rounded-2xl flex items-center justify-center mb-6 group-hover:bg-accent/10 group-hover:border-accent/30 transition-all duration-300">
                  <feature.icon
                    className="w-6 h-6 text-text-muted group-hover:text-accent transition-colors"
                    strokeWidth={1.75}
                  />
                </div>
                {/* h3 inside an h2-labelled section keeps the heading order
                    h1 (hero) → h2 (section) → h3 (card title) clean for
                    axe / screen readers. (EMR-713 follow-up.) */}
                <h3 className="font-display text-2xl font-medium text-text tracking-tight mb-3">
                  {feature.title}
                </h3>
                <p className="text-text-muted leading-relaxed text-[15px]">
                  {feature.description}
                </p>
              </article>
            ))}
          </div>
        </section>

        <EditorialRule />

        {/* Enterprise / Security band */}
        <section
          aria-labelledby="security-heading"
          className="bg-surface rounded-[2.5rem] border border-border p-10 md:p-16 lg:p-20 grid lg:grid-cols-2 gap-12 items-center mt-16"
        >
          <div>
            <Badge tone="accent" className="mb-6">
              Enterprise grade
            </Badge>
            <h2
              id="security-heading"
              className="font-display text-4xl md:text-5xl text-text tracking-tight leading-tight mb-6"
            >
              Built for security and compliance from day one.
            </h2>
            <ul className="space-y-4 mb-10">
              <li className="flex items-start gap-3">
                <CheckCircle2
                  className="w-6 h-6 text-accent shrink-0"
                  aria-hidden="true"
                />
                <span className="text-[17px] text-text-muted leading-relaxed">
                  HIPAA, SOC 2, and GDPR-aligned infrastructure.
                </span>
              </li>
              <li className="flex items-start gap-3">
                <CheckCircle2
                  className="w-6 h-6 text-accent shrink-0"
                  aria-hidden="true"
                />
                <span className="text-[17px] text-text-muted leading-relaxed">
                  End-to-end encryption for all protected health information.
                </span>
              </li>
              <li className="flex items-start gap-3">
                <CheckCircle2
                  className="w-6 h-6 text-accent shrink-0"
                  aria-hidden="true"
                />
                <span className="text-[17px] text-text-muted leading-relaxed">
                  Immutable, cryptographic audit logs for every chart change.
                </span>
              </li>
            </ul>
            <Link href="/security">
              <Button
                variant="secondary"
                size="lg"
                trailingIcon={<ArrowRight className="w-4 h-4" />}
              >
                Read the security overview
              </Button>
            </Link>
          </div>
          <div className="relative" aria-hidden="true">
            <div className="absolute inset-0 bg-gradient-to-tr from-accent/20 to-transparent blur-3xl rounded-full" />
            <div className="relative bg-white p-8 rounded-3xl shadow-2xl border border-border">
              <div className="flex items-center justify-center py-12">
                <Shield
                  className="w-32 h-32 text-accent opacity-80"
                  strokeWidth={1}
                />
              </div>
            </div>
          </div>
        </section>

        {/* Closing CTA */}
        <section className="mt-20">
          <div className="relative overflow-hidden rounded-3xl border border-border bg-gradient-to-br from-surface-raised via-surface-raised to-accent/[0.04] p-10 md:p-16 ambient">
            <div className="relative max-w-2xl">
              <Eyebrow className="mb-4">See it in action</Eyebrow>
              <h2 className="font-display text-3xl md:text-4xl text-text tracking-tight leading-[1.1]">
                Ready to give your clinicians their time back?
              </h2>
              <p className="text-[15px] text-text-muted mt-4 leading-relaxed">
                A 20-minute walkthrough with the founders covers the agent
                fleet, the Combo Wheel, and how your existing workflow maps
                onto Leafjourney.
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <Link href="/book-demo">
                  <Button
                    size="lg"
                    trailingIcon={<ArrowRight className="w-4 h-4" />}
                  >
                    Request a demo
                  </Button>
                </Link>
                <Link href="/pricing">
                  <Button size="lg" variant="ghost">
                    Compare plans
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
