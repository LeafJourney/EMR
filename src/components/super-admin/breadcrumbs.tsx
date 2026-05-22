// Super-admin breadcrumb trail.
//
// Renders the canonical chain that mirrors the nav rail pillars
// (HQ / Operations / Audit / Security) so an operator can drill into a
// detail page and back out without hunting through the sidebar. Mid-chain
// pillar labels are intentionally NOT links — the rail itself owns
// navigation; rendering them as anchors would 404 because no dedicated
// page exists for "Operations" et al.
//
// Server component. No state, no client JS. The last item carries
// aria-current="page" and is bolded; everything before it is rendered as
// either a Link (when `href` is set) or a muted span (pillar labels).
//
// Used directly above the H1 in every (super-admin) page header — see
// the wiring in src/app/(super-admin)/**/page.tsx for the per-route
// chain shape.

import * as React from "react";
import Link from "next/link";
import { cn } from "@/lib/utils/cn";

export interface BreadcrumbItem {
  /** Visible label. */
  label: string;
  /** Optional href. Last item must NEVER have one (it's the current page). */
  href?: string;
}

export function Breadcrumbs({
  items,
  className,
}: {
  items: BreadcrumbItem[];
  className?: string;
}) {
  if (items.length === 0) return null;

  return (
    <nav
      aria-label="Breadcrumb"
      className={cn("mb-4", className)}
    >
      <ol className="flex flex-wrap items-center gap-1.5 text-[12px] leading-none text-text-muted">
        {items.map((item, idx) => {
          const isLast = idx === items.length - 1;
          const isFirst = idx === 0;

          return (
            <li key={`${item.label}-${idx}`} className="inline-flex items-center gap-1.5">
              {!isFirst && (
                <span
                  aria-hidden="true"
                  className="text-text-subtle/70 select-none"
                >
                  ›
                </span>
              )}
              {isLast ? (
                <span
                  aria-current="page"
                  className="font-semibold text-text"
                >
                  {item.label}
                </span>
              ) : item.href ? (
                <Link
                  href={item.href}
                  className="text-text-muted hover:text-text transition-colors"
                >
                  {item.label}
                </Link>
              ) : (
                <span className="text-text-muted">{item.label}</span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
