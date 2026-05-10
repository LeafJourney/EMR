import { redirect } from "next/navigation";
import { prisma } from "@/lib/db/prisma";
import { requireRole } from "@/lib/auth/session";
import { PageShell } from "@/components/shell/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Eyebrow, LeafSprig } from "@/components/ui/ornament";
import { formatUSD } from "@/lib/leafmart/cart-store";
import { formatDate } from "@/lib/utils/format";
import Link from "next/link";
import { Button } from "@/components/ui/button";

export const metadata = { title: "Order History" };

const ORDERS_CAP = 100;

// OrderItem in the schema doesn't carry a `name` or `price` directly —
// it has unitPrice / totalPrice and the user-facing label lives on the
// related Product (with an optional variant override). The previous
// version of this file used `// @ts-nocheck` on top and accessed
// `item.name` / `item.price` directly, rendering "undefined × $NaN"
// for every line item in production. Real Prisma include + safe
// fallbacks now.
type OrderTone = "success" | "info" | "danger" | "warning";

function statusTone(status: string): OrderTone {
  if (status === "delivered") return "success";
  if (status === "shipped") return "info";
  if (status === "cancelled") return "danger";
  return "warning";
}

function statusLabel(status: string): string {
  return status.charAt(0).toUpperCase() + status.slice(1);
}

export default async function OrdersPage() {
  const user = await requireRole("patient");

  const patient = await prisma.patient.findUnique({
    where: { userId: user.id },
    select: { id: true },
  });

  if (!patient) {
    redirect("/portal/intake");
  }

  // Cap the read — patients with multi-year purchase history shouldn't
  // dump every row into one render. 100 is well past any realistic
  // tenured-patient backlog; when a patient genuinely has more, we'll
  // wire pagination then.
  const orders = await prisma.order.findMany({
    where: { patientId: patient.id },
    orderBy: { createdAt: "desc" },
    take: ORDERS_CAP,
    include: {
      organization: { select: { name: true } },
      items: {
        include: {
          product: { select: { name: true } },
          variant: { select: { name: true } },
        },
      },
    },
  });

  return (
    <PageShell maxWidth="max-w-[1040px]">
      <div className="mb-8">
        <Eyebrow className="mb-3">Leafmart Commerce</Eyebrow>
        <h1 className="font-display text-2xl sm:text-3xl md:text-4xl leading-[1.1] tracking-tight text-text">
          Order History
        </h1>
        <p className="text-sm text-text-muted mt-3 leading-relaxed max-w-lg">
          View your past purchases from Leafmart and Verdant Apothecary.
        </p>
      </div>

      {orders.length === 0 ? (
        <Card tone="glass" className="text-center py-16">
          <CardContent>
            <div className="w-16 h-16 bg-surface-muted rounded-full flex items-center justify-center mx-auto mb-4">
              <span className="text-2xl">📦</span>
            </div>
            <h2 className="text-xl font-display font-medium text-text mb-2">No orders yet</h2>
            <p className="text-sm text-text-muted mb-6">
              When you purchase products from the Leafmart storefront, your history will appear here.
            </p>
            <Link href="/leafmart/shop">
              <Button>Browse the Shop</Button>
            </Link>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {orders.map((order) => (
            <Card key={order.id} tone="raised" className="overflow-hidden">
              <CardHeader className="border-b border-[var(--border)] bg-[var(--surface-muted)]/50 py-4 px-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <LeafSprig size={14} className="text-accent" />
                    <CardTitle className="text-base">
                      Order #{order.id.slice(-8).toUpperCase()}
                    </CardTitle>
                  </div>
                  <p className="text-xs text-text-muted">
                    Placed on {formatDate(order.createdAt)} • {order.organization?.name ?? "Leafmart"}
                  </p>
                </div>
                <div className="flex flex-col sm:items-end gap-2">
                  <Badge tone={statusTone(order.status)}>{statusLabel(order.status)}</Badge>
                  <p className="font-display text-lg font-medium">{formatUSD(order.total)}</p>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                <ul className="divide-y divide-[var(--border)]">
                  {order.items.map((item) => {
                    // Prefer the variant name when present (size/strain
                    // distinction), fall back to the product name, then
                    // to a placeholder so a missing relation doesn't
                    // render "undefined".
                    const label =
                      item.variant?.name ?? item.product?.name ?? "Unnamed product";
                    return (
                      <li
                        key={item.id}
                        className="flex items-center justify-between px-6 py-4"
                      >
                        <div className="flex flex-col">
                          <span className="font-medium text-text text-sm mb-1">
                            {label}
                          </span>
                          <span className="text-xs text-text-muted">
                            Qty: {item.quantity} × {formatUSD(item.unitPrice)}
                          </span>
                        </div>
                        <div className="text-sm font-medium text-text">
                          {formatUSD(item.totalPrice)}
                        </div>
                      </li>
                    );
                  })}
                </ul>
                <div className="bg-surface-raised px-6 py-4 flex justify-end gap-4 border-t border-[var(--border)]">
                  <Link href="/leafmart/shop">
                    <Button variant="secondary" size="sm">
                      Buy Again
                    </Button>
                  </Link>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </PageShell>
  );
}
