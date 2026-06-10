import type { ClaimStatus } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { Card, CardContent } from "@/components/ui/card";
import { formatMoney } from "@/lib/domain/billing";

// EMR-1080 (Back-Office Operations Audit §6.4 P4 #4) — make the charge-capture
// → scrub hand-off visible to staff. A signed note + ordered codes become a
// draft claim, which is scrubbed and submitted. This strip surfaces that flow
// as a stage funnel so staff can see the chain from captured charge to payer.

const STAGES: Array<{
  key: string;
  label: string;
  hint: string;
  statuses: ClaimStatus[];
}> = [
  { key: "draft", label: "Draft", hint: "Charge captured", statuses: ["draft"] },
  {
    key: "review",
    label: "In review",
    hint: "Scrubbing",
    statuses: ["scrubbing", "scrub_blocked"],
  },
  { key: "ready", label: "Ready", hint: "Scrub passed", statuses: ["ready"] },
  { key: "submitted", label: "Submitted", hint: "Sent to payer", statuses: ["submitted"] },
];

const ALL_STATUSES = STAGES.flatMap((s) => s.statuses);

export async function ChargeCapturePipeline({
  organizationId,
}: {
  organizationId: string;
}) {
  const groups = await prisma.claim.groupBy({
    by: ["status"],
    where: { organizationId, status: { in: ALL_STATUSES } },
    _count: true,
    _sum: { billedAmountCents: true },
  });

  const byStatus = new Map(
    groups.map((g) => [
      g.status,
      { count: g._count, cents: g._sum.billedAmountCents ?? 0 },
    ]),
  );

  const stages = STAGES.map((s) => {
    let count = 0;
    let cents = 0;
    for (const st of s.statuses) {
      const g = byStatus.get(st);
      if (g) {
        count += g.count;
        cents += g.cents;
      }
    }
    return { ...s, count, cents };
  });

  // Nothing captured yet — don't show an empty funnel on a fresh tenant.
  if (stages.reduce((a, s) => a + s.count, 0) === 0) return null;

  return (
    <Card tone="raised" className="mb-6">
      <CardContent className="py-4">
        <p className="mb-3 text-[11px] font-medium uppercase tracking-[0.14em] text-text-subtle">
          Charge capture → submission
        </p>
        <div className="flex items-stretch gap-2 overflow-x-auto">
          {stages.map((s, i) => (
            <div key={s.key} className="flex items-center gap-2">
              <div className="min-w-[128px] rounded-lg border border-border/60 px-4 py-2">
                <p className="font-display text-2xl tabular-nums text-text">{s.count}</p>
                <p className="text-xs font-medium text-text">{s.label}</p>
                <p className="text-[10px] text-text-subtle">
                  {s.hint} · {formatMoney(s.cents)}
                </p>
              </div>
              {i < stages.length - 1 && (
                <span aria-hidden className="text-text-subtle">
                  →
                </span>
              )}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
