import Link from "next/link";
import type { Metadata } from "next";
import { Button } from "@/components/ui/button";
import { Eyebrow, EditorialRule, LeafSprig } from "@/components/ui/ornament";
import { SiteHeader } from "@/components/marketing/SiteHeader";
import { SiteFooter } from "@/components/marketing/SiteFooter";
import {
  MARKETING_SEGMENTS,
  COMPETITORS,
  GTM_TIMELINE,
  totalAddressableProviders,
  valuePropFor,
} from "@/lib/marketing/business-plan";

export const metadata: Metadata = {
  title: "Business Plan — Leafjourney",
  description:
    "Who we sell to, what we offer them, who we compete with, and what ships next. The Leafjourney business plan in plain English.",
};

const STATUS_COPY: Record<string, { label: string; tone: string }> = {
  shipped: { label: "Shipped", tone: "bg-accent/15 text-accent border-accent/30" },
  in_progress: { label: "In progress", tone: "bg-highlight/15 text-highlight border-highlight/40" },
  planned: { label: "Planned", tone: "bg-surface-muted text-text-subtle border-border" },
};

export default function BusinessPlanPage() {
  const tam = totalAddressableProviders();

  return (
    <div className="min-h-screen bg-bg relative overflow-hidden">
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
      <section className="max-w-[1280px] mx-auto px-6 lg:px-12 pt-12 pb-12">
        <Eyebrow className="mb-6">Our business plan</Eyebrow>
        <h1 className="font-display text-4xl md:text-5xl lg:text-6xl leading-[1.05] tracking-tight text-text max-w-3xl">
          Who we serve.
          <br />
          <span className="text-accent">What we ship.</span>
          <br />
          How we get there.
        </h1>
        <p className="text-[17px] md:text-lg text-text-muted mt-7 max-w-2xl leading-relaxed">
          A marketing-grade business plan written by the team who&apos;s
          actually building the EMR. Numbers we can defend, segments we can
          reach, competitors we respect.
        </p>

        <div className="mt-10 grid grid-cols-2 md:grid-cols-4 gap-3 max-w-3xl">
          <SummaryTile label="Target providers" value={tam.toLocaleString()} sub="US clinicians across 5 segments" />
          <SummaryTile label="Pricing floor" value="$199/mo" sub="Solo practitioner, all-in" />
          <SummaryTile label="Day-15 readiness" value="Go-live" sub="Onboarding plan ships with the EMR" />
          <SummaryTile label="Ship cadence" value="Quarterly" sub="GA, GA, GA — public roadmap" />
        </div>
      </section>

      <EditorialRule className="max-w-[1280px] mx-auto px-6 lg:px-12" />

      {/* Target market segments */}
      <section className="max-w-[1280px] mx-auto px-6 lg:px-12 py-16">
        <div className="max-w-2xl mb-12">
          <Eyebrow className="mb-4">Target market segments</Eyebrow>
          <h2 className="font-display text-3xl md:text-4xl text-text tracking-tight leading-[1.1]">
            Five practices, one EMR.
          </h2>
          <p className="text-[15px] text-text-muted mt-4 leading-relaxed">
            We don&apos;t try to be everything to everyone. The EMR is built
            for these five segments first; everyone else benefits when we ship
            for them well.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {MARKETING_SEGMENTS.map((seg) => {
            const vp = valuePropFor(seg.id);
            return (
              <article
                key={seg.id}
                className="bg-surface-raised rounded-2xl border border-border p-7 shadow-sm card-hover"
              >
                <div className="flex items-start gap-3 mb-4">
                  <LeafSprig size={20} className="text-accent mt-1 shrink-0" />
                  <div>
                    <h3 className="font-display text-xl text-text tracking-tight">
                      {seg.name}
                    </h3>
                    <p className="text-xs text-accent uppercase tracking-wider font-medium mt-1">
                      {seg.kind.replace(/_/g, " ")}
                    </p>
                  </div>
                </div>

                <p className="text-sm text-text-muted leading-relaxed mb-3">
                  <span className="font-medium text-text">Who: </span>
                  {seg.who}
                </p>
                <p className="text-sm text-text-muted leading-relaxed mb-3">
                  <span className="font-medium text-text">Pain: </span>
                  {seg.pain}
                </p>
                <p className="text-sm text-text-muted leading-relaxed mb-5">
                  <span className="font-medium text-text">Promise: </span>
                  {seg.promise}
                </p>

                <p className="text-[10px] uppercase tracking-[0.14em] text-text-subtle font-medium mb-2">
                  Value props
                </p>
                <ul className="space-y-1.5">
                  {seg.valueProps.map((prop, i) => (
                    <li key={i} className="text-[13px] text-text-muted leading-relaxed flex gap-2">
                      <span className="text-accent shrink-0">→</span>
                      <span>{prop}</span>
                    </li>
                  ))}
                </ul>

                {vp && (
                  <div className="mt-5 pt-4 border-t border-border/60">
                    <p className="font-display text-base text-text">{vp.headline}</p>
                    <p className="text-[13px] text-text-muted mt-1 leading-relaxed">{vp.subhead}</p>
                  </div>
                )}
              </article>
            );
          })}
        </div>
      </section>

      <EditorialRule className="max-w-[1280px] mx-auto px-6 lg:px-12" />

      {/* Competitive analysis */}
      <section className="max-w-[1280px] mx-auto px-6 lg:px-12 py-16">
        <div className="max-w-2xl mb-12">
          <Eyebrow className="mb-4">Competitive landscape</Eyebrow>
          <h2 className="font-display text-3xl md:text-4xl text-text tracking-tight leading-[1.1]">
            Who we line up against — honestly.
          </h2>
          <p className="text-[15px] text-text-muted mt-4 leading-relaxed">
            We respect the incumbents. Epic, Athena, and Elation built real
            products. They just didn&apos;t build them for the practice that
            uses cannabis as a primary modality.
          </p>
        </div>

        <div className="overflow-x-auto -mx-6 lg:mx-0">
          <table className="w-full min-w-[840px] border-separate border-spacing-y-2 px-6 lg:px-0">
            <thead>
              <tr className="text-left text-[10px] uppercase tracking-[0.14em] text-text-subtle font-medium">
                <th className="px-4 py-2">Competitor</th>
                <th className="px-4 py-2">Tier</th>
                <th className="px-4 py-2">Strengths</th>
                <th className="px-4 py-2">Gaps for us</th>
                <th className="px-4 py-2">Our angle</th>
              </tr>
            </thead>
            <tbody>
              {COMPETITORS.map((c) => (
                <tr key={c.id} className="bg-surface-raised align-top">
                  <td className="px-4 py-4 rounded-l-xl border-y border-l border-border">
                    <p className="font-display text-base text-text">{c.name}</p>
                    <p className="text-[12px] text-text-muted leading-relaxed mt-1">{c.positioning}</p>
                  </td>
                  <td className="px-4 py-4 border-y border-border">
                    <span className="text-[10px] uppercase tracking-wider text-accent font-medium">
                      {c.tier.replace(/_/g, " ")}
                    </span>
                  </td>
                  <td className="px-4 py-4 border-y border-border">
                    <ul className="space-y-1">
                      {c.strengths.map((s, i) => (
                        <li key={i} className="text-[12.5px] text-text-muted leading-relaxed">• {s}</li>
                      ))}
                    </ul>
                  </td>
                  <td className="px-4 py-4 border-y border-border">
                    <ul className="space-y-1">
                      {c.gaps.map((g, i) => (
                        <li key={i} className="text-[12.5px] text-text-muted leading-relaxed">• {g}</li>
                      ))}
                    </ul>
                  </td>
                  <td className="px-4 py-4 rounded-r-xl border-y border-r border-border">
                    <p className="text-[13px] text-text leading-relaxed font-medium">{c.ourAngle}</p>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <EditorialRule className="max-w-[1280px] mx-auto px-6 lg:px-12" />

      {/* Go-to-market timeline */}
      <section className="max-w-[1280px] mx-auto px-6 lg:px-12 py-16">
        <div className="max-w-2xl mb-12">
          <Eyebrow className="mb-4">Go-to-market timeline</Eyebrow>
          <h2 className="font-display text-3xl md:text-4xl text-text tracking-tight leading-[1.1]">
            What ships, what we sell, what we count.
          </h2>
          <p className="text-[15px] text-text-muted mt-4 leading-relaxed">
            Our roadmap and our sales motion live on the same page. Each
            quarter has a product theme, a sales theme, and a number we hold
            ourselves to.
          </p>
        </div>

        <div className="relative pl-8">
          <div className="absolute left-3 top-2 bottom-2 w-px bg-border-strong/40" />
          <ul className="space-y-6">
            {GTM_TIMELINE.map((q) => {
              const status = STATUS_COPY[q.status];
              return (
                <li key={q.quarter} className="relative">
                  <span
                    className={`absolute -left-8 top-2 h-[14px] w-[14px] rounded-full border-2 border-bg ${
                      q.status === "shipped"
                        ? "bg-accent"
                        : q.status === "in_progress"
                          ? "bg-highlight"
                          : "bg-surface-muted border-border-strong"
                    }`}
                  />
                  <div className="bg-surface-raised border border-border rounded-2xl p-6 shadow-sm">
                    <div className="flex flex-wrap items-baseline gap-3 mb-3">
                      <p className="font-display text-xl text-text">{q.quarter}</p>
                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] uppercase tracking-wider font-medium border ${status.tone}`}
                      >
                        {status.label}
                      </span>
                      <p className="text-[13px] text-text-muted">{q.theme}</p>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mt-4">
                      <div>
                        <p className="text-[10px] uppercase tracking-[0.14em] text-text-subtle font-medium mb-2">
                          Product moves
                        </p>
                        <ul className="space-y-1">
                          {q.productMoves.map((m, i) => (
                            <li key={i} className="text-[13px] text-text-muted leading-relaxed">
                              • {m}
                            </li>
                          ))}
                        </ul>
                      </div>
                      <div>
                        <p className="text-[10px] uppercase tracking-[0.14em] text-text-subtle font-medium mb-2">
                          Sales / marketing moves
                        </p>
                        <ul className="space-y-1">
                          {q.salesMoves.map((m, i) => (
                            <li key={i} className="text-[13px] text-text-muted leading-relaxed">
                              • {m}
                            </li>
                          ))}
                        </ul>
                      </div>
                    </div>

                    <div className="mt-5 pt-4 border-t border-border/60">
                      <p className="text-[11px] uppercase tracking-[0.14em] text-text-subtle font-medium mb-1">
                        Quarter target
                      </p>
                      <p className="text-sm text-text font-medium">{q.target}</p>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      </section>

      {/* CTA */}
      <section className="max-w-[1280px] mx-auto px-6 lg:px-12 pb-24">
        <div className="relative overflow-hidden rounded-3xl border border-border bg-surface-raised p-10 md:p-14 ambient">
          <div className="relative max-w-2xl">
            <Eyebrow className="mb-4">Want the deck?</Eyebrow>
            <h2 className="font-display text-3xl md:text-4xl text-text tracking-tight leading-[1.1]">
              We&apos;ll send the full plan.
            </h2>
            <p className="text-[15px] text-text-muted mt-4 leading-relaxed">
              Investors, prospective customers, and partners — request the
              long-form business plan with cohort math, unit economics, and
              the full funding ask.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="/sign-up">
                <Button size="lg">Request the deck</Button>
              </Link>
              <Link href="/about">
                <Button size="lg" variant="ghost">
                  Back to About
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

function SummaryTile({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub: string;
}) {
  return (
    <div className="bg-surface-raised border border-border rounded-2xl p-5">
      <p className="text-[10px] uppercase tracking-[0.14em] text-text-subtle font-medium">
        {label}
      </p>
      <p className="font-display text-2xl text-text mt-2 tracking-tight">{value}</p>
      <p className="text-[11.5px] text-text-muted mt-1 leading-snug">{sub}</p>
    </div>
  );
}
