"use client";

/**
 * BillingWorkspace — EMR-953.
 *
 * Owns the status-filter state for the billing dashboard and filters the
 * already-loaded claim rows client-side (no server roundtrip), feeding the
 * <StatusRibbon> chips and the <BillingTable>. Seeded from the initial
 * ?status= search param so deep-links (e.g. the "View denials" alert) still
 * land on the right filter.
 */

import * as React from "react";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { StatusRibbon, type StatusKey } from "./status-ribbon";
import { BillingTable, type SerializedClaim } from "./billing-table";

export function BillingWorkspace({
  claims,
  counts,
  totalCount,
  initialStatus,
}: {
  claims: SerializedClaim[];
  counts: Record<string, number>;
  totalCount: number;
  initialStatus: StatusKey;
}) {
  const [active, setActive] = React.useState<StatusKey>(initialStatus);

  const filtered = React.useMemo(
    () => (active === "all" ? claims : claims.filter((c) => c.status === active)),
    [active, claims],
  );

  return (
    <>
      <StatusRibbon
        active={active}
        counts={counts}
        totalCount={totalCount}
        onChange={setActive}
      />
      {filtered.length === 0 ? (
        <EmptyState
          title="No claims in this view"
          description="Finalized notes become claims. Try a different filter or draft a new visit note."
        />
      ) : (
        <Card tone="raised">
          <CardContent className="p-0">
            <BillingTable claims={filtered} />
          </CardContent>
        </Card>
      )}
    </>
  );
}
