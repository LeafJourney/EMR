import Link from "next/link";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

// EMR-1103 (WS-D) — chart Orders tab. Renders placed ClinicalOrder rows
// (lab + imaging) so pending orders are visible during pre-visit chart
// review, and links out to the per-modality order pages for placing new
// ones. Presentational only: page.tsx fetches and serializes the rows so
// this stays a plain (server-renderable) component with no Date/Prisma deps.

export interface ChartOrder {
  id: string;
  orderType: "lab" | "imaging";
  orderCode: string;
  orderName: string;
  priority: string;
  status: string;
  transmissionMode: string;
  diagnosisCodes: string[];
  orderedByName: string;
  /** ISO timestamp. */
  createdAt: string;
}

const STATUS_TONE: Record<string, "info" | "accent" | "success" | "neutral"> = {
  placed: "info",
  transmitted: "accent",
  resulted: "success",
  cancelled: "neutral",
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function OrdersTab({
  patientId,
  orders,
}: {
  patientId: string;
  orders: ChartOrder[];
}) {
  const pending = orders.filter((o) => o.status === "placed").length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="font-display text-xl text-text tracking-tight">
            Orders
          </h2>
          <p className="text-sm text-text-muted mt-0.5">
            {orders.length === 0
              ? "No lab or imaging orders placed yet."
              : `${orders.length} order${orders.length === 1 ? "" : "s"} on the chart${
                  pending > 0 ? ` · ${pending} pending` : ""
                }.`}
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          <Link
            href={`/clinic/patients/${patientId}/orders/labs`}
            className="text-[12px] px-3 py-1.5 rounded-md border border-border text-accent hover:bg-accent-soft transition-colors"
          >
            Place lab order ↗
          </Link>
          <Link
            href={`/clinic/patients/${patientId}/orders/imaging`}
            className="text-[12px] px-3 py-1.5 rounded-md border border-border text-accent hover:bg-accent-soft transition-colors"
          >
            Place imaging order ↗
          </Link>
        </div>
      </div>

      <Card tone="raised">
        <CardHeader>
          <CardTitle className="text-base">Placed orders</CardTitle>
          <CardDescription>
            Most recent first. Orders are saved to the chart; external
            transmission (HL7/FHIR) is not yet connected, so &quot;Not
            transmitted&quot; orders must be sent to the lab or imaging center
            manually.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {orders.length === 0 ? (
            <p className="text-sm text-text-muted">
              Nothing ordered yet. Use the buttons above to place a lab or
              imaging order.
            </p>
          ) : (
            <ul className="divide-y divide-border/60">
              {orders.map((order) => {
                const href = `/clinic/patients/${patientId}/orders/${
                  order.orderType === "lab" ? "labs" : "imaging"
                }`;
                return (
                  <li key={order.id} className="py-3 first:pt-0 last:pb-0">
                    <Link
                      href={href}
                      className="flex items-start justify-between gap-3 -mx-2 px-2 py-1 rounded-md hover:bg-surface-muted transition-colors"
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <Badge
                            tone={order.orderType === "lab" ? "success" : "info"}
                            className="text-[10px] uppercase"
                          >
                            {order.orderType}
                          </Badge>
                          <span className="font-mono text-xs text-text-subtle tabular-nums">
                            {order.orderCode}
                          </span>
                          {order.priority === "stat" && (
                            <Badge tone="danger" className="text-[10px]">
                              STAT
                            </Badge>
                          )}
                          <Badge
                            tone={STATUS_TONE[order.status] ?? "neutral"}
                            className="text-[10px]"
                          >
                            {order.status}
                          </Badge>
                          {order.transmissionMode === "simulated" && (
                            <Badge tone="warning" className="text-[10px]">
                              Not transmitted
                            </Badge>
                          )}
                        </div>
                        <p className="text-sm text-text mt-0.5">
                          {order.orderName}
                        </p>
                        {order.diagnosisCodes.length > 0 && (
                          <p className="text-xs text-text-subtle mt-0.5 font-mono">
                            {order.diagnosisCodes.join(", ")}
                          </p>
                        )}
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-xs text-text-muted">
                          {formatDate(order.createdAt)}
                        </p>
                        <p className="text-xs text-text-subtle mt-0.5">
                          {order.orderedByName}
                        </p>
                      </div>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
