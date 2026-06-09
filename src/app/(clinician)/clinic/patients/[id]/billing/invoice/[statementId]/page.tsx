import { notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/db/prisma";
import { requireUser } from "@/lib/auth/session";
import { Button } from "@/components/ui/button";
import { LeafSprig } from "@/components/ui/ornament";
import { formatDate } from "@/lib/utils/format";
import { formatMoney } from "@/lib/domain/billing";
import { PrintInvoiceButton } from "../print-button";

interface PageProps {
  params: { id: string; statementId: string };
}

export const metadata = { title: "Invoice" };

interface Address {
  line1?: string;
  line2?: string;
  city?: string;
  state?: string;
  postalCode?: string;
}

interface LineItem {
  description?: string;
  amountCents?: number;
  cptCode?: string;
}

// ---------------------------------------------------------------------------
// EMR-906 — Branded, print-friendly invoice for a single statement.
// Isolated print stylesheet hides the app shell so a Ctrl/Cmd-P yields a clean
// one-page invoice with the practice header + payment instructions.
// ---------------------------------------------------------------------------

export default async function InvoicePrintPage({ params }: PageProps) {
  const user = await requireUser();

  const [statement, patient, org] = await Promise.all([
    prisma.statement.findFirst({
      where: { id: params.statementId, patientId: params.id, organizationId: user.organizationId! },
    }),
    prisma.patient.findFirst({
      where: { id: params.id, organizationId: user.organizationId!, deletedAt: null },
    }),
    prisma.organization.findUnique({ where: { id: user.organizationId! } }),
  ]);

  if (!statement || !patient || !org) notFound();

  const addr = (org.billingAddress as Address | null) ?? null;
  const items: LineItem[] = Array.isArray(statement.lineItems)
    ? (statement.lineItems as LineItem[])
    : [];

  return (
    <>
      {/* Print isolation — hide everything but the invoice sheet on print. */}
      <style
        dangerouslySetInnerHTML={{
          __html: `@media print {
            body * { visibility: hidden !important; }
            #invoice-sheet, #invoice-sheet * { visibility: visible !important; }
            #invoice-sheet { position: absolute; left: 0; top: 0; width: 100%; padding: 0 !important; }
            [data-no-print] { display: none !important; }
          }`,
        }}
      />

      <div className="max-w-[820px] mx-auto px-6 py-8">
        {/* Action bar (not printed) */}
        <div className="flex items-center justify-between mb-6" data-no-print>
          <Link href={`/clinic/patients/${params.id}/billing`}>
            <Button variant="secondary" size="sm">
              Back to billing
            </Button>
          </Link>
          <PrintInvoiceButton />
        </div>

        {/* The printable sheet */}
        <div
          id="invoice-sheet"
          className="bg-surface border border-border rounded-2xl p-10 print:border-0 print:rounded-none"
        >
          {/* Header: practice brand + invoice meta */}
          <div className="flex items-start justify-between gap-6 pb-6 border-b border-border">
            <div className="flex items-start gap-3">
              <LeafSprig size={28} className="text-accent mt-0.5" />
              <div>
                <p className="font-display text-xl text-text tracking-tight">{org.name}</p>
                {addr && (
                  <p className="text-xs text-text-muted mt-1 leading-relaxed">
                    {addr.line1}
                    {addr.line2 ? `, ${addr.line2}` : ""}
                    {addr.line1 && <br />}
                    {[addr.city, addr.state, addr.postalCode].filter(Boolean).join(", ")}
                  </p>
                )}
                {org.billingNpi && (
                  <p className="text-[11px] text-text-subtle mt-1">NPI {org.billingNpi}</p>
                )}
              </div>
            </div>
            <div className="text-right">
              <p className="text-[10px] font-medium uppercase tracking-wider text-text-subtle">
                Invoice
              </p>
              <p className="font-display text-lg text-text tabular-nums">
                {statement.statementNumber}
              </p>
              <p className="text-xs text-text-muted mt-1">
                Issued {formatDate(statement.createdAt)}
              </p>
              <p className="text-xs text-text-muted">Due {formatDate(statement.dueDate)}</p>
            </div>
          </div>

          {/* Bill-to + period */}
          <div className="grid grid-cols-2 gap-6 py-6">
            <div>
              <p className="text-[10px] font-medium uppercase tracking-wider text-text-subtle mb-1">
                Bill to
              </p>
              <p className="text-sm text-text font-medium">
                {patient.firstName} {patient.lastName}
              </p>
              {patient.dateOfBirth && (
                <p className="text-[11px] text-text-subtle mt-0.5">
                  DOB {formatDate(patient.dateOfBirth)}
                </p>
              )}
            </div>
            <div className="text-right">
              <p className="text-[10px] font-medium uppercase tracking-wider text-text-subtle mb-1">
                Statement period
              </p>
              <p className="text-sm text-text">
                {formatDate(statement.periodStart)} – {formatDate(statement.periodEnd)}
              </p>
            </div>
          </div>

          {/* Line items */}
          <table className="w-full text-sm border-t border-border">
            <thead>
              <tr className="text-left">
                <th className="py-2 font-medium text-text-subtle text-[10px] uppercase tracking-wider">
                  Description
                </th>
                <th className="py-2 font-medium text-text-subtle text-[10px] uppercase tracking-wider">
                  Code
                </th>
                <th className="py-2 font-medium text-text-subtle text-[10px] uppercase tracking-wider text-right">
                  Amount
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60">
              {items.length === 0 ? (
                <tr>
                  <td colSpan={3} className="py-4 text-center text-text-muted text-xs">
                    No itemized charges on this statement.
                  </td>
                </tr>
              ) : (
                items.map((item, i) => (
                  <tr key={i}>
                    <td className="py-2.5 text-text">{item.description ?? "Charge"}</td>
                    <td className="py-2.5 text-text-muted font-mono text-xs">
                      {item.cptCode ?? "—"}
                    </td>
                    <td className="py-2.5 text-right tabular-nums text-text">
                      {formatMoney(item.amountCents ?? 0)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>

          {/* Totals */}
          <div className="flex justify-end pt-6">
            <div className="w-full max-w-xs space-y-1.5 text-sm">
              <TotalRow label="Total charges" value={formatMoney(statement.totalChargesCents)} />
              <TotalRow
                label="Insurance paid"
                value={`(${formatMoney(statement.insurancePaidCents)})`}
                muted
              />
              <TotalRow
                label="Adjustments"
                value={`(${formatMoney(statement.adjustmentsCents)})`}
                muted
              />
              {statement.priorBalanceCents !== 0 && (
                <TotalRow
                  label="Prior balance"
                  value={formatMoney(statement.priorBalanceCents)}
                  muted
                />
              )}
              <TotalRow
                label="Paid to date"
                value={`(${formatMoney(statement.paidToDateCents)})`}
                muted
              />
              <div className="pt-2 mt-1 border-t border-border">
                <TotalRow
                  label="Amount due"
                  value={formatMoney(statement.amountDueCents)}
                  emphasize
                />
              </div>
            </div>
          </div>

          {/* Plain-language summary */}
          {statement.plainLanguageSummary && (
            <div className="mt-6 p-4 rounded-lg bg-accent/5 border border-accent/10">
              <p className="text-[10px] font-medium uppercase tracking-wider text-accent mb-1">
                What this means
              </p>
              <p className="text-xs text-text-muted leading-relaxed">
                {statement.plainLanguageSummary}
              </p>
            </div>
          )}

          {/* Payment instructions */}
          <div className="mt-8 pt-6 border-t border-border">
            <p className="text-[10px] font-medium uppercase tracking-wider text-text-subtle mb-2">
              Payment instructions
            </p>
            <p className="text-xs text-text-muted leading-relaxed">
              Please remit the amount due by {formatDate(statement.dueDate)}. Pay securely online
              through your patient portal, by phone, or mail a check payable to{" "}
              <span className="text-text font-medium">{org.name}</span>
              {addr?.line1 ? ` at ${addr.line1}, ${[addr.city, addr.state, addr.postalCode].filter(Boolean).join(", ")}` : ""}.
              Reference invoice {statement.statementNumber} on your payment. Questions about this
              invoice? Contact the billing office.
            </p>
          </div>
        </div>
      </div>
    </>
  );
}

function TotalRow({
  label,
  value,
  muted,
  emphasize,
}: {
  label: string;
  value: string;
  muted?: boolean;
  emphasize?: boolean;
}) {
  return (
    <div className="flex items-center justify-between">
      <span className={emphasize ? "text-text font-medium" : "text-text-subtle"}>{label}</span>
      <span
        className={`tabular-nums ${
          emphasize
            ? "font-display text-lg text-text"
            : muted
              ? "text-text-muted"
              : "text-text"
        }`}
      >
        {value}
      </span>
    </div>
  );
}
