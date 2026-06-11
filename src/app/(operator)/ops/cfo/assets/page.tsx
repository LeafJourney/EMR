import { requireUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { PageShell, PageHeader } from "@/components/shell/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Eyebrow } from "@/components/ui/ornament";
import { fmtMoney } from "@/lib/finance/formatting";
import { FIXED_ASSET_MAP } from "@/lib/finance/chart-of-accounts";
import { CfoTabs } from "../components";
import { createFixedAssetAction } from "../actions";
import type { FixedAssetCategory } from "@prisma/client";

export const metadata = { title: "Assets · CFO" };
export const dynamic = "force-dynamic";

const CATEGORIES: FixedAssetCategory[] = [
  "medical_equipment",
  "computer_hardware",
  "furniture",
  "leasehold_improvement",
  "vehicle",
  "software_capitalized",
  "deposit",
  "other",
];

export default async function AssetsPage() {
  const user = await requireUser();
  const orgId = user.organizationId!;

  const assets = await prisma.fixedAsset.findMany({
    where: { organizationId: orgId, OR: [{ disposedAt: null }, { disposedAt: { gt: new Date() } }] },
    orderBy: { purchaseDate: "desc" },
  });

  const totalGross = assets.reduce((a, b) => a + b.acquiredCostCents, 0);
  const totalDeprec = assets.reduce((a, b) => {
    const monthly = b.usefulLifeMonths > 0 ? (b.acquiredCostCents - b.salvageValueCents) / b.usefulLifeMonths : 0;
    const months = (Date.now() - b.purchaseDate.getTime()) / (30.44 * 86_400_000);
    const computed = Math.min(b.acquiredCostCents - b.salvageValueCents, Math.round(monthly * Math.max(0, months)));
    return a + (b.accumulatedDeprecCents > 0 ? b.accumulatedDeprecCents : computed);
  }, 0);
  const netBook = totalGross - totalDeprec;

  return (
    <PageShell maxWidth="max-w-[1320px]">
      <PageHeader
        eyebrow="CFO · Fixed Assets"
        title="Capitalized assets"
        description="Equipment, hardware, leasehold improvements, and other capitalized assets. Depreciation is computed automatically and flows to the P&L and balance sheet."
      />
      <CfoTabs active="assets" />

      {/* Summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-10">
        <Tile label="Gross book value" value={fmtMoney(totalGross, { compact: true })} />
        <Tile label="Accumulated depreciation" value={fmtMoney(totalDeprec, { compact: true })} />
        <Tile label="Net book value" value={fmtMoney(netBook, { compact: true })} />
        <Tile label="Active assets" value={String(assets.length)} />
      </div>

      {/* Add asset */}
      <div className="mb-10">
        <Eyebrow className="mb-4">Add capitalized asset</Eyebrow>
        <Card tone="raised">
          <CardContent className="pt-5 pb-5">
            <form action={createFixedAssetAction} className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end">
              <div className="md:col-span-3">
                <label className="block text-[11px] uppercase tracking-wider text-text-subtle mb-1">Name</label>
                <Input name="name" required placeholder="e.g. ECG cart" />
              </div>
              <div className="md:col-span-3">
                <label className="block text-[11px] uppercase tracking-wider text-text-subtle mb-1">Category</label>
                <select name="category" required defaultValue="medical_equipment" className="w-full h-10 px-3 rounded-md border border-border bg-surface text-sm">
                  {CATEGORIES.map((c) => (
                    <option key={c} value={c}>{FIXED_ASSET_MAP[c].label}</option>
                  ))}
                </select>
              </div>
              <div className="md:col-span-2">
                <label className="block text-[11px] uppercase tracking-wider text-text-subtle mb-1">Cost</label>
                <Input name="cost" type="number" step="0.01" min="0" required placeholder="0.00" />
              </div>
              <div className="md:col-span-1">
                <label className="block text-[11px] uppercase tracking-wider text-text-subtle mb-1">Residual</label>
                <Input name="salvage" type="number" step="0.01" min="0" placeholder="0" />
              </div>
              <div className="md:col-span-1">
                <label className="block text-[11px] uppercase tracking-wider text-text-subtle mb-1">Life (mo)</label>
                <Input name="usefulLifeMonths" type="number" min="1" defaultValue={60} required />
              </div>
              <div className="md:col-span-1">
                <label className="block text-[11px] uppercase tracking-wider text-text-subtle mb-1">Date</label>
                <Input name="purchaseDate" type="date" defaultValue={new Date().toISOString().slice(0, 10)} required />
              </div>
              <div className="md:col-span-1">
                <Button type="submit" variant="primary" className="w-full">Add</Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>

      {/* Asset list */}
      <Card tone="raised">
        <CardContent className="pt-3 pb-3 px-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[10px] uppercase tracking-[0.12em] text-text-subtle border-b border-border/60">
                <th className="text-left py-2 px-4 font-medium">Name</th>
                <th className="text-left py-2 px-4 font-medium">Category</th>
                <th className="text-left py-2 px-4 font-medium">Acquired</th>
                <th className="text-right py-2 px-4 font-medium">Cost</th>
                <th className="text-right py-2 px-4 font-medium">Life</th>
                <th className="text-right py-2 px-4 font-medium">Net book</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60">
              {assets.length === 0 && (
                <tr><td colSpan={6} className="py-6 text-center text-text-subtle italic">No capitalized assets yet.</td></tr>
              )}
              {assets.map((a) => {
                const monthly = a.usefulLifeMonths > 0 ? (a.acquiredCostCents - a.salvageValueCents) / a.usefulLifeMonths : 0;
                const months = (Date.now() - a.purchaseDate.getTime()) / (30.44 * 86_400_000);
                const accum = a.accumulatedDeprecCents > 0 ? a.accumulatedDeprecCents : Math.min(a.acquiredCostCents - a.salvageValueCents, Math.round(monthly * Math.max(0, months)));
                const net = a.acquiredCostCents - accum;
                return (
                  <tr key={a.id} className="hover:bg-surface-muted/50">
                    <td className="py-2 px-4 text-text">{a.name}</td>
                    <td className="py-2 px-4">
                      <Badge tone="neutral" className="text-[10px]">{FIXED_ASSET_MAP[a.category].label}</Badge>
                    </td>
                    <td className="py-2 px-4 text-text-muted tabular-nums whitespace-nowrap">
                      {a.purchaseDate.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                    </td>
                    <td className="py-2 px-4 text-right tabular-nums text-text-muted">{fmtMoney(a.acquiredCostCents)}</td>
                    <td className="py-2 px-4 text-right tabular-nums text-text-subtle">{a.usefulLifeMonths}mo</td>
                    <td className="py-2 px-4 text-right tabular-nums text-text">{fmtMoney(net)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </PageShell>
  );
}

function Tile({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <Card tone="raised" className={accent ? "border-l-4 border-l-accent" : ""}>
      <CardContent className="pt-5 pb-5">
        <p className="text-[10px] uppercase tracking-[0.12em] text-text-subtle">{label}</p>
        <p className="font-display text-2xl text-text tabular-nums mt-1.5">{value}</p>
      </CardContent>
    </Card>
  );
}
