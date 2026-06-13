"use client";

import { useMemo, useState, useTransition } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/ui/empty-state";
import {
  SectionSearchBar,
  applySectionQuery,
  type SectionQuery,
} from "@/components/ops/master";
import { cn } from "@/lib/utils/cn";
import { AgentDraftedCard } from "@/components/supplies/agent-drafted-card";
import type { SupplyOrderRow, SupplyOrderStatus } from "./_placeholder-types";
import {
  cancelSupplyOrder,
  markSupplyOrderDelivered,
  markSupplyOrderShipped,
} from "./actions";

type TabKey = "drafted" | "submitted" | "shipped" | "delivered";

const TABS: { key: TabKey; label: string; statuses: SupplyOrderStatus[] }[] = [
  { key: "drafted", label: "Agent-drafted", statuses: ["agent_drafted", "awaiting_approval"] },
  { key: "submitted", label: "Submitted", statuses: ["approved", "submitted"] },
  { key: "shipped", label: "Shipped", statuses: ["shipped"] },
  { key: "delivered", label: "Delivered", statuses: ["delivered"] },
];

const EMPTY: Record<TabKey, { title: string; description: string }> = {
  drafted: {
    title: "All caught up",
    description:
      "No supply orders are waiting on you. The agent will draft new orders here as stock dips below reorder points.",
  },
  submitted: {
    title: "No orders in flight",
    description: "Once you approve a draft, it shows up here until the supplier ships.",
  },
  shipped: {
    title: "Nothing in transit",
    description: "Suppliers will mark orders shipped here once they leave the warehouse.",
  },
  delivered: {
    title: "No deliveries yet",
    description: "Closed-out orders live here for your audit trail.",
  },
};

function formatCents(c: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(c / 100);
}

function shortDate(iso: string | null) {
  return iso ? new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" }) : "—";
}

