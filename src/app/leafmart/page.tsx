import Link from "next/link";
import type { Metadata } from "next";
import { ProductSilhouette } from "@/components/leafmart/ProductSilhouette";
import { LeafmartProductGrid } from "@/components/leafmart/LeafmartProductCard";
import { Portrait } from "@/components/leafmart/PortraitPlaceholder";
import { CategoryIcon } from "@/components/leafmart/CategoryIcon";
import { HeroSearchBar } from "@/components/leafmart/HeroSearchBar";
import { TESTIMONIALS, TRUST_STEPS } from "@/components/leafmart/demo-data";
import { getProducts, getCategories, getVendors } from "@/lib/leafmart/products";
import { buildSuggestions } from "@/lib/leafmart/search-suggestions";

export const metadata: Metadata = {
  title: "Leafmart — Physician-curated cannabis wellness",
  description:
    "Every product on Leafmart is reviewed by a clinician, verified by a third-party lab, and ranked by real patient outcomes.",
};

// Re-render the homepage at most once an hour. Product/category data is
// stable across visits and re-fetching on every request defeats the CDN.
export const revalidate = 3600;

/* ── Helper components ──────────────────────────────────────── */

function TrustChip({ children }: { children: React.ReactNode }) {
  return (
    <span className="trust-chip">
      <svg width="12" height="12" viewBox="0 0 12 12">
        <circle cx="6" cy="6" r="5" fill="none" stroke="currentColor" strokeWidth="1.5" />
        <path d="M3.5 6.2L5.2 7.8L8.5 4.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      {children}
    </span>
  );
}

function Pill({
  children,
  primary = false,
  href,
  className = "",
}: {
  children: React.ReactNode;
  primary?: boolean;
  href: string;
  className?: string;
}) {
  return (
    <Link
      href={href}
      className={`inline-flex items-center justify-center rounded-full font-medium tracking-wide transition-colors px-6 sm:px-7 py-3.5 sm:py-4 text-[14.5px] sm:text-[15px] ${
        primary
          ? "bg-[var(--ink)] text-[var(--bg)] hover:bg-[var(--leaf)] hover:text-[var(--bg)]"
          : "border-[1.5px] border-[var(--ink)] text-[var(--ink)] hover:bg-[var(--ink)] hover:text-[var(--bg)]"
      } ${className}`}
    >
      {children}
    </Link>
  );
}

/* ── Page ────────────────────────────────────────────────────── */

