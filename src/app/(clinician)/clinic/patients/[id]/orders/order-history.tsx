import { prisma } from "@/lib/db/prisma";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

// EMR-1094: read surface for placed orders. Server component — the labs
// and imaging order pages render it below the form so a clinician can see
// what has already been ordered for this patient before placing more.

interface Props {
  patientId: string;
  organizationId: string;
  orderType: "lab" | "imaging";
}

const STATUS_TONE = {
  placed: "info",
  transmitted: "accent",
  resulted: "success",
  cancelled: "neutral",
} as const;

export async function OrderHistory({ patientId, organizationId, orderType }: Props) {
  const orders = await prisma.clinicalOrder.findMany({
    where: { patientId, organizationId, orderType },
    orderBy: { createdAt: "desc" },
    take: 25,
  });

  const noun = orderType === "lab" ? "lab" : "imaging";

  return (
    <Card tone="raised">
      <CardHeader>
        <CardTitle className="text-base">
          Placed {noun} orders
        </CardTitle>
        <CardDescription>
          Most recent first. Orders are saved to the chart; external
          transmission is not yet connected.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {orders.length === 0 ? (
          <p className="text-sm text-text-muted">
            No {noun} orders have been placed for this patient yet.
          </p>
        ) : (
          <ul className="divide-y divide-border/60">
            {orders.map((order) => {
              const diagnoses = Array.isArray(order.diagnosisCodes)
                ? (order.diagnosisCodes as unknown[]).filter(
                    (d): d is string => typeof d === "string",
                  )
                : [];
              return (
                <li key={order.id} className="py-3 first:pt-0 last:pb-0">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono text-xs text-text-subtle tabular-nums">
                          {order.orderCode}
                        </span>
                        {order.priority === "stat" && (
                          <Badge tone="danger" className="text-[10px]">
                            STAT
                          </Badge>
                        )}
                        <Badge
                          tone={
                            STATUS_TONE[
                              order.status as keyof typeof STATUS_TONE
                            ] ?? "neutral"
                          }
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
                      {diagnoses.length > 0 && (
                        <p className="text-xs text-text-subtle mt-0.5 font-mono">
                          {diagnoses.join(", ")}
                        </p>
                      )}
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-xs text-text-muted">
                        {order.createdAt.toLocaleDateString("en-US", {
                          month: "short",
                          day: "numeric",
                          year: "numeric",
                        })}
                      </p>
                      <p className="text-xs text-text-subtle mt-0.5">
                        {order.orderedByName}
                      </p>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
