"use client";

import { useState } from "react";
import { Reorder } from "framer-motion";
import { Button } from "@/components/ui/button";
import { TileGrid } from "@/components/ui/tile-grid";

export function CommandLayout({
  children,
}: {
  children: React.ReactNode[];
}) {
  const [isMoveMode, setIsMoveMode] = useState(false);
  const defaultOrder = children.map((_, i) => i);
  const [order, setOrder] = useState(defaultOrder);

  const reset = () => {
    setOrder(defaultOrder);
    setIsMoveMode(false);
  };

  if (!isMoveMode) {
    return (
      <div>
        <div className="flex justify-end mb-4 gap-2">
          <Button size="sm" variant="secondary" onClick={() => setIsMoveMode(true)}>
            Move Layout
          </Button>
          <Button size="sm" variant="secondary" onClick={reset}>
            Daily Reset
          </Button>
        </div>
        <TileGrid>
          {order.map((idx) => (
            <div key={idx} className="contents">
              {children[idx]}
            </div>
          ))}
        </TileGrid>
      </div>
    );
  }

  return (
    <div>
      <div className="flex justify-end mb-4 gap-2">
        <Button size="sm" variant="primary" onClick={() => setIsMoveMode(false)}>
          Save Layout
        </Button>
        <Button size="sm" variant="secondary" onClick={reset}>
          Daily Reset
        </Button>
      </div>
      <Reorder.Group
        axis="y"
        values={order}
        onReorder={setOrder}
        className="flex flex-col gap-4"
      >
        {order.map((idx) => (
          <Reorder.Item
            key={idx}
            value={idx}
            className="cursor-grab active:cursor-grabbing opacity-90 hover:opacity-100 transition-opacity bg-surface border-2 border-dashed border-accent/50 rounded-xl p-2"
          >
            <div className="pointer-events-none">
              {children[idx]}
            </div>
          </Reorder.Item>
        ))}
      </Reorder.Group>
    </div>
  );
}
