import Link from "next/link";
import { PageShell } from "@/components/shell/PageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ProductGrid } from "@/components/marketplace/ProductGrid";
import { TrustStrip } from "@/components/marketplace/TrustStrip";
import { SearchBar } from "@/components/marketplace/SearchBar";
import { RecommendedForYou } from "@/components/marketplace/RecommendedForYou";
import { PatientsLikeYou } from "@/components/marketplace/PatientsLikeYou";
import {
  getFeaturedProducts,
  getClinicianPicks,
  getCategories,
} from "@/lib/marketplace/queries";
import { AffiliateProductCard } from "@/components/store/affiliate-product-card";
import { getCurrentUser } from "@/lib/auth/session";

export const dynamic = "force-dynamic";
export const metadata = { title: "Shop" };

const QUICK_BROWSE = [
  { label: "Calm", slug: "calm" },
  { label: "Focus", slug: "focus" },
  { label: "Relief", slug: "recovery" },
  { label: "Rest", slug: "sleep" },
  { label: "Energy", slug: "energy" },
] as const;

export default async function ShopPage() {
  const [user, featured, clinicianPicks, symptomCategories, goalCategories] =
    await Promise.all([
      getCurrentUser(),
      getFeaturedProducts(),
      getClinicianPicks(),
      getCategories("symptom"),
      getCategories("goal"),
    ]);

  return (
    <PageShell maxWidth="max-w-[1100px]">
      {/* ── Hero ──────────────────────────────────────────────────────── */}
      <section className="pt-8 pb-12 text-center">
        <h1 className="text-3xl font-semibold tracking-tight text-text">
          Leafjourney Marketplace
        </h1>
        <p className="mt-3 text-base text-text-muted max-w-xl mx-auto">
          Physician-curated wellness products selected for your care journey.
        </p>

        <div className="mt-8 flex justify-center">
          <SearchBar className="w-full max-w-md" />
        </div>

        <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
          {QUICK_BROWSE.map((cat) => (
            <Link
              key={cat.slug}
              href={`/portal/shop/category/${cat.slug}`}
              className="inline-flex items-center rounded-full border border-border bg-surface px-4 py-1.5 text-sm font-medium text-text transition-colors hover:bg-surface-muted"
            >
              {cat.label}
            </Link>
          ))}
        </div>
      </section>

      {/* ── Trust strip ───────────────────────────────────────────────── */}
      <TrustStrip className="rounded-lg mb-12" />

      {/* ── Recommended for You (EMR-230 moat) ────────────────────────── */}
      {user?.organizationId && (
        <RecommendedForYou
          userId={user.id}
          organizationId={user.organizationId}
        />
      )}

      {/* ── Patients Like You (EMR-270 cohort intelligence) ───────────── */}
      {user?.organizationId && (
        <PatientsLikeYou
          userId={user.id}
          organizationId={user.organizationId}
        />
      )}

      {/* ── Featured ──────────────────────────────────────────────────── */}
      <section className="mb-14">
        <h2 className="text-xl font-semibold tracking-tight text-text mb-6">
          Featured
        </h2>
        <ProductGrid products={featured} columns={4} />
      </section>

      {/* ── Partner Deals ──────────────────────────────────────────────── */}
      <section className="mb-14">
        <h2 className="text-xl font-semibold tracking-tight text-text mb-6">
          Partner Deals
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
          <AffiliateProductCard 
            product={{
              id: "vape-1",
              name: "Pax Plus Vaporizer",
              brand: "PAX",
              category: "Hardware",
              price: 200,
              imageUrl: "",
              affiliateUrl: "https://pax.com",
              rating: 4.8,
              discountBadge: "15% Off"
            }} 
          />
          <AffiliateProductCard 
            product={{
              id: "scale-1",
              name: "Precision Scale 0.01g",
              brand: "AWS",
              category: "Hardware",
              price: 25,
              imageUrl: "",
              affiliateUrl: "https://amazon.com",
              rating: 4.5
            }} 
          />
        </div>
      </section>

      {/* ── Clinician Picks ───────────────────────────────────────────── */}
      <section className="mb-14">
        <h2 className="text-xl font-semibold tracking-tight text-text">
          Clinician Picks
        </h2>
        <p className="text-sm text-text-muted mt-1 mb-6">
          Selected by our care team for quality and efficacy.
        </p>
        <ProductGrid products={clinicianPicks} columns={3} />
      </section>

      {/* ── Shop by Category ──────────────────────────────────────────── */}
      <section className="mb-14">
        <h2 className="text-xl font-semibold tracking-tight text-text mb-6">
          Shop by Category
        </h2>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[...symptomCategories, ...goalCategories].map((cat) => (
            <Link
              key={cat.id}
              href={`/portal/shop/category/${cat.slug}`}
              className="group"
            >
              <Card className="h-full transition-colors group-hover:border-accent/40">
                <CardContent className="pt-6">
                  {cat.icon && (
                    <span
                      className="block text-2xl text-accent mb-3"
                      aria-hidden="true"
                    >
                      {cat.icon}
                    </span>
                  )}
                  <p className="text-sm font-semibold text-text">
                    {cat.name}
                  </p>
                  {cat.description && (
                    <p className="text-xs text-text-muted mt-1 line-clamp-2">
                      {cat.description}
                    </p>
                  )}
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      </section>

      {/* ── Browse All CTA ────────────────────────────────────────────── */}
      <section className="mb-8 text-center">
        <Link href="/portal/shop/products">
          <Button variant="secondary" size="lg">
            Browse all products
          </Button>
        </Link>
      </section>
    </PageShell>
  );
}
