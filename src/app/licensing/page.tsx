import Link from "next/link";
import { SiteHeader } from "@/components/marketing/SiteHeader";
import { SiteFooter } from "@/components/marketing/SiteFooter";
import { Button } from "@/components/ui/button";
import {
  MENU_VERSION,
  menuCourses,
} from "@/lib/platform/licensing-menu";
import { MODULE_CATALOG, MODULE_TIERS } from "@/lib/platform/modules";

export const metadata = {
  title: "Licensing menu — Leafjourney",
  description:
    "A Michelin-style licensing menu for the Leafjourney platform. Pick your modules, your pillar mix, and your tier.",
};

const STARS = (n: number) => "★".repeat(n) + "☆".repeat(Math.max(0, 3 - n));

export default function PublicLicensingPage() {
  const courses = menuCourses();
  const tierEntries = Object.entries(MODULE_TIERS).sort(
    ([, a], [, b]) => a.ordering - b.ordering,
  );

  return (
    <>
      <SiteHeader />
      <main id="main-content" className="mx-auto max-w-[920px] px-6 py-16">
        <header className="text-center mb-12">
          <p className="text-[11px] uppercase tracking-[0.18em] text-text-subtle">
            Edition {MENU_VERSION}
          </p>
          <h1 className="font-display text-5xl tracking-tight mt-3">
            Leafjourney
          </h1>
          <p className="italic text-text-muted mt-2">
            A licensing menu — Michelin-style.
          </p>
          <div className="flex items-center justify-center gap-2 mt-6">
            <Link href="/api/platform/licensing/menu.html" target="_blank">
              <Button variant="secondary">Print HTML</Button>
            </Link>
            <Link href="/api/platform/licensing/menu.json" target="_blank">
              <Button variant="secondary">Raw JSON</Button>
            </Link>
            <Link href="/pricing">
              <Button>See pricing</Button>
            </Link>
          </div>
        </header>

        <section className="mb-12 rounded-xl border border-border/80 bg-surface p-6">
          <h2 className="font-display text-xl tracking-tight mb-4">Tiers</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-text-subtle text-[11px] uppercase tracking-wide">
                  <th className="py-2 pr-4">Tier</th>
                  <th className="py-2 pr-4">Monthly</th>
                  <th className="py-2 pr-4">Best for</th>
                  <th className="py-2">Pitch</th>
                </tr>
              </thead>
              <tbody>
                {tierEntries.map(([id, t]) => (
                  <tr key={id} className="border-t border-border/60 align-top">
                    <td className="py-3 pr-4 font-medium">{t.label}</td>
                    <td className="py-3 pr-4 font-mono text-[12px]">
                      {t.monthlyLabel}
                    </td>
                    <td className="py-3 pr-4 text-text-muted">{t.bestFor}</td>
                    <td className="py-3 text-text-muted">{t.blurb}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {courses.map((course) => (
          <section key={course.pillar} className="mb-12">
            <h2 className="font-display text-2xl tracking-tight">
              {course.pillarLabel}
            </h2>
            <p className="italic text-text-muted text-sm mt-1 mb-6">
              {course.blurb}
            </p>
            <div className="space-y-5">
              {course.modules.map((m) => (
                <article
                  key={m.id}
                  className="border-b border-dashed border-border/60 pb-5 last:border-b-0"
                >
                  <header className="flex flex-wrap items-baseline justify-between gap-2">
                    <h3 className="font-display text-lg">
                      {m.name}{" "}
                      <span
                        className="text-[color:var(--highlight-hover)] ml-2 text-sm"
                        title={m.starsLabel}
                      >
                        {STARS(m.stars)}
                      </span>
                    </h3>
                    <span className="text-sm text-text-muted font-mono">
                      {m.priceDisplay}
                    </span>
                  </header>
                  <p className="italic text-text-muted text-sm mt-1">
                    {m.tagline}
                  </p>
                  <p className="text-sm text-text mt-2 leading-relaxed">
                    {m.description}
                  </p>
                  {m.pairsWith.length > 0 && (
                    <p className="text-[11px] text-text-subtle mt-3">
                      Best paired with:{" "}
                      {m.pairsWith
                        .map(
                          (p) =>
                            MODULE_CATALOG.find((mm) => mm.id === p)?.name ?? p,
                        )
                        .join(", ")}
                    </p>
                  )}
                </article>
              ))}
            </div>
          </section>
        ))}

        <p className="text-[11px] text-text-subtle italic text-center mt-8">
          Three stars: production ready. Two stars: battle-tested in pilots.
          One star: preview. All prices are list per provider, per month, billed
          annually.
        </p>
      </main>
      <SiteFooter />
    </>
  );
}
