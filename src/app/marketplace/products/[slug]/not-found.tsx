import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Eyebrow } from "@/components/ui/ornament";

/**
 * Segment-level 404 for /marketplace/products/[slug]. Triggered when the
 * slug doesn't map to a curated product — usually because the listing
 * was retired, the URL was hand-edited, or an old link is being shared.
 *
 * The app-wide 404 ("This page wandered off") is technically correct
 * here but unhelpful: the path itself is valid, the product is gone.
 * Sending shoppers back to the catalog is more useful than home.
 */
export default function MarketplaceProductNotFound() {
  return (
    <div className="min-h-[70vh] flex items-center justify-center px-6 py-16">
      <Card tone="raised" className="max-w-[640px] w-full">
        <CardContent className="py-10 text-center">
          <Eyebrow className="justify-center mb-3">Marketplace</Eyebrow>

          <h1 className="font-display text-3xl md:text-4xl text-text tracking-tight leading-[1.08]">
            This product is no longer listed.
          </h1>

          <p className="text-[15px] text-text-muted mt-4 max-w-md mx-auto leading-relaxed">
            The catalog rotates — this item may have been retired, gone
            out of stock, or moved to a different listing. Browse the
            full marketplace to find what you&rsquo;re looking for.
          </p>

          <div className="mt-8 flex flex-col sm:flex-row justify-center gap-3">
            <Link href="/marketplace">
              <Button size="lg" className="min-w-[180px]">
                Browse marketplace
              </Button>
            </Link>
            <Link href="/">
              <Button size="lg" variant="secondary" className="min-w-[140px]">
                Go home
              </Button>
            </Link>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
