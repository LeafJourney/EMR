import { requireUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { PageShell, PageHeader } from "@/components/shell/PageHeader";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Eyebrow } from "@/components/ui/ornament";
import { UNDERPAYMENT_THRESHOLD } from "@/lib/billing/payer-contracts";
import { createContractAction, setContractActiveAction } from "./actions";

export const metadata = { title: "Payer contracts — admin" };

// EMR-223 admin page — manage the negotiated per-payer allowable tables the
// underpayment detector (payer-contracts.ts) compares paid amounts against.
// Upload a contract's rate sheet as CSV; deactivate stale contracts.

const fmtDate = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : "—");
const fmtMoney = (cents: number) => `$${(cents / 100).toFixed(2)}`;

export default async function ContractsPage() {
  const user = await requireUser();
  if (!user.organizationId) return <PageShell><p>No org selected.</p></PageShell>;

  const contracts = await prisma.payerContract.findMany({
    where: { organizationId: user.organizationId },
    include: { _count: { select: { rates: true } } },
    orderBy: [{ payerName: "asc" }, { effectiveStart: "desc" }],
  });

  const activeCount = contracts.filter((c) => c.active).length;

  return (
    <PageShell maxWidth="max-w-[1320px]">
      <PageHeader
        eyebrow="Billing → admin"
        title="Per-payer contract allowables"
        description={`Negotiated allowable per CPT × modifier. Payments below ${Math.round(
          UNDERPAYMENT_THRESHOLD * 100,
        )}% of contract are flagged as underpayments.`}
      />

      <Card className="mb-8">
        <CardHeader>
          <Eyebrow>Upload</Eyebrow>
          <CardTitle>Load a contract rate sheet</CardTitle>
          <CardDescription>
            Paste the contract&apos;s fee schedule as CSV — header{" "}
            <code>cpt_code,modifier,allowed_amount</code>. Modifier may be blank for the base rate.
            One contract per payer per effective date.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form action={createContractAction} className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <label className="block">
              <span className="text-sm font-medium">Payer ID</span>
              <input
                name="payerId"
                placeholder="60054"
                required
                className="mt-1 w-full rounded border border-border bg-transparent px-2 py-1 font-mono"
              />
            </label>
            <label className="block">
              <span className="text-sm font-medium">Payer name</span>
              <input
                name="payerName"
                placeholder="Aetna"
                required
                className="mt-1 w-full rounded border border-border bg-transparent px-2 py-1"
              />
            </label>
            <label className="block">
              <span className="text-sm font-medium">Contract name</span>
              <input
                name="contractName"
                placeholder="Aetna Commercial 2026"
                required
                className="mt-1 w-full rounded border border-border bg-transparent px-2 py-1"
              />
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                <span className="text-sm font-medium">Effective start</span>
                <input
                  name="effectiveStart"
                  type="date"
                  required
                  className="mt-1 w-full rounded border border-border bg-transparent px-2 py-1"
                />
              </label>
              <label className="block">
                <span className="text-sm font-medium">Effective end (optional)</span>
                <input
                  name="effectiveEnd"
                  type="date"
                  className="mt-1 w-full rounded border border-border bg-transparent px-2 py-1"
                />
              </label>
            </div>
            <label className="block md:col-span-2">
              <span className="text-sm font-medium">Rate CSV</span>
              <textarea
                name="csv"
                required
                rows={6}
                placeholder={"cpt_code,modifier,allowed_amount\n99213,,92.50\n99214,,130.00\n99214,95,124.00"}
                className="mt-1 w-full rounded border border-border bg-transparent px-2 py-1 font-mono text-xs"
              />
            </label>
            <div className="md:col-span-2">
              <button
                type="submit"
                className="rounded-md border border-border bg-surface-raised px-3 py-2 text-sm font-medium hover:bg-surface-elevated"
              >
                Load contract
              </button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <Eyebrow>On file</Eyebrow>
          <CardTitle>Loaded contracts ({activeCount} active)</CardTitle>
          <CardDescription>
            The contract effective on a claim&apos;s date of service is used for underpayment detection.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {contracts.length === 0 ? (
            <p className="text-sm text-text-muted">No contracts loaded yet. Upload a rate sheet above.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-text-muted border-b">
                  <th className="py-2 pr-4">Payer</th>
                  <th className="py-2 pr-4">Contract</th>
                  <th className="py-2 pr-4">Effective</th>
                  <th className="py-2 pr-4 text-right">Rates</th>
                  <th className="py-2 pr-4">Status</th>
                  <th className="py-2 pr-4 text-right">Action</th>
                </tr>
              </thead>
              <tbody>
                {contracts.map((c) => (
                  <tr key={c.id} className="border-b last:border-b-0">
                    <td className="py-2 pr-4">
                      <span className="font-medium">{c.payerName}</span>{" "}
                      <span className="text-text-muted font-mono text-xs">{c.payerId}</span>
                    </td>
                    <td className="py-2 pr-4">{c.contractName}</td>
                    <td className="py-2 pr-4 whitespace-nowrap">
                      {fmtDate(c.effectiveStart)} → {fmtDate(c.effectiveEnd)}
                    </td>
                    <td className="py-2 pr-4 text-right tabular-nums">{c._count.rates}</td>
                    <td className="py-2 pr-4">
                      {c.active ? <Badge tone="success">active</Badge> : <Badge tone="neutral">inactive</Badge>}
                    </td>
                    <td className="py-2 pr-4 text-right">
                      <form action={setContractActiveAction} className="inline">
                        <input type="hidden" name="contractId" value={c.id} />
                        <input type="hidden" name="active" value={c.active ? "false" : "true"} />
                        <button
                          type="submit"
                          className="rounded-md border border-border bg-surface-raised px-2 py-1 text-xs hover:bg-surface-elevated"
                        >
                          {c.active ? "Deactivate" : "Activate"}
                        </button>
                      </form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </PageShell>
  );
}
