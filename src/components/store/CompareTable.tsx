"use client";

// EMR-310 / EMR-375 — Shared side-by-side comparison table.
//
// Presentational: takes an ordered list of CompareItems (first column is the
// pinned "this item" by default) and renders the aspect rows. Reused by both
// the PDP CompareDrawer and the storefront-wide Compare tray so the column
// shape stays identical everywhere a shopper compares.

import * as React from "react";
import Link from "next/link";
import { Check, Minus } from "lucide-react";
import { StarRating } from "./StarRating";
import { formatUSD } from "./cart";
import type { CompareItem } from "./compare-item";

const ROWS: Array<{ label: string; render: (item: CompareItem) => React.ReactNode }> = [
  { label: "Price", render: (i) => formatUSD(i.price) },
  { label: "Rating", render: (i) => <StarRating rating={i.averageRating} reviewCount={i.reviewCount} /> },
  { label: "Format", render: (i) => i.format },
  { label: "THC", render: (i) => (i.thcContent != null ? `${i.thcContent} mg/mL` : "—") },
  { label: "CBD", render: (i) => (i.cbdContent != null ? `${i.cbdContent} mg/mL` : "—") },
  { label: "Onset", render: (i) => i.onsetTime ?? "—" },
  { label: "Duration", render: (i) => i.duration ?? "—" },
  { label: "Beginner friendly", render: (i) => <BoolCell value={i.beginnerFriendly} /> },
  { label: "Lab verified", render: (i) => <BoolCell value={i.labVerified} /> },
];

function BoolCell({ value }: { value: boolean }) {
  return value ? (
    <Check width={16} height={16} className="text-accent" />
  ) : (
    <Minus width={16} height={16} className="text-text-subtle" />
  );
}

export function CompareTable({
  items,
  firstLabel = "This item",
  onRemove,
}: {
  items: CompareItem[];
  /** Heading label for the first column. */
  firstLabel?: string;
  /** When provided, renders a small remove control under each column header. */
  onRemove?: (slug: string) => void;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-[13px]">
        <thead>
          <tr>
            <th className="w-28 p-2 text-left align-bottom" />
            {items.map((item, idx) => (
              <th key={item.slug} className="min-w-[120px] p-2 text-left align-bottom">
                <span className="block text-[11px] uppercase tracking-wide text-text-subtle">
                  {idx === 0 && firstLabel ? firstLabel : item.brand}
                </span>
                <Link
                  href={`/shop/products/${item.slug}`}
                  className="mt-1 block font-medium text-text hover:text-accent"
                >
                  {item.name}
                </Link>
                {onRemove && (
                  <button
                    type="button"
                    onClick={() => onRemove(item.slug)}
                    className="mt-1 text-[11px] text-text-subtle underline-offset-2 hover:text-danger hover:underline"
                  >
                    Remove
                  </button>
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {ROWS.map((row) => (
            <tr key={row.label} className="border-t border-border/70">
              <th className="p-2 text-left text-[12px] font-medium text-text-subtle">{row.label}</th>
              {items.map((item) => (
                <td key={item.slug} className="p-2 text-text">
                  {row.render(item)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
