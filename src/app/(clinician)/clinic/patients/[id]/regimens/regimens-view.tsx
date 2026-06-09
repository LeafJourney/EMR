"use client";

import * as React from "react";
import { cn } from "@/lib/utils/cn";
import { Card, CardContent } from "@/components/ui/card";
import { Bubble } from "../chart-kit";
import { methodByKey } from "@/lib/clinical/methods-of-administration";
import type { RxRegimen } from "../rx-tab";

/**
 * EMR-878 — searchable active/inactive regimen browser. The search matches
 * across name, dosing, ratio, frequency and milligrams; a dropdown filters
 * by active vs inactive.
 */
export function RegimensView({
  patientId,
  regimens,
}: {
  patientId: string;
  regimens: RxRegimen[];
}) {
  const [status, setStatus] = React.useState<"active" | "inactive" | "all">("active");
  const [query, setQuery] = React.useState("");

  const q = query.trim().toLowerCase();

  const filtered = regimens.filter((r) => {
    if (status === "active" && !r.active) return false;
    if (status === "inactive" && r.active) return false;
    if (!q) return true;
    const hay = [
      r.productName,
      r.brand,
      r.sig,
      r.doseLabel,
      r.ratioLabel,
      `${r.frequencyPerDay}x daily`,
      r.thcMgPerDay != null ? `${r.thcMgPerDay}mg thc` : "",
      r.cbdMgPerDay != null ? `${r.cbdMgPerDay}mg cbd` : "",
      r.prescribedDate,
      r.route,
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    return hay.includes(q);
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 flex-wrap">
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value as typeof status)}
          className="text-sm rounded-md border border-border bg-surface px-3 py-2 text-text focus:outline-none focus:border-accent"
        >
          <option value="active">Active regimens</option>
          <option value="inactive">Inactive regimens</option>
          <option value="all">All regimens</option>
        </select>
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by date, name, dosing, ratio, frequency, mg…"
          className="flex-1 min-w-[260px] text-sm rounded-md border border-border bg-surface px-3 py-2 text-text focus:outline-none focus:border-accent"
        />
        <span className="text-xs text-text-subtle tabular-nums">
          {filtered.length} of {regimens.length}
        </span>
      </div>

      {filtered.length === 0 ? (
        <Card tone="outlined">
          <CardContent className="py-8 text-center text-sm text-text-muted">
            No regimens match.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {filtered.map((r) => {
            const method = methodByKey(r.methodKey);
            return (
              <Card key={r.id} tone="raised">
                <CardContent className="py-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap mb-1">
                        <span className="text-sm font-medium text-text">
                          {r.productName}
                        </span>
                        {r.ratioLabel && <Bubble tone="ratio">{r.ratioLabel}</Bubble>}
                        <Bubble tone={r.active ? "active" : "inactive"}>
                          {r.active ? "Active" : "Inactive"}
                        </Bubble>
                        {method && (
                          <Bubble className={method.headerClass}>{method.label}</Bubble>
                        )}
                      </div>
                      <p className="text-xs text-text-muted">
                        {r.sig} · {r.doseLabel} · {r.frequencyPerDay}× daily
                      </p>
                      {(r.thcMgPerDay != null || r.cbdMgPerDay != null) && (
                        <p className="text-xs text-text-subtle tabular-nums mt-0.5">
                          {r.thcMgPerDay != null && (
                            <span className="text-accent">
                              {r.thcMgPerDay.toFixed(1)} mg THC/day
                            </span>
                          )}
                          {r.cbdMgPerDay != null && (
                            <span className="text-[color:var(--highlight)]">
                              {" · "}
                              {r.cbdMgPerDay.toFixed(1)} mg CBD/day
                            </span>
                          )}
                        </p>
                      )}
                    </div>
                    <div className="text-right text-xs text-text-subtle tabular-nums shrink-0">
                      <span className="block text-[10px] uppercase tracking-wide">
                        Prescribed
                      </span>
                      {r.prescribedDate
                        ? new Date(r.prescribedDate).toLocaleDateString()
                        : "—"}
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
