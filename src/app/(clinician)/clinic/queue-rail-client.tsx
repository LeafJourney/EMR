"use client";

/**
 * QueueRailClient — clinician-reorderable Today's Queue rail.
 *
 * Server-side we compute the urgency-sorted list of today's encounter
 * cards. The clinician can then drag (or use Space + arrow keys) to
 * pin their personal preferred order on top of the AI urgency score —
 * Monday.com tier interaction inside the EMR.
 *
 * Persistence
 * ───────────
 *   Per-clinician, per-day. Stored under `clinic:queue-order:${date}`
 *   in localStorage so each new day starts fresh on the AI's urgency
 *   ranking. TODO(schema): introduce `Encounter.queueSortOrder Int?`
 *   on the model so order can sync across devices and survive page
 *   refreshes from another machine.
 *
 * Why client-only
 * ───────────────
 *   The original server page renders the rail with deeply-nested
 *   Prisma includes that we don't want to plumb through props. We
 *   accept the already-rendered list of card React nodes from the
 *   server and just rearrange them client-side.
 */

import * as React from "react";
import { SortableList, reorder } from "@/components/ui/sortable";
import { Tooltip } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils/cn";

export interface QueueRailCard {
  /** Stable encounter id — used as the React key and persistence key. */
  id: string;
  /** Pre-rendered card content (server component output). */
  node: React.ReactNode;
}

interface Props {
  cards: QueueRailCard[];
  /** YYYY-MM-DD — used to scope the localStorage key per day. */
  dayKey: string;
}

const STORAGE_PREFIX = "clinic:queue-order:v1:";

function DragGripIcon() {
  return (
    <svg
      width="12"
      height="18"
      viewBox="0 0 12 18"
      fill="currentColor"
      aria-hidden="true"
      className="opacity-70 group-hover:opacity-100 transition-opacity"
    >
      <circle cx="3" cy="3" r="1.2" />
      <circle cx="3" cy="9" r="1.2" />
      <circle cx="3" cy="15" r="1.2" />
      <circle cx="9" cy="3" r="1.2" />
      <circle cx="9" cy="9" r="1.2" />
      <circle cx="9" cy="15" r="1.2" />
    </svg>
  );
}

export function QueueRailClient({ cards, dayKey }: Props) {
  const storageKey = `${STORAGE_PREFIX}${dayKey}`;
  // Track the manual override as an ordered list of ids. Cards not in
  // the override fall back to the server-provided order.
  const [order, setOrder] = React.useState<string[] | null>(null);
  const [hydrated, setHydrated] = React.useState(false);

  React.useEffect(() => {
    try {
      const raw = window.localStorage.getItem(storageKey);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.every((v) => typeof v === "string")) {
          setOrder(parsed as string[]);
        }
      }
    } catch {
      // ignore — corrupt JSON or unavailable storage.
    }
    setHydrated(true);
  }, [storageKey]);

  // Effective ordering: manual rank first, server order for the tail.
  const arranged = React.useMemo(() => {
    if (!order || order.length === 0) return cards;
    const rank = new Map<string, number>();
    order.forEach((id, i) => rank.set(id, i));
    return cards.slice().sort((a, b) => {
      const ra = rank.get(a.id);
      const rb = rank.get(b.id);
      if (ra == null && rb == null) return 0;
      if (ra == null) return 1;
      if (rb == null) return -1;
      return ra - rb;
    });
  }, [cards, order]);

  const handleReorder = (from: number, to: number) => {
    const next = reorder(arranged, from, to);
    const nextIds = next.map((c) => c.id);
    setOrder(nextIds);
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(nextIds));
    } catch {
      // ignore
    }
  };

  // Until hydrated, render the server order verbatim to avoid mismatch.
  const renderCards = hydrated ? arranged : cards;

  return (
    <div className="overflow-x-auto pb-2 scrollbar-thin">
      <SortableList
        items={renderCards}
        getKey={(c) => c.id}
        onReorder={handleReorder}
        ariaLabel="Today's queue — drag to reorder"
        className="!space-y-0 flex flex-row gap-4 snap-x snap-mandatory"
        renderItem={(card, { dragHandleProps, isDragging }) => (
          <div
            className={cn(
              "relative shrink-0 snap-start group",
              isDragging && "ring-2 ring-accent/40 rounded-xl",
            )}
          >
            {/* Floating grip in the top-left corner, only visible on
                hover or while dragging. Spreading dragHandleProps here
                makes only the grip itself the drag source so the rest
                of the card (links, Prepare button) stay clickable. */}
            <Tooltip
              content="Drag to reorder (or Space + arrow keys)"
              side="right"
              delay={400}
            >
              <span
                {...dragHandleProps}
                className={cn(
                  dragHandleProps.className,
                  "absolute top-1.5 left-1.5 z-10 p-1 rounded bg-surface/80 backdrop-blur",
                  "opacity-0 group-hover:opacity-100 focus:opacity-100",
                  "aria-grabbed:opacity-100",
                )}
              >
                <DragGripIcon />
              </span>
            </Tooltip>
            {card.node}
          </div>
        )}
      />
    </div>
  );
}
