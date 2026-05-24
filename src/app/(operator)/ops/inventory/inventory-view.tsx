"use client";

import { useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input, FieldGroup, Textarea } from "@/components/ui/input";
import { DataTable, type ColumnDef } from "@/components/ui/data-table";
import {
  classifyStatus,
  STATUS_STYLES,
  type InventoryItem,
  type InventoryStatus,
} from "@/lib/domain/inventory";
import { cn } from "@/lib/utils/cn";

type Filter = "all" | InventoryStatus;

const FILTER_PILLS: Array<{ key: Filter; label: string }> = [
  { key: "all", label: "All" },
  { key: "in_stock", label: "In stock" },
  { key: "low_stock", label: "Low stock" },
  { key: "out_of_stock", label: "Out of stock" },
];

export function InventoryView({ initialItems }: { initialItems: InventoryItem[] }) {
  const [items, setItems] = useState<InventoryItem[]>(initialItems);
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const [restockTarget, setRestockTarget] = useState<InventoryItem | null>(null);
  const [restockQty, setRestockQty] = useState<number>(0);
  const [showAdd, setShowAdd] = useState(false);
  const [draft, setDraft] = useState({
    productName: "",
    brand: "",
    productType: "Flower",
    initialQuantity: 0,
    reorderPoint: 10,
    supplierName: "",
  });

  const lowItems = useMemo(
    () => items.filter((i) => i.status === "low_stock" || i.status === "out_of_stock"),
    [items],
  );

  const filtered = useMemo(() => {
    return items
      .filter((i) => (filter === "all" ? true : i.status === filter))
      .filter((i) => {
        if (!query.trim()) return true;
        const q = query.toLowerCase();
        return (
          i.productName.toLowerCase().includes(q) ||
          (i.brand ?? "").toLowerCase().includes(q) ||
          (i.sku ?? "").toLowerCase().includes(q) ||
          (i.upc ?? "").toLowerCase().includes(q)
        );
      });
  }, [items, filter, query]);

  function applyRestock() {
    if (!restockTarget || restockQty <= 0) return;
    setItems((prev) =>
      prev.map((i) =>
        i.id === restockTarget.id
          ? {
              ...i,
              currentQuantity: i.currentQuantity + restockQty,
              status: classifyStatus(i.currentQuantity + restockQty, i.reorderPoint),
              lastRestockedAt: new Date().toISOString(),
            }
          : i,
      ),
    );
    setRestockTarget(null);
    setRestockQty(0);
  }

  function addItem() {
    if (!draft.productName.trim()) return;
    const newItem: InventoryItem = {
      id: `inv-${Date.now()}`,
      productId: `p-${Date.now()}`,
      productName: draft.productName.trim(),
      brand: draft.brand.trim() || null,
      productType: draft.productType,
      currentQuantity: draft.initialQuantity,
      unit: "units",
      reorderPoint: draft.reorderPoint,
      reorderQuantity: Math.max(draft.reorderPoint * 2, 10),
      supplierName: draft.supplierName.trim() || undefined,
      lastCountedAt: new Date().toISOString(),
      status: classifyStatus(draft.initialQuantity, draft.reorderPoint),
    };
    setItems((prev) => [newItem, ...prev]);
    setShowAdd(false);
    setDraft({
      productName: "",
      brand: "",
      productType: "Flower",
      initialQuantity: 0,
      reorderPoint: 10,
      supplierName: "",
    });
  }

  return (
    <div className="space-y-6">
      {/* Low stock alert */}
      {lowItems.length > 0 && (
        <Card tone="raised" className="border-amber-300/50 bg-amber-50/50">
          <CardContent className="py-4 flex items-start gap-3">
            <span className="text-xl leading-none mt-0.5">⚠️</span>
            <div className="flex-1">
              <p className="text-sm font-medium text-amber-900">
                {lowItems.length} {lowItems.length === 1 ? "item is" : "items are"} below reorder threshold
              </p>
              <p className="text-xs text-amber-800/80 mt-1">
                {lowItems
                  .slice(0, 3)
                  .map((i) => i.productName)
                  .join(" · ")}
                {lowItems.length > 3 && ` · +${lowItems.length - 3} more`}
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Filter pills + search + add */}
      <div className="flex flex-col md:flex-row md:items-center gap-3 md:justify-between">
        <div className="flex items-center gap-2 flex-wrap">
          {FILTER_PILLS.map((pill) => {
            const count =
              pill.key === "all"
                ? items.length
                : items.filter((i) => i.status === pill.key).length;
            const active = filter === pill.key;
            return (
              <button
                key={pill.key}
                type="button"
                onClick={() => setFilter(pill.key)}
                className={cn(
                  "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all border",
                  active
                    ? "bg-emerald-700 text-white border-emerald-700"
                    : "bg-surface text-text-muted border-border hover:bg-surface-muted",
                )}
              >
                {pill.label}
                <span
                  className={cn(
                    "tabular-nums text-[10px] px-1.5 py-0.5 rounded-full",
                    active ? "bg-emerald-900/30" : "bg-surface-muted",
                  )}
                >
                  {count}
                </span>
              </button>
            );
          })}
        </div>
        <div className="flex items-center gap-2">
          <Input
            type="search"
            placeholder="Search product, SKU, UPC…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="md:w-64"
          />
          <Button onClick={() => setShowAdd((v) => !v)} size="sm">
            {showAdd ? "Cancel" : "Add item"}
          </Button>
        </div>
      </div>

      {/* Add form */}
      {showAdd && (
        <Card tone="raised">
          <CardContent className="py-5">
            <p className="text-sm font-medium text-text mb-4">New inventory item</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FieldGroup label="Product name">
                <Input
                  value={draft.productName}
                  onChange={(e) => setDraft({ ...draft, productName: e.target.value })}
                  placeholder="e.g., Wedding Cake Flower 3.5g"
                />
              </FieldGroup>
              <FieldGroup label="Brand">
                <Input
                  value={draft.brand}
                  onChange={(e) => setDraft({ ...draft, brand: e.target.value })}
                  placeholder="e.g., Aeriz"
                />
              </FieldGroup>
              <FieldGroup label="Type">
                <select
                  value={draft.productType}
                  onChange={(e) => setDraft({ ...draft, productType: e.target.value })}
                  className="flex w-full rounded-md border border-border-strong bg-surface px-3 h-10 text-sm text-text"
                >
                  {[
                    "Flower",
                    "Vape Cartridge",
                    "Vape Pod",
                    "Edible",
                    "Tincture",
                    "Topical",
                    "Capsule",
                    "Concentrate",
                  ].map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </FieldGroup>
              <FieldGroup label="Supplier">
                <Input
                  value={draft.supplierName}
                  onChange={(e) => setDraft({ ...draft, supplierName: e.target.value })}
                  placeholder="e.g., Cresco Labs"
                />
              </FieldGroup>
              <FieldGroup label="Initial quantity">
                <Input
                  type="number"
                  min={0}
                  value={draft.initialQuantity}
                  onChange={(e) =>
                    setDraft({ ...draft, initialQuantity: Number(e.target.value) || 0 })
                  }
                />
              </FieldGroup>
              <FieldGroup label="Reorder point">
                <Input
                  type="number"
                  min={0}
                  value={draft.reorderPoint}
                  onChange={(e) =>
                    setDraft({ ...draft, reorderPoint: Number(e.target.value) || 0 })
                  }
                />
              </FieldGroup>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <Button variant="ghost" size="sm" onClick={() => setShowAdd(false)}>
                Cancel
              </Button>
              <Button onClick={addItem} size="sm" disabled={!draft.productName.trim()}>
                Save item
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Table — adopts the DataTable primitive so sort, sticky header,
          and density toggle come for free. */}
      <DataTable<InventoryItem>
        rows={filtered}
        rowKey={(it) => it.id}
        ariaLabel="Inventory items"
        showDensityToggle
        emptyState={
          <p className="text-center text-text-subtle text-sm">
            No items match your filters.
          </p>
        }
        columns={[
          {
            key: "productName",
            label: "Product",
            sortable: true,
            cell: (item) => (
              <>
                <p className="font-medium text-text">{item.productName}</p>
                <p className="text-[11px] text-text-subtle">
                  Reorder at {item.reorderPoint} {item.unit}
                </p>
              </>
            ),
          },
          {
            key: "brand",
            label: "Brand",
            sortable: true,
            hideOnMobile: true,
            cell: (item) => (
              <span className="text-text-muted">{item.brand ?? "—"}</span>
            ),
          },
          {
            key: "productType",
            label: "Type",
            sortable: true,
            hideOnMobile: true,
            cell: (item) => (
              <span className="text-text-muted">{item.productType}</span>
            ),
          },
          {
            key: "sku",
            label: "SKU / UPC",
            hideOnMobile: true,
            cell: (item) => (
              <>
                <p className="text-[11px] font-mono text-text-muted">
                  {item.sku ?? "—"}
                </p>
                <p className="text-[10px] font-mono text-text-subtle">
                  {item.upc ?? ""}
                </p>
              </>
            ),
          },
          {
            key: "currentQuantity",
            label: "Quantity",
            sortable: true,
            align: "right",
            cell: (item) => (
              <>
                <span className="font-medium text-text">
                  {item.currentQuantity}
                </span>{" "}
                <span className="text-xs text-text-subtle">{item.unit}</span>
              </>
            ),
          },
          {
            key: "status",
            label: "Status",
            sortable: true,
            sortFn: (a, b) => a.status.localeCompare(b.status),
            cell: (item) => {
              const style = STATUS_STYLES[item.status];
              return (
                <span
                  className={cn(
                    "inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium",
                    style.bg,
                    style.text,
                  )}
                >
                  {style.label}
                </span>
              );
            },
          },
          {
            key: "actions",
            label: "Actions",
            align: "right",
            cell: (item) => (
              <Button
                size="sm"
                variant="secondary"
                onClick={() => {
                  setRestockTarget(item);
                  setRestockQty(item.reorderQuantity);
                }}
              >
                Restock
              </Button>
            ),
          },
        ] as ColumnDef<InventoryItem>[]}
      />

      {/* Restock modal */}
      {restockTarget && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
          onClick={() => setRestockTarget(null)}
        >
          <Card
            tone="raised"
            className="w-full max-w-md"
            onClick={(e) => e.stopPropagation()}
          >
            <CardContent className="py-6">
              <p className="text-xs uppercase tracking-wider text-text-subtle mb-1">Restock</p>
              <h3 className="font-display text-lg text-text mb-1">{restockTarget.productName}</h3>
              <p className="text-xs text-text-muted mb-4">
                Current: {restockTarget.currentQuantity} {restockTarget.unit} · Reorder at{" "}
                {restockTarget.reorderPoint}
              </p>
              <FieldGroup label={`Quantity to add (${restockTarget.unit})`}>
                <Input
                  type="number"
                  min={1}
                  value={restockQty}
                  onChange={(e) => setRestockQty(Number(e.target.value) || 0)}
                  autoFocus
                />
              </FieldGroup>
              <Textarea
                placeholder="Notes (optional)…"
                rows={2}
                className="mt-3"
              />
              <div className="mt-5 flex justify-end gap-2">
                <Button variant="ghost" size="sm" onClick={() => setRestockTarget(null)}>
                  Cancel
                </Button>
                <Button onClick={applyRestock} size="sm" disabled={restockQty <= 0}>
                  Add {restockQty} to stock
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
