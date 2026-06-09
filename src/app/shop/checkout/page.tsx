"use client";

// EMR-310 — Checkout with "Compare similar items" + "Share".
//
// A self-contained checkout simulation over the store cart. Before paying,
// the shopper can compare the items in their cart against similar products
// (so they confirm the right pick) and share their cart. Placing the order
// is simulated end-to-end with a confirmation state.

import * as React from "react";
import Link from "next/link";
import { Trash2, Minus, Plus, ShieldCheck, PartyPopper } from "lucide-react";
import { getProductBySlug, getRelatedProducts } from "@/lib/marketplace/data";
import { toCompareItem } from "@/components/store/compare-item";
import { useStoreCart, formatUSD } from "@/components/store/cart";
import { CompareDrawer } from "@/components/store/CompareDrawer";
import { ShareButton } from "@/components/store/ShareButton";
import { SeedsEarnBadge } from "@/components/store/SeedsEarnBadge";
import { Button } from "@/components/ui/button";
import { Eyebrow } from "@/components/ui/ornament";

const FREE_SHIP_THRESHOLD = 75;
const FLAT_SHIP = 5.99;
const TAX_RATE = 0.085;

export default function CheckoutPage() {
  const { lines, subtotal, setQuantity, remove, clear } = useStoreCart();
  const [placed, setPlaced] = React.useState(false);

  const shipping = subtotal === 0 || subtotal >= FREE_SHIP_THRESHOLD ? 0 : FLAT_SHIP;
  const tax = subtotal * TAX_RATE;
  const total = subtotal + shipping + tax;

  // Build a compare for the highest-value line vs. its similar products.
  const compare = React.useMemo(() => {
    if (lines.length === 0) return null;
    const top = [...lines].sort((a, b) => b.price * b.quantity - a.price * a.quantity)[0];
    const product = getProductBySlug(top.slug);
    if (!product) return null;
    const related = getRelatedProducts(product.id, 3);
    return { base: toCompareItem(product), similar: related.map(toCompareItem), name: product.name };
  }, [lines]);

  const placeOrder = () => {
    setPlaced(true);
    clear();
  };

  if (placed) {
    return (
      <div className="px-4 py-16 lg:px-12">
        <div className="mx-auto max-w-md rounded-3xl border border-border bg-surface-raised p-8 text-center">
          <span className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-accent-soft text-accent">
            <PartyPopper width={28} height={28} />
          </span>
          <h1 className="mt-4 font-display text-2xl tracking-tight text-text">Order placed!</h1>
          <p className="mt-2 text-[14px] text-text-muted">
            This is a demo checkout — no payment was taken. In production your order would route to
            the fulfilling distributor with a tracked ETA.
          </p>
          <p className="mt-3 text-[13px] text-text-subtle">
            We may text you a quick check-in in about a week — finish it to nurture Seeds.
          </p>
          <div className="mt-5 flex flex-wrap justify-center gap-2">
            <Link href="/shop">
              <Button>Keep shopping</Button>
            </Link>
            <Link href="/shop/surveys">
              <Button variant="secondary">Manage survey texts</Button>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  if (lines.length === 0) {
    return (
      <div className="px-4 py-16 lg:px-12">
        <div className="mx-auto max-w-md rounded-3xl border border-dashed border-border-strong/60 p-10 text-center">
          <h1 className="font-display text-2xl tracking-tight text-text">Your cart is empty</h1>
          <p className="mt-2 text-[14px] text-text-muted">
            Browse the marketplace and add a few products to get started.
          </p>
          <Link href="/shop" className="mt-5 inline-block">
            <Button>Go to the storefront</Button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="px-4 py-8 lg:px-12">
      <h1 className="mb-6 font-display text-3xl tracking-tight text-text">Checkout</h1>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_360px]">
        {/* Cart lines */}
        <div>
          <Eyebrow className="mb-3">In your cart</Eyebrow>
          <ul className="space-y-3">
            {lines.map((line) => (
              <li
                key={line.slug}
                className="flex items-center gap-3 rounded-2xl border border-border bg-surface-raised p-3"
              >
                <div className="grid h-14 w-14 shrink-0 place-items-center rounded-xl bg-accent-soft font-display text-lg text-accent">
                  {line.brand.slice(0, 1)}
                </div>
                <div className="min-w-0 flex-1">
                  <Link
                    href={`/shop/products/${line.slug}`}
                    className="block truncate font-medium text-text hover:text-accent"
                  >
                    {line.name}
                  </Link>
                  <p className="text-[12px] text-text-subtle">{line.brand}</p>
                </div>
                <div className="flex items-center rounded-full border border-border">
                  <button
                    type="button"
                    onClick={() => setQuantity(line.slug, line.quantity - 1)}
                    className="grid h-8 w-8 place-items-center rounded-l-full text-text-muted hover:bg-surface-muted"
                    aria-label="Decrease quantity"
                  >
                    <Minus width={14} height={14} />
                  </button>
                  <span className="w-8 text-center text-[13px] tabular-nums">{line.quantity}</span>
                  <button
                    type="button"
                    onClick={() => setQuantity(line.slug, line.quantity + 1)}
                    className="grid h-8 w-8 place-items-center rounded-r-full text-text-muted hover:bg-surface-muted"
                    aria-label="Increase quantity"
                  >
                    <Plus width={14} height={14} />
                  </button>
                </div>
                <span className="w-20 text-right font-medium tabular-nums text-text">
                  {formatUSD(line.price * line.quantity)}
                </span>
                <button
                  type="button"
                  onClick={() => remove(line.slug)}
                  className="grid h-8 w-8 place-items-center rounded-full text-text-subtle hover:bg-surface-muted hover:text-danger"
                  aria-label={`Remove ${line.name}`}
                >
                  <Trash2 width={15} height={15} />
                </button>
              </li>
            ))}
          </ul>

          {/* Compare + Share (EMR-310) */}
          <div className="mt-4 flex flex-wrap gap-2">
            {compare && (
              <CompareDrawer
                base={compare.base}
                similar={compare.similar}
                triggerLabel="Compare similar items"
                triggerVariant="secondary"
                triggerSize="sm"
              />
            )}
            <ShareButton
              title="My Leafmart cart"
              text="Check out what I'm picking up on Leafmart"
              url="/shop/checkout"
              label="Share cart"
              variant="secondary"
              size="sm"
            />
          </div>
        </div>

        {/* Summary */}
        <aside className="lg:sticky lg:top-[120px] lg:self-start">
          <div className="rounded-2xl border border-border bg-surface-raised p-5">
            <Eyebrow className="mb-3">Order summary</Eyebrow>
            <dl className="space-y-2 text-[14px]">
              <div className="flex justify-between">
                <dt className="text-text-muted">Subtotal</dt>
                <dd className="tabular-nums text-text">{formatUSD(subtotal)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-text-muted">Shipping</dt>
                <dd className="tabular-nums text-text">{shipping === 0 ? "Free" : formatUSD(shipping)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-text-muted">Estimated tax</dt>
                <dd className="tabular-nums text-text">{formatUSD(tax)}</dd>
              </div>
              <div className="mt-2 flex justify-between border-t border-border pt-2.5">
                <dt className="font-medium text-text">Total</dt>
                <dd className="font-display text-lg tabular-nums text-text">{formatUSD(total)}</dd>
              </div>
            </dl>

            {subtotal < FREE_SHIP_THRESHOLD && (
              <p className="mt-3 text-[12px] text-text-subtle">
                Add {formatUSD(FREE_SHIP_THRESHOLD - subtotal)} more for free shipping.
              </p>
            )}

            {/* Seed Trove loyalty (EMR-313 / EMR-314) */}
            <div className="mt-3">
              <SeedsEarnBadge dollars={subtotal} />
            </div>

            <Button onClick={placeOrder} className="mt-4 w-full">
              Place order
            </Button>
            <p className="mt-2 flex items-center justify-center gap-1.5 text-[11.5px] text-text-subtle">
              <ShieldCheck width={12} height={12} className="text-accent" /> Demo checkout — no payment taken
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
}
