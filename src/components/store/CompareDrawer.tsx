"use client";

// EMR-310 / EMR-303 — "Compare similar items".
//
// Amazon-grade side-by-side comparison. Opens a drawer with the current
// product pinned in the first column and comparable products beside it so
// the shopper can confirm they're getting the right one before paying.
// Used on the PDP and at checkout.

import * as React from "react";
import { X, Scale } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CompareTable } from "./CompareTable";
import type { CompareItem } from "./compare-item";

export type { CompareItem } from "./compare-item";

export function CompareDrawer({
  base,
  similar,
  triggerLabel = "Compare similar items",
  triggerVariant = "secondary",
  triggerSize = "md",
}: {
  base: CompareItem;
  similar: CompareItem[];
  triggerLabel?: string;
  triggerVariant?: React.ComponentProps<typeof Button>["variant"];
  triggerSize?: React.ComponentProps<typeof Button>["size"];
}) {
  const [open, setOpen] = React.useState(false);
  const items = React.useMemo(() => [base, ...similar].slice(0, 4), [base, similar]);

  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      <Button
        type="button"
        variant={triggerVariant}
        size={triggerSize}
        leadingIcon={<Scale width={16} height={16} />}
        onClick={() => setOpen(true)}
      >
        {triggerLabel}
      </Button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 backdrop-blur-sm sm:items-center"
          role="dialog"
          aria-modal="true"
          aria-label="Compare similar items"
          onClick={() => setOpen(false)}
        >
          <div
            className="max-h-[88vh] w-full max-w-3xl overflow-auto rounded-t-3xl border border-border bg-surface-raised p-5 shadow-xl sm:rounded-3xl sm:p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between">
              <h2 className="font-display text-xl tracking-tight text-text">Compare similar items</h2>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="grid h-8 w-8 place-items-center rounded-full text-text-muted hover:bg-surface-muted"
                aria-label="Close comparison"
              >
                <X width={18} height={18} />
              </button>
            </div>

            <CompareTable items={items} />
          </div>
        </div>
      )}
    </>
  );
}
