"use client";

// EMR-188 — Storefront product card. Amazon-style tile: image/silhouette,
// brand, title, rating, price, trust + distributor signal, and a quick
// add-to-cart. Links to the PDP.

import * as React from "react";
import Link from "next/link";
import { Plus, Check, Sparkles, Scale } from "lucide-react";
import type { MarketplaceProduct } from "@/lib/marketplace/types";
import { FORMAT_LABELS } from "@/lib/marketplace/types";
import { resolveDistributor } from "@/lib/leafmart/distributors";
import { Badge } from "@/components/ui/badge";
import { StarRating } from "./StarRating";
import { DistributorBadge } from "./DistributorBadge";
import { useStoreCart, formatUSD } from "./cart";
import { useCompareTray } from "./compare-tray";
import { toCompareItem } from "./compare-item";

function Silhouette({ product }: { product: MarketplaceProduct }) {
  const bg = product.bgColor ?? "var(--accent-soft)";
  const deep = product.deepColor ?? "var(--accent)";
  return (
    <div
      className="relative grid h-40 place-items-center overflow-hidden rounded-xl"
      style={{ background: `linear-gradient(150deg, ${bg}, ${deep})` }}
      aria-hidden="true"
    >
      <span className="font-display text-3xl font-medium text-white/85 drop-shadow-sm">
        {product.brand.slice(0, 1)}
      </span>
      <span className="absolute bottom-2 right-2 rounded-full bg-black/25 px-2 py-0.5 text-[10px] font-medium text-white">
        {FORMAT_LABELS[product.format]}
      </span>
    </div>
  );
}

export function StoreProductCard({ product }: { product: MarketplaceProduct }) {
  const { add } = useStoreCart();
  const compare = useCompareTray();
  const [added, setAdded] = React.useState(false);
  const distributor = resolveDistributor({ firstPartyOnly: product.clinicianPick });

  const comparing = compare.has(product.slug);
  const compareBlocked = compare.isFull && !comparing;

  const onAdd = (e: React.MouseEvent) => {
    e.preventDefault();
    add({ slug: product.slug, name: product.name, brand: product.brand, price: product.price, distributorId: distributor.id });
    setAdded(true);
    setTimeout(() => setAdded(false), 1500);
  };

  return (
    <div className="group flex flex-col rounded-2xl border border-border bg-surface-raised p-3 shadow-sm transition-shadow hover:shadow-md">
      <Link href={`/shop/products/${product.slug}`} className="block">
        <Silhouette product={product} />
      </Link>
      <div className="mt-3 flex flex-1 flex-col">
        <div className="flex items-center gap-1.5">
          <p className="text-[11px] uppercase tracking-wide text-text-subtle">{product.brand}</p>
          {product.clinicianPick && (
            <Badge tone="accent">
              <Sparkles width={10} height={10} /> Clinician pick
            </Badge>
          )}
        </div>
        <Link
          href={`/shop/products/${product.slug}`}
          className="mt-0.5 line-clamp-2 font-medium leading-snug text-text hover:text-accent"
        >
          {product.name}
        </Link>
        <div className="mt-1.5">
          <StarRating rating={product.averageRating} reviewCount={product.reviewCount} />
        </div>
        <div className="mt-2">
          <DistributorBadge distributor={distributor} />
        </div>

        {/* EMR-375 — add/remove from the compare tray (max 3) */}
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            compare.toggle(toCompareItem(product));
          }}
          disabled={compareBlocked}
          aria-pressed={comparing}
          title={compareBlocked ? `Compare up to ${compare.max} products` : undefined}
          className="mt-2 inline-flex items-center gap-1.5 self-start rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 aria-pressed:border-accent aria-pressed:bg-accent-soft aria-pressed:text-accent border-border text-text-muted hover:border-border-strong hover:text-text"
        >
          {comparing ? <Check width={12} height={12} /> : <Scale width={12} height={12} />}
          {comparing ? "Comparing" : "Compare"}
        </button>

        <div className="mt-auto flex items-center justify-between gap-2 pt-3">
          <div className="flex items-baseline gap-1.5">
            <span className="font-display text-lg text-text">{formatUSD(product.price)}</span>
            {product.compareAtPrice && product.compareAtPrice > product.price && (
              <span className="text-[12px] text-text-subtle line-through">
                {formatUSD(product.compareAtPrice)}
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={onAdd}
            className="grid h-9 w-9 place-items-center rounded-full bg-accent text-accent-ink transition-transform hover:scale-105 active:scale-95"
            aria-label={`Add ${product.name} to cart`}
          >
            {added ? <Check width={16} height={16} /> : <Plus width={16} height={16} />}
          </button>
        </div>
      </div>
    </div>
  );
}
