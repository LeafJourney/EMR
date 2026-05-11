import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: { default: "Legal — Leafjourney", template: "%s — Legal — Leafjourney" },
  robots: { index: true, follow: true },
};

const NAV = [
  { label: "Terms of Service", href: "/legal/terms" },
  { label: "Privacy Policy", href: "/legal/privacy" },
  { label: "Shipping", href: "/legal/shipping" },
  { label: "Returns", href: "/legal/returns" },
  { label: "Disputes", href: "/legal/disputes" },
];

export default function LegalLayout({ children }: { children: React.ReactNode }) {
  return (
    <main id="main-content" className="min-h-screen bg-[var(--bg)] text-[var(--ink)]">
      <div className="max-w-[920px] mx-auto px-6 lg:px-10 py-12 lg:py-16">
        <p className="eyebrow text-[var(--text-soft)] mb-3">Legal</p>
        <nav aria-label="Legal documents" className="mb-10 flex flex-wrap gap-x-6 gap-y-2 text-[13.5px]">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="text-[var(--text-soft)] hover:text-[var(--ink)] transition-colors"
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <div
          role="note"
          aria-label="Draft notice"
          className="mb-10 rounded-2xl border border-[var(--border)] bg-[var(--surface-muted)] px-5 py-4 text-[13px] leading-relaxed text-[var(--text-soft)]"
        >
          <strong className="text-[var(--ink)]">DRAFT — pending legal counsel review.</strong>{" "}
          These pages exist so the marketplace shell is wired correctly. Final
          binding text will replace this draft after sign-off (tracked in
          EMR-258). Do not rely on this draft as a binding agreement.
        </div>
        <article className="prose prose-zinc max-w-none [&_h1]:font-display [&_h1]:text-[40px] [&_h1]:font-medium [&_h1]:tracking-tight [&_h1]:text-[var(--ink)] [&_h2]:font-display [&_h2]:text-[22px] [&_h2]:font-medium [&_h2]:mt-10 [&_h2]:text-[var(--ink)] [&_h3]:font-display [&_h3]:text-[16px] [&_h3]:font-medium [&_h3]:mt-6 [&_p]:text-[14.5px] [&_p]:leading-relaxed [&_p]:text-[var(--text-soft)] [&_li]:text-[14.5px] [&_li]:leading-relaxed [&_li]:text-[var(--text-soft)] [&_a]:text-[var(--leaf)] [&_a]:underline-offset-2 hover:[&_a]:underline">
          {children}
        </article>
      </div>
    </main>
  );
}
