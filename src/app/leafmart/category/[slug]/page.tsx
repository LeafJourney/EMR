import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { LeafmartProductGrid } from "@/components/leafmart/LeafmartProductCard";
import { getCategories, getProductsByCategory } from "@/lib/leafmart/products";
import { JsonLd } from "@/components/leafmart/JsonLd";
import {
  absoluteUrl,
  breadcrumbList,
  collectionPageLd,
} from "@/lib/leafmart/seo";

export const revalidate = 3600;

const CATEGORY_META: Record<string, { title: string; headline: string; accent: string; bg: string }> = {
  rest: { title: "Rest", headline: "For evenings that should end quietly.", accent: "before bed", bg: "var(--sage)" },
  relief: { title: "Relief", headline: "Built for the day after a long one.", accent: "long days", bg: "var(--peach)" },
  // Legacy `/category/recovery` URL — kept so existing bookmarks and
  // cached SEO entries land on the renamed Relief shelf without 404.
  recovery: { title: "Relief", headline: "Built for the day after a long one.", accent: "long days", bg: "var(--peach)" },
  calm: { title: "Calm", headline: "Take the edge off, gently.", accent: "gently", bg: "var(--butter)" },
  skin: { title: "Skin", headline: "Plant-powered skin recovery.", accent: "recovery", bg: "var(--rose)" },
  focus: { title: "Focus", headline: "Clarity when it counts.", accent: "clarity", bg: "var(--lilac)" },
};

// User-facing slugs map to legacy DB slugs so renamed shelves
// (relief ← recovery, rest ← sleep) keep returning the right rows
// until the seed data is fully migrated.
const CATEGORY_SLUG_ALIASES: Record<string, string> = {
  relief: "recovery",
  rest: "sleep",
};

export async function generateStaticParams() {
  try {
    const categories = await getCategories();
    return categories.map((c) => ({ slug: c.slug }));
  } catch {
    return Object.keys(CATEGORY_META).map((slug) => ({ slug }));
  }
}

// Synthesize a CATEGORY_META-shaped record from the `LeafmartCategory`
// returned by `getCategories()`. The `/leafmart` hub links to every
// category slug that the data source advertises (anxiety, edibles,
// best-sellers, ...), but the curated CATEGORY_META map above only
// covers the original five shelves — so anything new the data layer
// adds used to 404. This keeps the curated headlines for the hero
// shelves and falls back to the data-driven name + description for
// the rest. (EMR-711)
function synthCatFromInfo(
  info: { name: string; sub: string; bg: string },
): { title: string; headline: string; accent: string; bg: string } {
  return {
    title: info.name,
    headline: info.sub,
    accent: info.name.toLowerCase(),
    bg: info.bg,
  };
}

export async function generateMetadata({ params }: { params: { slug: string } }): Promise<Metadata> {
  const cat = CATEGORY_META[params.slug];
  // Metadata can't await DB; fall back to a slug-derived title rather
  // than the bare "Category" string when the curated map misses.
  const title = cat?.title ?? params.slug.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  const headline = cat?.headline ?? `Browse our ${title.toLowerCase()} shelf.`;
  return {
    title: `${title} Shelf`,
    description: headline,
    alternates: { canonical: absoluteUrl(`/leafmart/category/${params.slug}`) },
    openGraph: {
      title: `${title} — Leafmart`,
      description: headline,
      url: absoluteUrl(`/leafmart/category/${params.slug}`),
      type: "website",
      siteName: "Leafmart",
    },
  };
}

export default async function CategoryPage({ params }: { params: { slug: string } }) {
  const lookupSlug = CATEGORY_SLUG_ALIASES[params.slug] ?? params.slug;
  const [products, categories] = await Promise.all([
    getProductsByCategory(lookupSlug),
    getCategories(),
  ]);
  const catInfo = categories.find((c) => c.slug === lookupSlug);

  // Curated metadata for the original five shelves takes priority; any
  // newer slug that the data layer advertises gets a synthesized record
  // built from the LeafmartCategory row. Only 404 when both the curated
  // map AND the data layer don't know about the slug.
  const cat = CATEGORY_META[params.slug] ?? (catInfo ? synthCatFromInfo(catInfo) : null);
  if (!cat) notFound();

  const breadcrumbs = breadcrumbList([
    { name: "Leafmart", url: "/leafmart" },
    { name: "Shop", url: "/leafmart/shop" },
    { name: cat.title, url: `/leafmart/category/${params.slug}` },
  ]);

  const collection = collectionPageLd({
    name: cat.title,
    slug: params.slug,
    description: cat.headline,
    count: catInfo?.count ?? products.length,
    productSlugs: products.map((p) => p.slug),
  });

  return (
    <>
      <JsonLd data={[collection, breadcrumbs]} />
      {/* Shelf header */}
      <section className="px-4 sm:px-6 lg:px-14 pt-10 sm:pt-12 pb-6 sm:pb-8 max-w-[1440px] mx-auto lm-fade-in">
        <div className="flex flex-col sm:flex-row items-start sm:items-end justify-between">
          <div>
            <p className="eyebrow text-[var(--muted)] mb-1.5">
              Shelf · {cat.title}
            </p>
            <h1 className="font-display text-[34px] sm:text-[48px] lg:text-[56px] font-normal tracking-[-1.2px] sm:tracking-[-1.4px] leading-[1.05] sm:leading-[1.0] text-[var(--ink)]">
              {cat.headline}
            </h1>
            <p className="mt-3 text-[14px] sm:text-[15px] text-[var(--text-soft)]">
              {catInfo?.count ?? 0} products · all clinician-reviewed
            </p>
          </div>
          <Link href="/leafmart/shop" className="text-sm font-medium text-[var(--leaf)] hover:underline mt-3 sm:mt-0">
            ← All shelves
          </Link>
        </div>
      </section>

      {/* Category accent strip */}
      <div className="mx-4 sm:mx-6 lg:mx-14 h-1.5 rounded-full max-w-[1440px]" style={{ background: cat.bg }} />

      {/* Product grid */}
      <section className="px-4 sm:px-6 lg:px-14 py-8 sm:py-12 pb-14 sm:pb-20 max-w-[1440px] mx-auto">
        <div className="lm-stagger">
          <LeafmartProductGrid products={products} />
        </div>
      </section>
    </>
  );
}
