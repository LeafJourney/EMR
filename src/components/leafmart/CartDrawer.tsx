"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useCart, formatUSD } from "@/lib/leafmart/cart-store";
import { useAgeConfirmation } from "@/lib/leafmart/age-confirmation";
import { ProductSilhouette } from "./ProductSilhouette";
import { AgeGateModal } from "./AgeGateModal";

const FREE_SHIPPING_THRESHOLD = 75;
const REMOVE_ANIM_MS = 240;

export function CartDrawer() {
  const { items, isOpen, closeCart, removeItem, updateQuantity, subtotal, itemCount } = useCart();
  const router = useRouter();
  const { isConfirmed, isDenied } = useAgeConfirmation();
  const [ageGateOpen, setAgeGateOpen] = useState(false);

  // True when the cart has at least one regulated item (THC > 0). The gate
  // only fires for these — non-regulated wellness products checkout freely.
  const cartRequiresAge = items.some((i) => i.product.requiresAgeVerification);
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const closeBtnRef = useRef<HTMLButtonElement | null>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);

  // Track which items are mid-removal so we can play the slide-out before
  // dispatching the actual removal to the store.
  const [removing, setRemoving] = useState<Set<string>>(new Set());
  // Track the previously-known quantity per slug so we can fire the count-tick
  // animation only when the number actually changes.
  const prevQty = useRef<Record<string, number>>({});
  const [tickKey, setTickKey] = useState<Record<string, number>>({});

  const shippingProgress = Math.min(1, subtotal / FREE_SHIPPING_THRESHOLD);
  const shippingRemaining = Math.max(0, FREE_SHIPPING_THRESHOLD - subtotal);

  // Detect quantity changes to retrigger the tick animation on the count span.
  useEffect(() => {
    const next = { ...tickKey };
    let changed = false;
    for (const { product, quantity } of items) {
      const prior = prevQty.current[product.slug];
      if (prior !== undefined && prior !== quantity) {
        next[product.slug] = (next[product.slug] ?? 0) + 1;
        changed = true;
      }
      prevQty.current[product.slug] = quantity;
    }
    // Drop quantities for items no longer in cart so memory stays bounded.
    for (const slug of Object.keys(prevQty.current)) {
      if (!items.find((i) => i.product.slug === slug)) {
        delete prevQty.current[slug];
      }
    }
    if (changed) setTickKey(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items]);

  function handleRemove(slug: string) {
    setRemoving((prev) => {
      const next = new Set(prev);
      next.add(slug);
      return next;
    });
    window.setTimeout(() => {
      removeItem(slug);
      setRemoving((prev) => {
        const next = new Set(prev);
        next.delete(slug);
        return next;
      });
    }, REMOVE_ANIM_MS);
  }

  // Escape, scroll-lock, focus trap, and focus restore.
  useEffect(() => {
    if (!isOpen) return;
    previouslyFocused.current = document.activeElement as HTMLElement | null;
    closeBtnRef.current?.focus();

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        closeCart();
        return;
      }
      if (e.key !== "Tab" || !dialogRef.current) return;
      const focusables = dialogRef.current.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"]), input:not([disabled]), select:not([disabled])'
      );
      if (focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      const active = document.activeElement;
      if (e.shiftKey && active === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
      previouslyFocused.current?.focus?.();
    };
  }, [isOpen, closeCart]);

  return (
    <>
      <div
        aria-hidden={!isOpen}
        onClick={closeCart}
        className={`fixed inset-0 z-40 bg-[var(--ink)]/30 backdrop-blur-sm transition-opacity duration-300 ${
          isOpen ? "opacity-100" : "opacity-0 pointer-events-none"
        }`}
      />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label="Shopping cart"
        className={`fixed top-0 right-0 z-50 h-full w-full sm:w-[420px] bg-[var(--bg)] border-l border-[var(--border)] shadow-2xl flex flex-col transition-transform duration-300 ease-out ${
          isOpen ? "translate-x-0" : "translate-x-full"
        }`}
      >
        {/* Header — a plain <div>, not <header>, so it doesn't register as a
            second `banner` landmark when this dialog leaves the sectioning flow. */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--border)]">
          <div>
            <p className="eyebrow text-[var(--text-soft)]">Your cart</p>
            <h2 className="font-display text-[22px] font-medium tracking-tight text-[var(--ink)] leading-tight">
              {items.length === 0 ? "Empty" : `${itemCount} item${itemCount === 1 ? "" : "s"}`}
            </h2>
          </div>
          <button
            ref={closeBtnRef}
            onClick={closeCart}
            aria-label="Close cart"
            className="rounded-full w-10 h-10 flex items-center justify-center border border-[var(--border)] text-[var(--ink)] hover:bg-[var(--surface-muted)] transition-colors"
          >
            <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
              <path d="M2 2L10 10M10 2L2 10" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        {/* Shipping progress */}
        {items.length > 0 && (
          <div className="px-5 py-3 border-b border-[var(--border)] bg-[var(--surface-muted)]/50">
            {shippingRemaining > 0 ? (
              <p className="text-[12px] text-[var(--text-soft)] mb-2">
                <span className="font-medium text-[var(--leaf)]">{formatUSD(shippingRemaining)}</span> away from free shipping
              </p>
            ) : (
              <p className="text-[12px] font-medium text-[var(--leaf)] mb-2 flex items-center gap-1.5">
                <svg width="12" height="12" viewBox="0 0 12 12"><circle cx="6" cy="6" r="5" fill="none" stroke="currentColor" strokeWidth="1.4" /><path d="M3.5 6.2L5.2 7.8L8.5 4.5" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" /></svg>
                Free shipping unlocked
              </p>
            )}
            <div className="h-1 bg-[var(--border)] rounded-full overflow-hidden">
              <div
                className="h-full bg-[var(--leaf)] rounded-full transition-all duration-500 ease-out"
                style={{ width: `${shippingProgress * 100}%` }}
              />
            </div>
          </div>
        )}

        {/* Items */}
        <div className="flex-1 overflow-y-auto">
          {items.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center px-8 text-center gap-4">
              <div
                className="w-20 h-20 rounded-full flex items-center justify-center lm-empty-float"
                style={{ background: "var(--sage)" }}
              >
                <svg width="32" height="32" viewBox="0 0 32 32" aria-hidden="true">
                  <path d="M6 9h20l-2 14a3 3 0 0 1-3 2.6H11A3 3 0 0 1 8 23L6 9z" fill="none" stroke="var(--leaf)" strokeWidth="1.6" strokeLinejoin="round" />
                  <path d="M11 9V7a5 5 0 0 1 10 0v2" fill="none" stroke="var(--leaf)" strokeWidth="1.6" strokeLinecap="round" />
                </svg>
              </div>
              <p className="font-display text-[22px] font-medium text-[var(--ink)]">Your cart is empty</p>
              <p className="text-[13px] text-[var(--text-soft)] leading-relaxed max-w-[240px]">
                Browse physician-curated formulas, lab-verified and ranked by real outcomes.
              </p>
              <Link
                href="/leafmart/shop"
                onClick={closeCart}
                className="mt-2 inline-flex items-center rounded-full bg-[var(--ink)] text-[var(--bg)] px-6 py-3 text-[13px] font-medium tracking-wide hover:bg-[var(--leaf)] transition-colors"
              >
                Browse the shop
              </Link>
            </div>
          ) : (
            <ul className="divide-y divide-[var(--border)]">
              {items.map(({ product, quantity }) => {
                const isRemoving = removing.has(product.slug);
                const tk = tickKey[product.slug] ?? 0;
                return (
                  <li
                    key={product.slug}
                    className={`px-5 py-4 flex gap-3.5 ${isRemoving ? "lm-item-exit" : "lm-item-enter"}`}
                  >
                    {/* Compact silhouette with quantity badge — clickable, deep-links to the PDP. */}
                    <div className="relative flex-shrink-0">
                      <Link
                        href={`/leafmart/products/${product.slug}`}
                        onClick={closeCart}
                        aria-label={`View ${product.name}`}
                        className="block w-[64px] h-[64px] rounded-2xl overflow-hidden focus:outline-none focus:ring-2 focus:ring-[var(--leaf)]"
                      >
                        <ProductSilhouette shape={product.shape} bg={product.bg} deep={product.deep} height={64} />
                      </Link>
                      {quantity > 1 && (
                        <span
                          key={`badge-${product.slug}-${tk}`}
                          className="absolute -top-1.5 -right-1.5 bg-[var(--ink)] text-[var(--bg)] text-[10px] font-bold rounded-full w-[18px] h-[18px] flex items-center justify-center tabular-nums shadow-sm lm-count-tick pointer-events-none"
                        >
                          {quantity}
                        </span>
                      )}
                    </div>

                    {/* Product info */}
                    <div className="flex-1 min-w-0">
                      <p className="text-[10.5px] font-semibold tracking-[1.4px] uppercase text-[var(--text-soft)] mb-0.5">{product.partner}</p>
                      <Link
                        href={`/leafmart/products/${product.slug}`}
                        onClick={closeCart}
                        className="font-display text-[15px] font-medium text-[var(--ink)] leading-tight truncate block hover:text-[var(--leaf)] transition-colors"
                      >
                        {product.name}
                      </Link>
                      <p className="text-[11.5px] text-[var(--muted)] mt-0.5">{product.dose}</p>

                      <div className="flex items-center justify-between mt-2.5">
                        <div className="inline-flex items-center border border-[var(--border)] rounded-full overflow-hidden">
                          <button
                            onClick={() => updateQuantity(product.slug, quantity - 1)}
                            aria-label={`Decrease ${product.name} quantity`}
                            className="w-8 h-8 flex items-center justify-center text-[var(--ink)] hover:bg-[var(--surface-muted)] active:scale-90 transition-all text-[13px]"
                          >
                            −
                          </button>
                          <span
                            key={`qty-${product.slug}-${tk}`}
                            className="w-7 text-center text-[12px] font-medium tabular-nums lm-count-tick inline-block"
                          >
                            {quantity}
                          </span>
                          <button
                            onClick={() => updateQuantity(product.slug, quantity + 1)}
                            aria-label={`Increase ${product.name} quantity`}
                            className="w-8 h-8 flex items-center justify-center text-[var(--ink)] hover:bg-[var(--surface-muted)] active:scale-90 transition-all text-[13px]"
                          >
                            +
                          </button>
                        </div>

                        <div className="flex items-center gap-3">
                          <button
                            onClick={() => handleRemove(product.slug)}
                            aria-label={`Remove ${product.name}`}
                            className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-[var(--surface-muted)] text-[var(--muted)] hover:text-[var(--danger)] transition-colors"
                          >
                            <svg width="13" height="13" viewBox="0 0 13 13" aria-hidden="true">
                              <path d="M3 4.5h7M5 4.5V3.5a1 1 0 0 1 1-1h1a1 1 0 0 1 1 1v1M4.5 4.5l.4 6a1 1 0 0 0 1 .9h1.2a1 1 0 0 0 1-.9l.4-6" fill="none" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                          </button>
                          <span className="font-display text-[16px] font-medium text-[var(--ink)] tabular-nums">
                            {formatUSD(product.price * quantity)}
                          </span>
                        </div>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* Footer */}
        {items.length > 0 && (
          <footer className="border-t border-[var(--border)] px-5 py-4 bg-[var(--bg)]">
            <div className="flex items-center justify-between mb-3">
              <span className="text-[12px] font-semibold tracking-[1.4px] uppercase text-[var(--text-soft)]">Subtotal</span>
              <span className="font-display text-[22px] font-medium text-[var(--ink)] tabular-nums">
                {formatUSD(subtotal)}
              </span>
            </div>
            <p className="text-[11.5px] text-[var(--muted)] mb-3.5 leading-relaxed">
              Shipping &amp; tax calculated at checkout. Typically ships in 1–2 business days.
            </p>
            {cartRequiresAge && !isConfirmed ? (
              <button
                type="button"
                onClick={() => setAgeGateOpen(true)}
                className="block w-full text-center rounded-full bg-[var(--ink)] text-[var(--bg)] py-3.5 text-[13.5px] font-medium tracking-wide hover:bg-[var(--leaf)] transition-colors"
                aria-haspopup="dialog"
              >
                Checkout · {formatUSD(subtotal)}
              </button>
            ) : (
              <Link
                href="/leafmart/checkout"
                onClick={closeCart}
                aria-disabled={cartRequiresAge && isDenied}
                onClickCapture={(e) => {
                  if (cartRequiresAge && isDenied) {
                    e.preventDefault();
                    setAgeGateOpen(true);
                  }
                }}
                className="block w-full text-center rounded-full bg-[var(--ink)] text-[var(--bg)] py-3.5 text-[13.5px] font-medium tracking-wide hover:bg-[var(--leaf)] transition-colors"
              >
                Checkout · {formatUSD(subtotal)}
              </Link>
            )}
            <Link
              href="/leafmart/cart"
              onClick={closeCart}
              className="block w-full text-center mt-2 py-2.5 text-[12.5px] font-medium text-[var(--ink)] hover:text-[var(--leaf)] transition-colors"
            >
              View full cart
            </Link>
          </footer>
        )}
      </div>

      <AgeGateModal
        open={ageGateOpen}
        onClose={() => setAgeGateOpen(false)}
        onConfirmed={() => {
          closeCart();
          router.push("/leafmart/checkout");
        }}
      />
    </>
  );
}
