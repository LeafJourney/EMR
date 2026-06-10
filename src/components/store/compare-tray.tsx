"use client";

// EMR-375 — "Compare up to 3 products" tray.
//
// A storefront-wide selection model: shoppers tap "Compare" on any product
// card or PDP to add it to a tray (max 3). A floating bar collects the picks
// and opens a side-by-side table (the shared CompareTable). Selections persist
// in localStorage so the tray survives navigation between the shelf and PDPs.

import * as React from "react";
import { Scale, X, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CompareTable } from "./CompareTable";
import type { CompareItem } from "./compare-item";

export const COMPARE_MAX = 3;
const STORAGE_KEY = "leafmart.compare.v1";

interface CompareTrayValue {
  items: CompareItem[];
  has: (slug: string) => boolean;
  toggle: (item: CompareItem) => void;
  remove: (slug: string) => void;
  clear: () => void;
  isFull: boolean;
  max: number;
}

const CompareTrayContext = React.createContext<CompareTrayValue | null>(null);

export function useCompareTray(): CompareTrayValue {
  const ctx = React.useContext(CompareTrayContext);
  if (!ctx) {
    throw new Error("useCompareTray must be used within a CompareTrayProvider");
  }
  return ctx;
}

export function CompareTrayProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = React.useState<CompareItem[]>([]);

  // Hydrate from localStorage after mount (avoids SSR mismatch).
  React.useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) setItems(parsed.slice(0, COMPARE_MAX));
      }
    } catch {
      /* ignore corrupt storage */
    }
  }, []);

  React.useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
    } catch {
      /* ignore quota / private-mode errors */
    }
  }, [items]);

  const value = React.useMemo<CompareTrayValue>(() => {
    const has = (slug: string) => items.some((i) => i.slug === slug);
    return {
      items,
      has,
      isFull: items.length >= COMPARE_MAX,
      max: COMPARE_MAX,
      toggle: (item: CompareItem) =>
        setItems((prev) => {
          if (prev.some((i) => i.slug === item.slug)) {
            return prev.filter((i) => i.slug !== item.slug);
          }
          if (prev.length >= COMPARE_MAX) return prev; // silently cap at max
          return [...prev, item];
        }),
      remove: (slug: string) => setItems((prev) => prev.filter((i) => i.slug !== slug)),
      clear: () => setItems([]),
    };
  }, [items]);

  return <CompareTrayContext.Provider value={value}>{children}</CompareTrayContext.Provider>;
}

/**
 * Toggle a product in/out of the compare tray. Drop this on product cards and
 * the PDP. Disabled (with a hint) only when the tray is full and this item
 * isn't already selected.
 */
export function CompareToggleButton({
  item,
  size = "sm",
  className,
}: {
  item: CompareItem;
  size?: React.ComponentProps<typeof Button>["size"];
  className?: string;
}) {
  const { has, toggle, isFull } = useCompareTray();
  const selected = has(item.slug);
  const blocked = isFull && !selected;

  return (
    <Button
      type="button"
      variant={selected ? "primary" : "secondary"}
      size={size}
      className={className}
      disabled={blocked}
      aria-pressed={selected}
      title={blocked ? `You can compare up to ${COMPARE_MAX} products` : undefined}
      leadingIcon={selected ? <Check width={15} height={15} /> : <Scale width={15} height={15} />}
      onClick={(e) => {
        e.preventDefault();
        toggle(item);
      }}
    >
      {selected ? "Comparing" : "Compare"}
    </Button>
  );
}

/**
 * Floating tray bar. Renders nothing until at least one product is selected.
 * Shows the picks as chips and opens the comparison table.
 */
export function CompareTrayBar() {
  const { items, remove, clear, max } = useCompareTray();
  const [open, setOpen] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  // Close the modal automatically if the tray empties out.
  React.useEffect(() => {
    if (items.length === 0) setOpen(false);
  }, [items.length]);

  if (items.length === 0) return null;

  return (
    <>
      <div className="pointer-events-none fixed inset-x-0 bottom-0 z-40 flex justify-center px-3 pb-3">
        <div className="pointer-events-auto flex w-full max-w-3xl items-center gap-3 rounded-2xl border border-border bg-surface-raised/95 p-2.5 shadow-xl backdrop-blur-md sm:gap-4">
          <span className="hidden shrink-0 items-center gap-1.5 pl-1.5 text-[12px] font-medium text-text-muted sm:flex">
            <Scale width={15} height={15} className="text-accent" />
            Compare
          </span>
          <ul className="flex flex-1 flex-wrap items-center gap-1.5">
            {items.map((item) => (
              <li
                key={item.slug}
                className="flex items-center gap-1.5 rounded-full border border-border bg-surface px-2.5 py-1 text-[12px] text-text"
              >
                <span className="max-w-[120px] truncate">{item.name}</span>
                <button
                  type="button"
                  onClick={() => remove(item.slug)}
                  className="grid h-4 w-4 place-items-center rounded-full text-text-subtle hover:bg-surface-muted hover:text-danger"
                  aria-label={`Remove ${item.name} from comparison`}
                >
                  <X width={12} height={12} />
                </button>
              </li>
            ))}
            {Array.from({ length: Math.max(0, max - items.length) }).map((_, i) => (
              <li
                key={`empty-${i}`}
                className="hidden h-[26px] w-16 rounded-full border border-dashed border-border-strong/50 sm:block"
                aria-hidden="true"
              />
            ))}
          </ul>
          <div className="flex shrink-0 items-center gap-1.5">
            <Button type="button" size="sm" variant="ghost" onClick={clear}>
              Clear
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={() => setOpen(true)}
              disabled={items.length < 2}
              title={items.length < 2 ? "Add a second product to compare" : undefined}
            >
              Compare ({items.length})
            </Button>
          </div>
        </div>
      </div>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 backdrop-blur-sm sm:items-center"
          role="dialog"
          aria-modal="true"
          aria-label="Compare selected products"
          onClick={() => setOpen(false)}
        >
          <div
            className="max-h-[88vh] w-full max-w-3xl overflow-auto rounded-t-3xl border border-border bg-surface-raised p-5 shadow-xl sm:rounded-3xl sm:p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between">
              <h2 className="font-display text-xl tracking-tight text-text">
                Compare {items.length} products
              </h2>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="grid h-8 w-8 place-items-center rounded-full text-text-muted hover:bg-surface-muted"
                aria-label="Close comparison"
              >
                <X width={18} height={18} />
              </button>
            </div>
            <CompareTable items={items} firstLabel="" onRemove={remove} />
          </div>
        </div>
      )}
    </>
  );
}
