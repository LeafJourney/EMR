"use client";

import Link from "next/link";
import { Fragment, useState } from "react";
import { Check, Minus, ArrowRight, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Eyebrow, EditorialRule } from "@/components/ui/ornament";
import { cn } from "@/lib/utils/cn";

type Tier = {
  id: "starter" | "professional" | "enterprise";
  name: string;
  priceMonthly: number | null;
  priceLabel?: string;
  blurb: string;
  features: string[];
  cta: { label: string; href: string };
  featured?: boolean;
};

const TIERS: Tier[] = [
  {
    id: "starter",
    name: "Starter",
    priceMonthly: 0,
    priceLabel: "Free trial",
    blurb: "Get a feel for the platform with a single provider.",
    features: [
      "1 provider",
      "Up to 25 patients",
      "Basic AI scribe",
      "Outcome tracking",
      "Community support",
    ],
    cta: { label: "Start free trial", href: "/sign-up" },
  },
  {
    id: "professional",
    name: "Professional",
    priceMonthly: 199,
    blurb: "Everything a modern cannabis clinic needs to run end-to-end.",
    features: [
      "Unlimited patients",
      "Full AI agent fleet (13 agents)",
      "Cannabis Combo Wheel",
      "Research Console (50+ studies)",
      "Drug interaction checker",
      "Priority support",
      "Custom intake forms",
    ],
    // Professional is the B2B funnel — route to /book-demo (sales
    // intake) rather than /sign-up (Clerk account creation). Matches
    // the fix applied to the homepage hero CTAs in PR #258.
    cta: { label: "Request demo", href: "/book-demo" },
    featured: true,
  },
  {
    id: "enterprise",
    name: "Enterprise",
    priceMonthly: null,
    priceLabel: "Contact us",
    blurb: "For multi-location practices and health systems.",
    features: [
      "Multi-location support",
      "Custom integrations",
      "Dedicated account manager",
      "SLA guarantees",
      "HIPAA BAA included",
      "Volume pricing",
    ],
    cta: { label: "Contact sales", href: "mailto:sales@leafjourney.com" },
  },
];

type Cell = boolean | string;

const COMPARISON: { group: string; rows: { label: string; cells: [Cell, Cell, Cell] }[] }[] = [
  {
    group: "Patient capacity",
    rows: [
      { label: "Providers", cells: ["1", "Unlimited", "Unlimited"] },
      { label: "Patients", cells: ["25", "Unlimited", "Unlimited"] },
      { label: "Locations", cells: ["1", "1", "Multi-location"] },
    ],
  },
  {
    group: "Clinical AI",
    rows: [
      { label: "Basic AI scribe", cells: [true, true, true] },
      { label: "Full AI agent fleet (13 agents)", cells: [false, true, true] },
      { label: "Cannabis Combo Wheel", cells: [false, true, true] },
      { label: "Research Console (50+ studies)", cells: [false, true, true] },
      { label: "Drug interaction checker", cells: [false, true, true] },
    ],
  },
  {
    group: "Workflow",
    rows: [
      { label: "Outcome tracking", cells: [true, true, true] },
      { label: "Custom intake forms", cells: [false, true, true] },
      { label: "Custom integrations", cells: [false, false, true] },
    ],
  },
  {
    group: "Support & compliance",
    rows: [
      { label: "Community support", cells: [true, true, true] },
      { label: "Priority support", cells: [false, true, true] },
      { label: "Dedicated account manager", cells: [false, false, true] },
      { label: "HIPAA BAA included", cells: [false, false, true] },
      { label: "SLA guarantees", cells: [false, false, true] },
    ],
  },
];

const FAQS = [
  {
    q: "Can I try before I buy?",
    a: "Yes. The Starter tier is a free trial with no credit card required — bring up to 25 patients onto the platform and explore the full clinical workflow.",
  },
  {
    q: "What's included in the free trial?",
    a: "One provider, up to 25 patients, the basic AI scribe, outcome tracking, and our community support. Upgrade to Professional any time to unlock the full agent fleet and unlimited patients.",
  },
  {
    q: "Is my data HIPAA compliant?",
    a: "Leafjourney is built HIPAA-compliant from the ground up. A signed BAA is included on Enterprise; Professional customers can request one as part of their contract.",
  },
  {
    q: "Can I cancel anytime?",
    a: "Yes. Monthly plans cancel at the end of the current billing period; annual plans are pre-paid and non-refundable but won't auto-renew once cancelled.",
  },
  {
    q: "Do you offer discounts for multi-provider practices?",
    a: "Volume pricing kicks in at 5+ providers and is included with Enterprise. Contact sales for a custom quote based on your team size and location count.",
  },
];

