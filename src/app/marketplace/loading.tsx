import { SiteHeader } from "@/components/marketing/SiteHeader";
import { SiteFooter } from "@/components/marketing/SiteFooter";
import { MarketplaceSkeleton } from "@/components/ui/skeletons";

/**
 * Marketplace loading skeleton — keeps the marketing chrome
 * (SiteHeader / SiteFooter) static so it doesn't flicker, and
 * fills the body with a responsive product-card grid placeholder.
 */
export default function Loading() {
  return (
    <div className="min-h-screen bg-bg relative overflow-hidden">
      <SiteHeader />
      <main id="main-content">
        <section className="max-w-[1320px] mx-auto px-4 sm:px-6 lg:px-12 pt-10 pb-16">
          <MarketplaceSkeleton cards={12} />
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