export default async function LeafmartHomePage() {
  const [products, categories, partners] = await Promise.all([
    getProducts(),
    getCategories(),
    getVendors(),
  ]);
  // EMR-281 — hero search suggestion universe.
  const searchSuggestions = buildSuggestions(products);

  return (
    <>
      {/* ── HERO ─────────────────────────────────────────── */}
      <section className="px-4 sm:px-6 lg:px-14 pt-3 pb-10 sm:pb-16 max-w-[1440px] mx-auto">
        <div
          className="rounded-[28px] sm:rounded-[36px] px-6 sm:px-10 lg:px-16 py-10 sm:py-14 grid grid-cols-1 lg:grid-cols-2 gap-10 lg:gap-12 items-center relative overflow-hidden lm-fade-in"
          style={{ background: "var(--sage)" }}
        >
          <div>
            {/* Member badge */}
            <div className="inline-flex items-center gap-2 bg-white/65 px-3.5 py-2 rounded-full text-[12px] sm:text-[12.5px] font-medium text-[var(--leaf)] mb-5 sm:mb-6 backdrop-blur-sm">
              <span className="w-1.5 h-1.5 rounded-full bg-[var(--leaf)]" />
              Join 12,000+ Leafmart members
            </div>

            <h1 className="font-display text-[40px] sm:text-[56px] md:text-[64px] lg:text-[76px] leading-[1.02] sm:leading-[1.0] font-normal tracking-[-1.5px] sm:tracking-[-2px] text-[var(--ink)] mb-0 text-balance">
              Cannabis wellness,<br />
              <em className="font-accent not-italic text-[var(--leaf)]">doctor-guided.</em>
            </h1>

            <p className="mt-5 sm:mt-6 text-[15.5px] sm:text-[17.5px] leading-relaxed text-[var(--text-soft)] max-w-[480px]">
              Every product on Leafmart is reviewed by a licensed clinician, verified by a third-party lab,
              and ranked by what actually helped people like you. No dispensary energy. No guesswork.
            </p>

            <div className="flex flex-col sm:flex-row sm:flex-wrap gap-3 sm:gap-3.5 sm:items-center mt-7 sm:mt-8">
              <Pill href="/leafmart/shop" primary className="w-full sm:w-auto">Find what helps →</Pill>
              <Link
                href="/leafmart/about"
                className="text-[14.5px] text-[var(--ink)] font-medium border-b-[1.5px] border-[var(--ink)] pb-0.5 hover:text-[var(--leaf)] hover:border-[var(--leaf)] transition-colors self-start sm:self-auto"
              >
                How we vet products
              </Link>
            </div>

            <div className="flex flex-wrap gap-2 sm:gap-2.5 mt-7 sm:mt-8">
              <TrustChip>Physician Curated</TrustChip>
              <TrustChip>Lab Verified</TrustChip>
              <TrustChip>Outcome Informed</TrustChip>
            </div>
          </div>

          {/* Right: Product silhouette + floating cards */}
          <div className="relative hidden lg:block">
            <ProductSilhouette shape="bottle" bg="rgba(255,255,255,0.55)" deep="var(--leaf)" height={460} big />

            {/* Floating clinician note */}
            <div className="absolute -left-9 bottom-7 bg-[var(--surface)] rounded-[20px] p-[18px_22px] max-w-[280px] shadow-[0_12px_40px_rgba(28,40,32,0.10)]">
              <div className="flex items-center gap-2.5 mb-2.5">
                <div className="w-8 h-8 rounded-full bg-[var(--peach)] flex items-center justify-center font-display text-sm font-medium text-[var(--ink)]">NP</div>
                <div>
                  <div className="text-[12.5px] font-semibold">Dr. N.H. Patel, DO</div>
                  <div className="text-[11px] text-[var(--muted)]">Medical Lead, Leafjourney</div>
                </div>
              </div>
              <div className="text-[13.5px] leading-snug text-[var(--text-soft)]">
                &ldquo;I read the lab on every product before it hits the shelf. The shelf is short on purpose.&rdquo;
              </div>
            </div>

            {/* Floating outcome card */}
            <div className="absolute -right-4 top-8 bg-[var(--surface)] rounded-[18px] px-[18px] py-[14px] shadow-[0_10px_30px_rgba(28,40,32,0.08)] flex gap-3 items-center">
              <div className="w-11 h-11 rounded-full bg-[var(--leaf-soft)] flex items-center justify-center text-[var(--leaf)] font-display text-base font-semibold">81%</div>
              <div>
                <div className="text-xs font-semibold text-[var(--ink)]">reported better sleep</div>
                <div className="text-[11px] text-[var(--muted)]">n = 612 patients · last 90d</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── SEARCH (EMR-281) ─────────────────────────────── */}
      <section className="px-4 sm:px-6 lg:px-14 pb-8 sm:pb-10 max-w-[1440px] mx-auto -mt-4 sm:-mt-6 relative z-10">
        <div className="flex flex-col items-center gap-3">
          <HeroSearchBar suggestions={searchSuggestions} />
          <p className="text-[12.5px] text-[var(--text-subtle)] text-center max-w-md">
            Try &ldquo;sleep&rdquo;, &ldquo;CBD tincture&rdquo;, &ldquo;limonene&rdquo;,
            or a brand name. We&apos;ll surface products, symptoms, terpenes, and more.
          </p>
        </div>
      </section>

      {/* ── CATEGORY BLOCKS ──────────────────────────────── */}
      <section className="px-4 sm:px-6 lg:px-14 pb-12 sm:pb-16 max-w-[1440px] mx-auto">
        <div className="flex flex-col sm:flex-row items-start sm:items-end justify-between mb-6 sm:mb-7">
          <div>
            <p className="eyebrow text-[var(--leaf)]">Find what helps</p>
            <h2 className="font-display text-[28px] sm:text-[40px] lg:text-[48px] font-normal tracking-[-1.0px] sm:tracking-[-1.2px] leading-[1.05] mt-2.5">
              Start with how you <em className="font-accent not-italic text-[var(--leaf)]">want to feel</em>.
            </h2>
          </div>
          <Link href="/leafmart/shop" className="text-[14.5px] font-medium border-b-[1.5px] border-[var(--ink)] pb-0.5 mt-3 sm:mt-0">
            See all shelves →
          </Link>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-[18px] lm-stagger">
          {categories.map((c, i) => {
            // Subtle per-card variation so 17 cards feel like a row of unique
            // shelves rather than a single template repeating.
            const tilt = i % 3 === 1 ? -3 : i % 3 === 2 ? 3 : 0;
            const offset = i % 4 === 0 ? 0 : i % 4 === 1 ? -8 : i % 4 === 2 ? 8 : 0;
            return (
              <Link
                key={c.slug}
                href={`/leafmart/category/${c.slug}`}
                className="card-lift rounded-[24px] sm:rounded-[28px] p-5 sm:p-6 pb-0 flex flex-col overflow-hidden cursor-pointer min-h-[280px] sm:min-h-[340px] lg:min-h-[380px] relative"
                style={{
                  backgroundImage: `linear-gradient(180deg, ${c.bg} 0%, color-mix(in srgb, ${c.bg} 78%, ${c.deep}) 100%)`,
                  backgroundColor: c.bg,
                }}
              >
                <div className="flex justify-between items-start">
                  <div>
                    <h3 className="font-display text-[24px] sm:text-[28px] lg:text-[32px] font-medium tracking-tight text-[var(--ink)]">{c.name}</h3>
                    <p className="text-[13px] sm:text-[13.5px] text-[var(--text-soft)] mt-2 max-w-[200px] leading-snug">{c.sub}</p>
                  </div>
                  {/* Category icon — tinted with the shelf's stamp colour.
                      Uses --chip-overlay so the chip background flips dark in
                      dark mode and the now-light stamp icons clear WCAG 1.4.11. */}
                  <div
                    className="w-10 h-10 sm:w-11 sm:h-11 rounded-full flex items-center justify-center flex-shrink-0"
                    style={{ background: "var(--chip-overlay)", color: c.deep }}
                  >
                    <CategoryIcon slug={c.slug} size={20} />
                  </div>
                </div>
                {/* Count chip — moved below copy, restyled with stamp colour */}
                <div
                  className="mt-3 inline-flex items-center self-start text-[10.5px] font-semibold tracking-[1.4px] uppercase"
                  style={{ color: c.deep }}
                >
                  {c.count} {c.count === 1 ? "product" : "products"}
                </div>
                <div className="flex-1 flex items-end mt-2.5 justify-center">
                  <div
                    className="w-3/4 h-[160px] sm:h-[200px] transition-transform duration-300 group-hover:scale-105"
                    style={{
                      transform: `translateX(${offset}px) rotate(${tilt}deg)`,
                    }}
                  >
                    <ProductSilhouette shape={c.shape} bg="transparent" deep={c.deep} height={200} />
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      </section>

      {/* ── FEATURED SHELF ───────────────────────────────── */}
      <section className="px-4 sm:px-6 lg:px-14 py-6 sm:py-8 pb-14 sm:pb-20 max-w-[1440px] mx-auto">
        <div className="flex flex-col sm:flex-row items-start sm:items-end justify-between mb-6 sm:mb-7">
          <div>
            <p className="eyebrow text-[var(--leaf)]">The Rest Shelf</p>
            <h2 className="font-display text-[28px] sm:text-[40px] lg:text-[48px] font-normal tracking-[-1.0px] sm:tracking-[-1.2px] leading-[1.05] mt-2.5">
              For the hour <em className="font-accent not-italic text-[var(--leaf)]">before bed</em>.
            </h2>
            <p className="mt-3 sm:mt-3.5 text-[var(--text-soft)] max-w-[520px] text-[14.5px] sm:text-[15.5px] leading-relaxed">
              Reviewed in the last six months. Sorted by what people with a similar evening routine told us actually helped.
            </p>
          </div>
          <Link href="/leafmart/category/rest" className="text-[14.5px] font-medium border-b-[1.5px] border-[var(--ink)] pb-0.5 mt-3 sm:mt-0">
            See the whole shelf →
          </Link>
        </div>
        <div className="lm-stagger">
          <LeafmartProductGrid products={products} />
        </div>
      </section>

      {/* ── TRUST METHOD ─────────────────────────────────── */}
      <section className="px-4 sm:px-6 lg:px-14 py-12 sm:py-16 max-w-[1440px] mx-auto">
        <div className="text-center mb-10 sm:mb-12">
          <p className="eyebrow text-[var(--leaf)]">The Method</p>
          <h2 className="font-display text-[32px] sm:text-[44px] lg:text-[56px] font-normal tracking-[-1.2px] sm:tracking-[-1.4px] leading-[1.05] sm:leading-[1.0] mt-3 max-w-3xl mx-auto text-balance">
            Three layers of editing, <em className="font-accent not-italic text-[var(--leaf)]">before</em><br className="hidden sm:block" />
            a single product reaches your cart.
          </h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-5 lm-stagger">
          {TRUST_STEPS.map((s) => (
            <div key={s.n} className="rounded-[24px] sm:rounded-[28px] p-6 sm:p-8 min-h-[220px] sm:min-h-[280px] flex flex-col" style={{ background: s.bg }}>
              <div className="flex items-center gap-3 sm:gap-3.5 mb-4 sm:mb-[18px]">
                <div
                  className="w-10 h-10 sm:w-11 sm:h-11 rounded-full bg-white/70 flex items-center justify-center font-display text-base sm:text-lg font-medium"
                  style={{ color: s.deep }}
                >
                  {s.n}
                </div>
                <h3 className="font-display text-[22px] sm:text-[26px] font-medium tracking-tight text-[var(--ink)]">{s.t}</h3>
              </div>
              <p className="text-[14px] sm:text-[15px] leading-relaxed text-[var(--text-soft)]">{s.b}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── FOUNDING PARTNERS ────────────────────────────── */}
      <section className="px-4 sm:px-6 lg:px-14 py-6 sm:py-8 pb-14 sm:pb-20 max-w-[1440px] mx-auto">
        <div className="rounded-[28px] sm:rounded-[36px] bg-[#FFF8E8] p-6 sm:p-10 lg:p-12">
          <div className="flex flex-col lg:flex-row items-start lg:items-end justify-between mb-6 sm:mb-8">
            <div>
              <p className="eyebrow text-[var(--leaf)]">Founding partners</p>
              <h2 className="font-display text-[28px] sm:text-[36px] lg:text-[44px] font-normal tracking-[-0.8px] sm:tracking-[-1.0px] leading-[1.05] mt-2.5 max-w-[600px]">
                A short list of brands we&apos;d <em className="font-accent not-italic text-[var(--leaf)]">send a friend to</em>.
              </h2>
            </div>
            <p className="max-w-[320px] text-[13.5px] sm:text-[14.5px] text-[var(--text-soft)] leading-relaxed mt-4 lg:mt-0">
              Founding partners pay a flat 10% — locked for two years. We don&apos;t take placement fees. The shelf is curated, not sold.
            </p>
          </div>

          {/* EMR-204: only confirmed partners render here. When the
              founding-partner shelf is empty we show a "Coming soon"
              placeholder rather than speculative brand names. */}
          {partners.length > 0 ? (
            <div className="-mx-6 sm:mx-0 sm:grid sm:grid-cols-2 lg:grid-cols-4 sm:gap-4 lm-stagger flex sm:flex-none overflow-x-auto sm:overflow-visible snap-x snap-mandatory sm:snap-none px-6 sm:px-0 gap-4 pb-2 sm:pb-0 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
              {partners.map((p) => (
                <div
                  key={p.name}
                  className="card-lift rounded-3xl p-6 flex flex-col cursor-pointer flex-shrink-0 w-[78%] sm:w-auto snap-start sm:snap-align-none"
                  style={{ background: p.bg, height: 320 }}
                >
                  <div className="flex-1 flex items-center justify-center">
                    <div className="w-[140px] h-[180px]">
                      <ProductSilhouette shape={p.shape} bg="transparent" deep={p.deep} height={180} />
                    </div>
                  </div>
                  {/* h3 (not h4) — the enclosing section heading is
                      h2; jumping h2 -> h4 trips axe's heading-order
                      rule. (EMR-713 cleanup.) */}
                  <h3 className="font-display text-[20px] sm:text-[22px] font-medium tracking-tight text-[var(--ink)] mt-3 mb-1.5">{p.name}</h3>
                  <p className="text-[12.5px] sm:text-[13px] text-[var(--text-soft)] leading-snug">{p.desc}</p>
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-3xl border border-dashed border-[var(--leaf)]/30 bg-white/40 p-8 sm:p-10 text-center">
              <p className="font-display text-[22px] sm:text-[26px] tracking-tight text-[var(--ink)]">
                Founding partners <em className="font-accent not-italic text-[var(--leaf)]">coming soon</em>.
              </p>
              <p className="text-[13.5px] sm:text-[14.5px] text-[var(--text-soft)] mt-3 max-w-[460px] mx-auto leading-relaxed">
                We&apos;re finalizing agreements with our first cohort of brands.
                Every partner will be clinician-reviewed and lab-verified before
                they appear on this shelf.
              </p>
              <Link
                href="/leafmart/vendors"
                className="inline-block mt-5 text-[13px] font-medium text-[var(--leaf)] border-b-[1.5px] border-[var(--leaf)] pb-0.5 hover:opacity-80 transition-opacity"
              >
                Apply to be a founding partner →
              </Link>
            </div>
          )}
        </div>
      </section>

      {/* ── TESTIMONIALS ─────────────────────────────────── */}
      <section className="px-4 sm:px-6 lg:px-14 py-6 sm:py-8 pb-14 sm:pb-20 max-w-[1440px] mx-auto">
        <div className="mb-7 sm:mb-8">
          <p className="eyebrow text-[var(--leaf)]">In their own words</p>
          <h2 className="font-display text-[28px] sm:text-[36px] lg:text-[44px] font-normal tracking-[-0.8px] sm:tracking-[-1.0px] leading-[1.05] mt-2.5 max-w-[720px]">
            The members who&apos;ve made Leafmart <em className="font-accent not-italic text-[var(--leaf)]">part of their week</em>.
          </h2>
        </div>

        {/* Mobile: horizontal scroll. md+: 3-col grid. */}
        <div className="-mx-4 sm:-mx-6 md:mx-0 md:grid md:grid-cols-3 md:gap-[18px] flex md:flex-none overflow-x-auto md:overflow-visible snap-x snap-mandatory md:snap-none px-4 sm:px-6 md:px-0 gap-4 pb-2 md:pb-0 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden lm-stagger">
          {TESTIMONIALS.map((r) => (
            <div
              key={r.name}
              className="rounded-[24px] sm:rounded-[28px] p-6 sm:p-8 flex flex-col min-h-[240px] sm:min-h-[260px] flex-shrink-0 w-[82%] md:w-auto snap-start"
              style={{ background: r.bg }}
            >
              <div className="font-display text-[48px] sm:text-[56px] text-[var(--leaf)] leading-none mb-0 -mt-2 opacity-40 select-none" aria-hidden="true">&ldquo;</div>
              <p className="font-display text-[17px] sm:text-[19px] leading-[1.4] font-normal text-[var(--ink)] flex-1 -mt-3">{r.quote}</p>
              <div className="flex items-center gap-3 mt-5 sm:mt-6">
                <div className="w-9 h-9 rounded-full bg-white/70 flex items-center justify-center font-display font-medium">
                  {r.name[0]}
                </div>
                <div>
                  <div className="text-[13.5px] font-semibold text-[var(--ink)]">{r.name}</div>
                  <div className="text-xs text-[var(--text-soft)]">{r.loc}</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── HUMANITY / PORTRAITS ─────────────────────────── */}
      <section className="px-4 sm:px-6 lg:px-14 py-6 sm:py-8 pb-14 sm:pb-20 max-w-[1440px] mx-auto">
        {/* EMR-331: dark-mode background + use the global token cascade
            so headings, names, and the "Take the quiz" CTA stay readable.
            Previously this card hard-set --ink/--text inline, which
            overrode the dark-mode token swap and washed out the copy. */}
        <div className="lm-portraits-card rounded-[28px] sm:rounded-[36px] p-6 sm:p-10 lg:p-14">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 lg:gap-14 items-start">
            {/* Left: anchor portrait + checklist */}
            <div className="order-2 lg:order-1">
              <Portrait src="/portraits/rosa.png" tone="rose" caption="Rosa, 64 · Rest Shelf" />
              <div className="mt-6 sm:mt-7">
                <h3 className="font-display text-[20px] sm:text-[22px] font-medium tracking-tight text-[var(--ink)]">Wellness, across every life</h3>
                <div className="mt-4 flex flex-col gap-2.5">
                  {["Curated for people, not patients", "Plant-powered, plainly labeled", "For every stage of life, every body, every ritual", "Quiet support for everyday life", "From an actual healthcare brand"].map((b) => (
                    <div key={b} className="flex items-center gap-2.5">
                      <div className="w-5 h-5 rounded-full bg-[var(--leaf)] flex items-center justify-center flex-shrink-0">
                        <svg width="11" height="11" viewBox="0 0 11 11"><path d="M2.5 5.7 L4.5 7.5 L8.5 3.5" stroke="var(--bg)" strokeWidth="1.8" fill="none" strokeLinecap="round" strokeLinejoin="round" /></svg>
                      </div>
                      <span className="text-sm font-medium text-[var(--text)]">{b}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Right: headline + lifestyle grid */}
            <div className="order-1 lg:order-2">
              <p className="eyebrow text-[var(--leaf)]">For real people, in real lives</p>
              <h2 className="font-display text-[32px] sm:text-[48px] lg:text-[60px] font-normal tracking-[-1.2px] sm:tracking-[-1.6px] leading-[1.05] sm:leading-[1.0] text-[var(--ink)] mt-3">
                Care that <em className="font-accent not-italic text-[var(--leaf)]">fits the rhythm</em><br />
                of your week.
              </h2>
              <p className="mt-4 sm:mt-[18px] text-[15px] sm:text-[17px] leading-relaxed text-[var(--text-soft)] max-w-[540px] mb-6 sm:mb-8">
                Leafmart members are nurses unwinding after a swing shift, dads steadying their evenings, retirees swapping a nightly drink for a tonic, runners protecting their recovery. Same shelf. Different reasons.
              </p>
              <div className="grid grid-cols-2 gap-3 sm:gap-4 lm-stagger">
                <div>
                  <Portrait src="/portraits/marcus.png" tone="sage" caption="Marcus, 38 · Relief" />
                  <div className="mt-3 sm:mt-3.5"><div className="text-[12.5px] sm:text-[13px] font-semibold text-[var(--ink)]">The day after a long shift</div><div className="text-[12px] sm:text-[12.5px] text-[var(--text-soft)] mt-0.5">Full-spectrum balm · Relief shelf</div></div>
                </div>
                <div className="mt-6 sm:mt-9">
                  <Portrait src="/portraits/aanya.png" tone="warm" caption="Aanya, 31 · Calm" />
                  <div className="mt-3 sm:mt-3.5"><div className="text-[12.5px] sm:text-[13px] font-semibold text-[var(--ink)]">Sunday afternoon, off the clock</div><div className="text-[12px] sm:text-[12.5px] text-[var(--text-soft)] mt-0.5">CBN sleep tonic · Calm shelf</div></div>
                </div>
                <div>
                  <Portrait src="/portraits/james.png" tone="butter" caption="James, 82 · Rest" />
                  <div className="mt-3 sm:mt-3.5"><div className="text-[12.5px] sm:text-[13px] font-semibold text-[var(--ink)]">The hour before bed</div><div className="text-[12px] sm:text-[12.5px] text-[var(--text-soft)] mt-0.5">CBD + CBN tincture · Rest shelf</div></div>
                </div>
                <div className="mt-6 sm:mt-9">
                  <Portrait src="/portraits/eleanor.png" tone="lilac" caption="Eleanor, 71 · Skin" />
                  <div className="mt-3 sm:mt-3.5"><div className="text-[12.5px] sm:text-[13px] font-semibold text-[var(--ink)]">A slower morning routine</div><div className="text-[12px] sm:text-[12.5px] text-[var(--text-soft)] mt-0.5">CBD skin serum · Skin shelf</div></div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── QUIZ CTA ─────────────────────────────────────── */}
      {/* Lock the deep brand green explicitly: --leaf flips lighter in dark
          mode and the cream copy fails AA contrast against the dark-mode
          variant. The CTA is a fixed-color brand surface. */}
      <section className="px-4 sm:px-6 lg:px-14 py-6 sm:py-8 pb-14 sm:pb-20 max-w-[1440px] mx-auto">
        <div className="rounded-[28px] sm:rounded-[36px] px-6 sm:px-10 lg:px-16 py-10 sm:py-16 grid grid-cols-1 lg:grid-cols-[1.4fr_1fr] gap-8 lg:gap-10 items-center" style={{ background: "#1F4D37", color: "#FFF8E8" }}>
          <div>
            <p className="eyebrow text-[rgba(255,248,232,0.8)]">2-minute quiz</p>
            <h2 className="font-display text-[32px] sm:text-[44px] lg:text-[56px] font-normal tracking-[-1.2px] sm:tracking-[-1.4px] leading-[1.05] sm:leading-[1.0] mt-3 mb-4 sm:mb-[18px] text-[#FFF8E8]">
              Not sure where to start? <em className="font-accent not-italic text-[#F5E6B8]">We&apos;ll point you somewhere.</em>
            </h2>
            <p className="text-[15px] sm:text-[17px] leading-relaxed text-[rgba(255,248,232,0.8)] max-w-[480px]">
              Tell us how you&apos;d like to feel. We&apos;ll match you with three clinician-reviewed products to consider — no signup required.
            </p>
            <div className="flex flex-col sm:flex-row sm:flex-wrap gap-3 sm:gap-3.5 mt-6 sm:mt-7">
              <Link href="/leafmart/quiz" className="inline-flex items-center justify-center rounded-full font-semibold bg-[#FFF8E8] text-[#0A1812] hover:bg-white transition-colors px-6 sm:px-7 py-3.5 sm:py-4 text-[14.5px] sm:text-[15px] shadow-[0_2px_8px_rgba(0,0,0,0.12)]">
                Take the quiz →
              </Link>
              <Link href="/leafmart/shop" className="inline-flex items-center justify-center rounded-full font-medium border-[1.5px] border-[#FFF8E8] text-[#FFF8E8] hover:bg-[rgba(255,248,232,0.15)] transition-colors px-6 sm:px-7 py-3.5 sm:py-4 text-[14.5px] sm:text-[15px]">
                Browse the shelves
              </Link>
            </div>
          </div>

          {/* Quiz preview */}
          <div className="rounded-3xl p-5 sm:p-6 border border-[rgba(255,248,232,0.18)]" style={{ background: "rgba(255,248,232,0.08)" }}>
            <div className="flex flex-col gap-3.5">
              {[
                { q: "What would you like to feel?", a: "Calmer in the evening" },
                { q: "Have you used cannabis for wellness?", a: "Curious, not regular" },
                { q: "Any restrictions to know about?", a: "I prefer non-intoxicating" },
              ].map((row, i) => (
                <div key={i} className="pb-3.5" style={{ borderBottom: i < 2 ? "1px solid rgba(255,248,232,0.18)" : "none" }}>
                  <div className="text-[11.5px] text-[rgba(255,248,232,0.6)] tracking-[1.2px] uppercase font-semibold mb-1.5">0{i + 1}</div>
                  <div className="text-[13px] sm:text-sm text-[rgba(255,248,232,0.7)] mb-1.5">{row.q}</div>
                  <div className="font-display text-base sm:text-lg font-medium text-[#FFF8E8]">{row.a}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