function priceFor(tier: Tier, annual: boolean) {
  if (tier.priceMonthly === null) return tier.priceLabel ?? "Contact us";
  if (tier.priceMonthly === 0) return tier.priceLabel ?? "Free";
  const monthly = annual
    ? Math.round(tier.priceMonthly * 0.8)
    : tier.priceMonthly;
  return `$${monthly}`;
}

export function PricingClient() {
  const [annual, setAnnual] = useState(false);
  const [openFaq, setOpenFaq] = useState<number | null>(0);

  return (
    <main className="relative overflow-hidden">
      {/* Ambient wash */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 -z-10"
        style={{
          background:
            "radial-gradient(ellipse 60% 50% at 85% 5%, var(--highlight-soft), transparent 65%)," +
            "radial-gradient(ellipse 50% 60% at 10% 30%, var(--accent-soft), transparent 60%)",
        }}
      />

      {/* Hero */}
      <section className="max-w-[1280px] mx-auto px-6 lg:px-12 pt-16 pb-10 text-center">
        <Eyebrow className="mb-6 justify-center">Pricing</Eyebrow>
        <h1 className="font-display text-4xl md:text-5xl lg:text-6xl leading-[1.05] tracking-tight text-text max-w-3xl mx-auto">
          Simple, transparent pricing.
        </h1>
        <p className="text-[17px] md:text-lg text-text-muted mt-6 max-w-2xl mx-auto leading-relaxed">
          Start free, scale when ready. No hidden fees, no per-patient charges,
          no surprise overages.
        </p>
      </section>

      {/* Toggle */}
      <div className="flex items-center justify-center gap-3 mb-12 px-6">
        <span
          className={cn(
            "text-sm transition-colors",
            !annual ? "text-text font-medium" : "text-text-muted"
          )}
        >
          Monthly
        </span>
        <button
          type="button"
          onClick={() => setAnnual(!annual)}
          aria-pressed={annual}
          aria-label="Toggle annual billing"
          className="relative w-12 h-6 rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 focus-visible:ring-offset-2 focus-visible:ring-offset-bg"
          style={{
            backgroundColor: annual ? "var(--accent)" : "var(--surface-muted)",
          }}
        >
          <span
            className={cn(
              "absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform",
              annual ? "translate-x-[26px]" : "translate-x-0.5"
            )}
          />
        </button>
        <span
          className={cn(
            "text-sm transition-colors inline-flex items-center gap-2",
            annual ? "text-text font-medium" : "text-text-muted"
          )}
        >
          Annual
          <span className="text-accent text-xs font-medium">Save 20%</span>
        </span>
      </div>

      {/* Tier cards */}
      <section className="max-w-[1280px] mx-auto px-6 lg:px-12 pb-20">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 lg:gap-5 lg:items-stretch">
          {TIERS.map((tier) => (
            <article
              key={tier.id}
              className={cn(
                "relative flex flex-col rounded-3xl p-8 lg:p-10",
                tier.featured
                  ? "border-2 border-accent bg-gradient-to-b from-accent/[0.06] to-transparent shadow-lg lg:scale-[1.02] z-10"
                  : "border border-border bg-surface-raised shadow-sm"
              )}
            >
              {tier.featured && (
                <span className="absolute -top-3 left-1/2 -translate-x-1/2 bg-accent text-accent-ink text-[11px] font-semibold uppercase tracking-wider px-3 py-1 rounded-full shadow-seal">
                  Most popular
                </span>
              )}

              <h3 className="font-display text-2xl text-text tracking-tight">
                {tier.name}
              </h3>
              <p className="text-sm text-text-muted mt-2 leading-relaxed min-h-[40px]">
                {tier.blurb}
              </p>

              <div className="mt-6 flex items-baseline gap-1.5">
                <span className="font-display text-5xl text-text tracking-tight">
                  {priceFor(tier, annual)}
                </span>
                {tier.priceMonthly && tier.priceMonthly > 0 && (
                  <span className="text-sm text-text-muted">
                    /mo {annual && <span className="text-text-subtle">· billed annually</span>}
                  </span>
                )}
              </div>
              {tier.priceMonthly && tier.priceMonthly > 0 && (
                <p className="text-xs text-text-subtle mt-1">per provider</p>
              )}

              <Link href={tier.cta.href} className="mt-8 block">
                <Button
                  variant={tier.featured ? "primary" : "secondary"}
                  size="lg"
                  className="w-full"
                  trailingIcon={<ArrowRight className="w-4 h-4" />}
                >
                  {tier.cta.label}
                </Button>
              </Link>

              <ul className="mt-8 space-y-3">
                {tier.features.map((f) => (
                  <li
                    key={f}
                    className="flex items-start gap-2.5 text-sm text-text-muted"
                  >
                    <Check className="w-4 h-4 text-accent shrink-0 mt-0.5" />
                    <span>{f}</span>
                  </li>
                ))}
              </ul>
            </article>
          ))}
        </div>
      </section>

      <EditorialRule className="max-w-[1280px] mx-auto px-6 lg:px-12" />

      {/* Comparison table */}
      <section className="max-w-[1280px] mx-auto px-6 lg:px-12 py-20">
        <div className="max-w-2xl mb-10">
          <Eyebrow className="mb-4">Compare plans</Eyebrow>
          <h2 className="font-display text-3xl md:text-4xl text-text tracking-tight leading-[1.1]">
            Every feature, side by side.
          </h2>
        </div>

        <div className="overflow-x-auto -mx-6 lg:mx-0 px-6 lg:px-0">
          <table className="w-full min-w-[640px] font-mono text-xs border-separate border-spacing-0">
            <thead>
              <tr>
                <th className="text-left font-medium text-text-muted uppercase tracking-wider py-4 pr-4 border-b border-border w-[44%]">
                  Feature
                </th>
                {TIERS.map((tier) => (
                  <th
                    key={tier.id}
                    className={cn(
                      "text-center font-medium uppercase tracking-wider py-4 px-3 border-b border-border",
                      tier.featured ? "text-accent" : "text-text-muted"
                    )}
                  >
                    {tier.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {COMPARISON.map((group) => (
                <Fragment key={group.group}>
                  <tr>
                    <td
                      colSpan={4}
                      className="pt-8 pb-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-accent"
                    >
                      {group.group}
                    </td>
                  </tr>
                  {group.rows.map((row) => (
                    <tr key={`${group.group}-${row.label}`}>
                      <td className="py-3 pr-4 text-sm font-sans text-text border-b border-border/60">
                        {row.label}
                      </td>
                      {row.cells.map((cell, i) => (
                        <td
                          key={i}
                          className={cn(
                            "py-3 px-3 text-center border-b border-border/60",
                            TIERS[i].featured && "bg-accent/[0.04]"
                          )}
                        >
                          {typeof cell === "boolean" ? (
                            cell ? (
                              <Check className="w-4 h-4 text-accent inline-block" />
                            ) : (
                              <Minus className="w-4 h-4 text-text-subtle inline-block" />
                            )
                          ) : (
                            <span className="font-sans text-sm text-text">
                              {cell}
                            </span>
                          )}
                        </td>
                      ))}
                    </tr>
                  ))}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <EditorialRule className="max-w-[1280px] mx-auto px-6 lg:px-12" />

      {/* FAQ */}
      <section className="max-w-[1280px] mx-auto px-6 lg:px-12 py-20">
        <div className="max-w-2xl mb-10">
          <Eyebrow className="mb-4">Questions</Eyebrow>
          <h2 className="font-display text-3xl md:text-4xl text-text tracking-tight leading-[1.1]">
            Frequently asked.
          </h2>
        </div>

        <div className="max-w-3xl divide-y divide-border border-y border-border">
          {FAQS.map((item, i) => {
            const open = openFaq === i;
            return (
              <div key={item.q}>
                <button
                  type="button"
                  onClick={() => setOpenFaq(open ? null : i)}
                  aria-expanded={open}
                  className="w-full flex items-center justify-between gap-4 py-5 text-left group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 rounded-md"
                >
                  <span className="font-display text-lg text-text tracking-tight group-hover:text-accent transition-colors">
                    {item.q}
                  </span>
                  <span
                    className={cn(
                      "shrink-0 w-7 h-7 rounded-full border border-border flex items-center justify-center text-text-muted transition-transform",
                      open && "rotate-45 border-accent text-accent"
                    )}
                    aria-hidden="true"
                  >
                    <Plus className="w-3.5 h-3.5" />
                  </span>
                </button>
                {open && (
                  <p className="text-sm text-text-muted leading-relaxed pb-5 pr-12 -mt-1">
                    {item.a}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {/* CTA */}
      <section className="max-w-[1280px] mx-auto px-6 lg:px-12 pb-24">
        <div className="relative overflow-hidden rounded-3xl border border-border bg-surface-raised p-10 md:p-14 ambient">
          <div className="relative max-w-2xl">
            <Eyebrow className="mb-4">Ready when you are</Eyebrow>
            <h2 className="font-display text-3xl md:text-4xl text-text tracking-tight leading-[1.1]">
              Start free. Upgrade when your practice is ready.
            </h2>
            <p className="text-[15px] text-text-muted mt-4 leading-relaxed">
              See Leafjourney with your own patients in under five minutes — or
              talk to our team about what a custom rollout looks like.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="/sign-up">
                <Button size="lg" trailingIcon={<ArrowRight className="w-4 h-4" />}>
                  Start free trial
                </Button>
              </Link>
              <Link href="mailto:sales@leafjourney.com">
                <Button size="lg" variant="ghost">
                  Talk to sales
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