export function SuppliesInbox({ initialRows }: { initialRows: SupplyOrderRow[] }) {
  const [active, setActive] = useState<TabKey>("drafted");
  const rowsByTab = useMemo(() => {
    const map = { drafted: [], submitted: [], shipped: [], delivered: [] } as Record<
      TabKey,
      SupplyOrderRow[]
    >;
    for (const tab of TABS) {
      map[tab.key] = initialRows.filter((r) => tab.statuses.includes(r.status));
    }
    return map;
  }, [initialRows]);
  // MASTER-prompt G8 — date / amount / supplier search over the active tab.
  const [sectionQuery, setSectionQuery] = useState<SectionQuery | null>(null);
  const rows = useMemo(() => {
    const base = rowsByTab[active];
    return sectionQuery
      ? applySectionQuery(base, sectionQuery, {
          getDate: (r) => r.createdAt,
          getAmount: (r) => r.totalCents / 100,
          getText: (r) => `${r.supplyName} ${r.supplierName ?? ""}`,
        })
      : base;
  }, [rowsByTab, active, sectionQuery]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <nav
          role="tablist"
          aria-label="Supply order status"
          className="flex flex-wrap gap-1 p-1 rounded-xl bg-surface-muted/60 border border-border/60 w-fit"
        >
        {TABS.map((tab) => {
          const count = rowsByTab[tab.key].length;
          const isActive = active === tab.key;
          return (
            <button
              key={tab.key}
              role="tab"
              aria-selected={isActive}
              onClick={() => setActive(tab.key)}
              className={cn(
                "h-10 px-4 rounded-lg text-sm font-medium inline-flex items-center gap-2 transition-all duration-200 ease-smooth",
                isActive ? "bg-surface text-text shadow-sm" : "text-text-muted hover:text-text hover:bg-surface/60",
              )}
            >
              <span>{tab.label}</span>
              <span
                className={cn(
                  "inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full text-[11px] tabular-nums",
                  isActive ? "bg-accent text-accent-ink" : "bg-surface-raised text-text-muted border border-border/70",
                )}
              >
                {count}
              </span>
            </button>
          );
        })}
        </nav>
        <SectionSearchBar
          onChange={setSectionQuery}
          placeholder="Search — “last 30 days”, “> 100”, supplier…"
          aria-label="Search supply orders by date, amount, or name"
        />
      </div>

      {rows.length === 0 ? (
        <EmptyState title={EMPTY[active].title} description={EMPTY[active].description} />
      ) : active === "drafted" ? (
        <div className="space-y-3">
          {rows.map((row) => (
            <AgentDraftedCard key={row.id} row={row} />
          ))}
        </div>
      ) : (
        <Card tone="raised">
          <ul className="divide-y divide-border/60">
            {rows.map((row) => (
              <FollowupRow key={row.id} row={row} tab={active} />
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}

function FollowupRow({ row, tab }: { row: SupplyOrderRow; tab: TabKey }) {
  const detail =
    tab === "submitted"
      ? `Submitted ${shortDate(row.submittedAt)}${row.expectedDeliveryAt ? ` · ETA ${shortDate(row.expectedDeliveryAt)}` : ""}`
      : tab === "shipped"
        ? `Shipped ${shortDate(row.shippedAt)}${row.expectedDeliveryAt ? ` · ETA ${shortDate(row.expectedDeliveryAt)}` : ""}`
        : `Delivered ${shortDate(row.deliveredAt)}`;
  return (
    <li className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 hover:bg-surface-muted/30">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <p className="font-medium text-text truncate">{row.supplyName}</p>
          <Badge tone={row.proposedBy.kind === "agent" ? "accent" : "neutral"}>
            {row.proposedByLabel}
          </Badge>
          {row.autoSubmitted && <Badge tone="highlight">Auto-submitted</Badge>}
        </div>
        <p className="text-[11px] text-text-subtle mt-1">
          {row.supplierName ?? "—"} · {row.qty} × {formatCents(row.unitCostCents)} ·{" "}
          <span className="text-text-muted">{formatCents(row.totalCents)}</span> · {detail}
        </p>
      </div>
      <div className="flex items-center gap-2">
        {tab === "submitted" && <SubmittedActions row={row} />}
        {tab === "shipped" && <ShippedActions row={row} />}
        {tab === "delivered" && <Badge tone="success">Delivered</Badge>}
      </div>
    </li>
  );
}

function useAsync() {
  const [pending, t] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const run = (fn: () => Promise<void>, ok?: () => void, ve?: string | null) => {
    if (ve) return setErr(ve);
    setErr(null);
    t(async () => {
      try {
        await fn();
        ok?.();
      } catch (e) {
        setErr(e instanceof Error ? e.message : "Action failed");
      }
    });
  };
  return { pending, err, run };
}

function SubmittedActions({ row }: { row: SupplyOrderRow }) {
  const { pending, err, run } = useAsync();
  const [mode, setMode] = useState<"idle" | "ship" | "cancel">("idle");
  const [text, setText] = useState("");
  if (mode === "idle")
    return (
      <>
        <Button size="sm" variant="primary" onClick={() => setMode("ship")}>Mark shipped</Button>
        <Button size="sm" variant="ghost" onClick={() => setMode("cancel")}>Cancel</Button>
        {err && <span className="text-xs text-danger">{err}</span>}
      </>
    );
  const isCancel = mode === "cancel";
  return (
    <div className="flex items-center gap-2">
      <Input
        placeholder={isCancel ? "Cancellation reason" : "Supplier PO ref (optional)"}
        value={text}
        onChange={(e) => setText(e.target.value)}
        className="w-56"
        disabled={pending}
      />
      <Button
        size="sm"
        variant={isCancel ? "danger" : "primary"}
        onClick={() =>
          run(
            () => (isCancel ? cancelSupplyOrder(row.id, text.trim()) : markSupplyOrderShipped(row.id, text.trim() || undefined)),
            () => { setMode("idle"); setText(""); },
            isCancel && !text.trim() ? "Reason required." : null,
          )
        }
        disabled={pending}
      >
        {isCancel ? "Cancel order" : "Confirm shipped"}
      </Button>
      <Button size="sm" variant="ghost" onClick={() => setMode("idle")} disabled={pending}>Back</Button>
      {err && <span className="text-xs text-danger">{err}</span>}
    </div>
  );
}

function ShippedActions({ row }: { row: SupplyOrderRow }) {
  const { pending, err, run } = useAsync();
  const [open, setOpen] = useState(false);
  const [qty, setQty] = useState<number>(row.qty);
  if (!open)
    return (
      <>
        <Button size="sm" variant="primary" onClick={() => setOpen(true)}>Mark delivered</Button>
        {err && <span className="text-xs text-danger">{err}</span>}
      </>
    );
  return (
    <div className="flex items-center gap-2">
      <Input
        type="number"
        min={0}
        value={qty}
        onChange={(e) => setQty(Math.max(0, Number(e.target.value) || 0))}
        className="w-24"
        disabled={pending}
        aria-label="Delivered quantity"
      />
      <Button size="sm" onClick={() => run(() => markSupplyOrderDelivered(row.id, qty), () => setOpen(false))} disabled={pending}>
        Confirm delivered
      </Button>
      <Button size="sm" variant="ghost" onClick={() => setOpen(false)} disabled={pending}>Cancel</Button>
      {err && <span className="text-xs text-danger">{err}</span>}
    </div>
  );
}
