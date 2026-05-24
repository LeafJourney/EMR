"use client";

import { useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { FieldGroup, Input } from "@/components/ui/input";
import {
  EmptyFilterState,
  FilterChips,
  MultiSelectFilter,
  SavedViewsBar,
  SortMenu,
  type ActiveChip,
} from "@/components/ui/filter-bar";
import type { Vendor } from "@/lib/domain/overnight-batch";
import { cn } from "@/lib/utils/cn";

const CATEGORIES = [
  "IT",
  "Software",
  "Medical Supplies",
  "Insurance",
  "Legal",
  "Accounting",
  "Cleaning",
  "Marketing",
];

// Today is 2026-04-16 per CLAUDE.md
const TODAY = new Date("2026-04-16T00:00:00Z");

function daysUntil(end?: string): number | null {
  if (!end) return null;
  const d = new Date(end);
  return Math.round((d.getTime() - TODAY.getTime()) / 86_400_000);
}

type SortKey = "name-asc" | "ends-asc" | "ends-desc" | "cost-desc" | "cost-asc";

type ViewState = {
  query: string;
  categories: string[];
  expiringOnly: boolean;
  sort: SortKey;
};

const DEFAULT_STATE: ViewState = {
  query: "",
  categories: [],
  expiringOnly: false,
  sort: "name-asc",
};

const SORT_OPTIONS = [
  { value: "name-asc", label: "Name (A-Z)" },
  { value: "ends-asc", label: "Contract ends (soonest)" },
  { value: "ends-desc", label: "Contract ends (latest)" },
  { value: "cost-desc", label: "Monthly cost (high to low)" },
  { value: "cost-asc", label: "Monthly cost (low to high)" },
] as const;

export function VendorsView({ initialVendors }: { initialVendors: Vendor[] }) {
  const [vendors, setVendors] = useState<Vendor[]>(initialVendors);
  const [state, setState] = useState<ViewState>(DEFAULT_STATE);
  const [showAdd, setShowAdd] = useState(false);
  const [draft, setDraft] = useState({
    name: "",
    category: "IT",
    contactName: "",
    email: "",
    phone: "",
    contractEnds: "",
    monthlyCost: 0,
  });

  const filtered = useMemo(() => {
    const q = state.query.trim().toLowerCase();
    const list = vendors.filter((v) => {
      if (state.categories.length > 0 && !state.categories.includes(v.category)) {
        return false;
      }
      if (state.expiringOnly) {
        const d = daysUntil(v.contractEnds);
        if (d === null || d < 0 || d > 30) return false;
      }
      if (!q) return true;
      return (
        v.name.toLowerCase().includes(q) ||
        (v.contactName ?? "").toLowerCase().includes(q) ||
        (v.email ?? "").toLowerCase().includes(q)
      );
    });

    return list.sort((a, b) => {
      switch (state.sort) {
        case "name-asc":
          return a.name.localeCompare(b.name);
        case "ends-asc": {
          const ad = daysUntil(a.contractEnds) ?? Infinity;
          const bd = daysUntil(b.contractEnds) ?? Infinity;
          return ad - bd;
        }
        case "ends-desc": {
          const ad = daysUntil(a.contractEnds) ?? -Infinity;
          const bd = daysUntil(b.contractEnds) ?? -Infinity;
          return bd - ad;
        }
        case "cost-desc":
          return (b.monthlyCost ?? 0) - (a.monthlyCost ?? 0);
        case "cost-asc":
          return (a.monthlyCost ?? 0) - (b.monthlyCost ?? 0);
      }
    });
  }, [vendors, state]);

  const expiring = useMemo(
    () =>
      vendors.filter((v) => {
        const d = daysUntil(v.contractEnds);
        return d !== null && d >= 0 && d <= 30;
      }),
    [vendors],
  );

  const chips: ActiveChip[] = [];
  if (state.query.trim()) {
    chips.push({ id: "query", label: "Search", value: state.query.trim() });
  }
  if (state.categories.length > 0) {
    chips.push({
      id: "categories",
      label: "Category",
      value: state.categories,
    });
  }
  if (state.expiringOnly) {
    chips.push({ id: "expiring", label: "Status", value: "Expiring ≤ 30 days" });
  }

  function removeChip(id: string) {
    setState((s) => {
      if (id === "query") return { ...s, query: "" };
      if (id === "categories") return { ...s, categories: [] };
      if (id === "expiring") return { ...s, expiringOnly: false };
      return s;
    });
  }

  function clearAll() {
    setState({ ...DEFAULT_STATE, sort: state.sort });
  }

  function isDefault(s: ViewState) {
    return (
      s.query === "" &&
      s.categories.length === 0 &&
      !s.expiringOnly &&
      s.sort === DEFAULT_STATE.sort
    );
  }

  function addVendor() {
    if (!draft.name.trim()) return;
    const v: Vendor = {
      id: `v-${Date.now()}`,
      name: draft.name.trim(),
      category: draft.category,
      contactName: draft.contactName.trim() || undefined,
      email: draft.email.trim() || undefined,
      phone: draft.phone.trim() || undefined,
      contractEnds: draft.contractEnds || undefined,
      monthlyCost: draft.monthlyCost || undefined,
      active: true,
    };
    setVendors((prev) => [v, ...prev]);
    setShowAdd(false);
    setDraft({
      name: "",
      category: "IT",
      contactName: "",
      email: "",
      phone: "",
      contractEnds: "",
      monthlyCost: 0,
    });
  }

  return (
    <div className="space-y-5">
      {expiring.length > 0 && (
        <Card tone="raised" className="border-amber-300/60 bg-amber-50/60">
          <CardContent className="py-4 flex items-center justify-between gap-3 flex-wrap">
            <div>
              <p className="text-sm font-medium text-amber-900">
                {expiring.length} {expiring.length === 1 ? "contract" : "contracts"} expiring in 30 days
              </p>
              <p className="text-xs text-amber-800/80 mt-1">
                {expiring.map((v) => `${v.name} (${v.contractEnds})`).join(" · ")}
              </p>
            </div>
            {!state.expiringOnly && (
              <button
                type="button"
                onClick={() => setState((s) => ({ ...s, expiringOnly: true }))}
                className="text-xs font-medium text-amber-900 underline underline-offset-2 hover:no-underline"
              >
                Show only expiring →
              </button>
            )}
          </CardContent>
        </Card>
      )}

      <SavedViewsBar
        storageKey="ops.vendors"
        currentState={state}
        isDefault={isDefault}
        onApply={(s) => setState(s)}
        onReset={() => setState(DEFAULT_STATE)}
      />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 flex-wrap">
          <Input
            type="search"
            placeholder="Search vendors…"
            value={state.query}
            onChange={(e) => setState((s) => ({ ...s, query: e.target.value }))}
            className="md:w-64 h-9"
          />
          <MultiSelectFilter
            label="Category"
            options={CATEGORIES.map((c) => ({ value: c, label: c }))}
            selected={state.categories}
            onChange={(next) => setState((s) => ({ ...s, categories: next }))}
            placeholder="All categories"
          />
          <button
            type="button"
            onClick={() =>
              setState((s) => ({ ...s, expiringOnly: !s.expiringOnly }))
            }
            className={cn(
              "h-9 px-3 rounded-md border text-sm transition-colors",
              state.expiringOnly
                ? "border-accent bg-accent-soft text-accent font-medium"
                : "border-border-strong bg-surface text-text-muted hover:bg-surface-muted/60",
            )}
          >
            Expiring ≤ 30d
          </button>
          <SortMenu
            options={[...SORT_OPTIONS]}
            value={state.sort}
            onChange={(next) => setState((s) => ({ ...s, sort: next as SortKey }))}
          />
        </div>
        <Button size="sm" onClick={() => setShowAdd(true)}>
          Add vendor
        </Button>
      </div>

      <FilterChips chips={chips} onRemove={removeChip} onClearAll={clearAll} />

      <Card tone="raised">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[10px] uppercase tracking-wider text-text-subtle border-b border-border">
                <th className="px-5 py-3 font-medium">Vendor</th>
                <th className="px-5 py-3 font-medium">Category</th>
                <th className="px-5 py-3 font-medium">Contact</th>
                <th className="px-5 py-3 font-medium text-right">Monthly</th>
                <th className="px-5 py-3 font-medium">Contract ends</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((v) => {
                const d = daysUntil(v.contractEnds);
                const isExpiring = d !== null && d >= 0 && d <= 30;
                return (
                  <tr key={v.id} className="border-b border-border/40 hover:bg-surface-muted/40">
                    <td className="px-5 py-3.5">
                      <p className="font-medium text-text">{v.name}</p>
                    </td>
                    <td className="px-5 py-3.5">
                      <Badge tone="neutral">{v.category}</Badge>
                    </td>
                    <td className="px-5 py-3.5 text-xs text-text-muted">
                      <div>{v.contactName ?? "—"}</div>
                      <div className="text-[11px] text-text-subtle">
                        {v.email ?? ""} {v.phone ? `· ${v.phone}` : ""}
                      </div>
                    </td>
                    <td className="px-5 py-3.5 text-right tabular-nums">
                      {v.monthlyCost ? `$${v.monthlyCost.toLocaleString()}` : "—"}
                    </td>
                    <td className={cn("px-5 py-3.5 text-xs", isExpiring ? "text-[color:var(--highlight-hover)]" : "text-text-muted")}>
                      {v.contractEnds ? (
                        <>
                          <div>{v.contractEnds}</div>
                          {d !== null && (
                            <div className="text-[10px] text-text-subtle">
                              {d < 0 ? "expired" : `${d} days`}
                              {isExpiring && " — renew soon"}
                            </div>
                          )}
                        </>
                      ) : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {filtered.length === 0 && (
            <div className="p-4">
              <EmptyFilterState
                title="No vendors match your filters"
                hint="Try removing a category or the expiring-only toggle."
                onClear={clearAll}
              />
            </div>
          )}
        </div>
      </Card>

      {showAdd && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
          onClick={() => setShowAdd(false)}
        >
          <Card tone="raised" className="w-full max-w-lg" onClick={(e) => e.stopPropagation()}>
            <CardContent className="py-6 space-y-4">
              <div>
                <p className="text-xs uppercase tracking-wider text-text-subtle mb-1">New</p>
                <h3 className="font-display text-lg text-text">Add vendor</h3>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <FieldGroup label="Name">
                  <Input
                    value={draft.name}
                    onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                  />
                </FieldGroup>
                <FieldGroup label="Category">
                  <select
                    value={draft.category}
                    onChange={(e) => setDraft({ ...draft, category: e.target.value })}
                    className="flex w-full rounded-md border border-border-strong bg-surface px-3 h-10 text-sm text-text"
                  >
                    {CATEGORIES.map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </FieldGroup>
                <FieldGroup label="Contact name">
                  <Input
                    value={draft.contactName}
                    onChange={(e) => setDraft({ ...draft, contactName: e.target.value })}
                  />
                </FieldGroup>
                <FieldGroup label="Email">
                  <Input
                    type="email"
                    value={draft.email}
                    onChange={(e) => setDraft({ ...draft, email: e.target.value })}
                  />
                </FieldGroup>
                <FieldGroup label="Phone">
                  <Input
                    value={draft.phone}
                    onChange={(e) => setDraft({ ...draft, phone: e.target.value })}
                  />
                </FieldGroup>
                <FieldGroup label="Contract ends">
                  <Input
                    type="date"
                    value={draft.contractEnds}
                    onChange={(e) => setDraft({ ...draft, contractEnds: e.target.value })}
                  />
                </FieldGroup>
                <FieldGroup label="Monthly cost ($)">
                  <Input
                    type="number"
                    min={0}
                    value={draft.monthlyCost}
                    onChange={(e) => setDraft({ ...draft, monthlyCost: Number(e.target.value) || 0 })}
                  />
                </FieldGroup>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <Button variant="ghost" size="sm" onClick={() => setShowAdd(false)}>
                  Cancel
                </Button>
                <Button size="sm" onClick={addVendor} disabled={!draft.name.trim()}>
                  Save vendor
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
