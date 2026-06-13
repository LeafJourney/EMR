import { PatientSectionNav } from "@/components/shell/PatientSectionNav";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db/prisma";
import { requireRole } from "@/lib/auth/session";
import { PageShell, PageHeader } from "@/components/shell/PageHeader";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Eyebrow } from "@/components/ui/ornament";
import { formatMoney } from "@/lib/domain/billing";
import { PrintButton } from "./print-button";

export const metadata = { title: "Year-End Tax Summary" };

// ---------------------------------------------------------------------------
// Year-End Tax Summary — generates a printable summary of healthcare expenses
// for tax deduction purposes (IRS Publication 502)
// ---------------------------------------------------------------------------

export default async function TaxSummaryPage() {
  const user = await requireRole("patient");

  const patient = await prisma.patient.findUnique({
    where: { userId: user.id },
  });

  if (!patient) redirect("/portal/intake");

  const currentYear = new Date().getFullYear();
  const selectedYear = currentYear - 1; // Previous tax year

  // Fetch all payments and claims for the tax year
  const [payments, claims] = await Promise.all([
    prisma.payment.findMany({
      where: {
        claim: { patientId: patient.id },
        paymentDate: {
          gte: new Date(`${selectedYear}-01-01T00:00:00.000Z`),
          lte: new Date(`${selectedYear}-12-31T23:59:59.999Z`),
        },
        source: "patient",
      },
      include: {
        claim: {
          select: {
            serviceDate: true,
            cptCodes: true,
            icd10Codes: true,
            billedAmountCents: true,
          },
        },
      },
      orderBy: { paymentDate: "asc" },
    }),
    prisma.claim.findMany({
      where: {
        patientId: patient.id,
        serviceDate: {
          gte: new Date(`${selectedYear}-01-01T00:00:00.000Z`),
          lte: new Date(`${selectedYear}-12-31T23:59:59.999Z`),
        },
      },
      orderBy: { serviceDate: "asc" },
    }),
  ]);

  const totalPatientPaid = payments.reduce((sum, p) => sum + p.amountCents, 0);
  const totalCharged = claims.reduce((sum, c) => sum + (c.billedAmountCents ?? 0), 0);
  const totalPatientResponsibility = claims.reduce(
    (sum, c) => sum + (c.patientRespCents ?? 0),
    0
  );

  // Group by quarter
  const quarters = [
    { label: "Q1 (Jan-Mar)", months: [0, 1, 2] },
    { label: "Q2 (Apr-Jun)", months: [3, 4, 5] },
    { label: "Q3 (Jul-Sep)", months: [6, 7, 8] },
    { label: "Q4 (Oct-Dec)", months: [9, 10, 11] },
  ];

  const quarterTotals = quarters.map((q) => {
    const qPayments = payments.filter((p) =>
      q.months.includes(new Date(p.paymentDate).getMonth())
    );
    return {
      ...q,
      amount: qPayments.reduce((sum, p) => sum + p.amountCents, 0),
      count: qPayments.length,
    };
  });

  const visitCount = claims.length;

  return (
    <PageShell maxWidth="max-w-[860px]">
      <PageHeader
        eyebrow="Billing"
        title={`${selectedYear} Tax Summary`}
        description="A summary of your out-of-pocket healthcare expenses for tax filing purposes. Medical expenses exceeding 7.5% of your adjusted gross income may be tax deductible."
      />

      <PatientSectionNav section="account" />

      {/* Print controls */}
      <div className="flex items-center justify-between mb-8 print:hidden">
        <div className="flex items-center gap-2">
          <Badge tone="accent">{selectedYear}</Badge>
          <span className="text-sm text-text-muted">Tax year</span>
        </div>
        <PrintButton variant="primary" size="sm" className="print:hidden">
          Print summary
        </PrintButton>
      </div>

      {totalPatientPaid === 0 && visitCount === 0 ? (
        <EmptyState
          title={`No expenses for ${selectedYear}`}
          description="You don't have any recorded healthcare expenses for this tax year."
        />
      ) : (
        <div className="space-y-6">
          {/* Summary card */}
          <Card className="rounded-2xl shadow-sm border-2 border-accent/20">
            <CardContent className="pt-8 pb-8">
              <div className="text-center mb-6">
                <Eyebrow className="justify-center mb-2">Total out-of-pocket</Eyebrow>
                <p className="font-display text-4xl text-text tracking-tight">
                  {formatMoney(totalPatientPaid)}
                </p>
                <p className="text-sm text-text-muted mt-2">
                  Across {visitCount} visit{visitCount !== 1 ? "s" : ""} in {selectedYear}
                </p>
              </div>

              <div className="grid grid-cols-3 gap-6 pt-6 border-t border-border">
                <div className="text-center">
                  <p className="text-xs text-text-subtle uppercase tracking-wider mb-1">Total billed</p>
                  <p className="text-lg font-semibold text-text">{formatMoney(totalCharged)}</p>
                </div>
                <div className="text-center">
                  <p className="text-xs text-text-subtle uppercase tracking-wider mb-1">Your responsibility</p>
                  <p className="text-lg font-semibold text-text">{formatMoney(totalPatientResponsibility)}</p>
                </div>
                <div className="text-center">
                  <p className="text-xs text-text-subtle uppercase tracking-wider mb-1">You paid</p>
                  <p className="text-lg font-semibold text-accent">{formatMoney(totalPatientPaid)}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Quarterly breakdown */}
          <Card className="rounded-2xl shadow-sm">
            <CardHeader>
              <CardTitle className="text-lg">Quarterly breakdown</CardTitle>
              <CardDescription>Out-of-pocket expenses by quarter</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {quarterTotals.map((q) => (
                  <div key={q.label} className="flex items-center justify-between py-3 border-b border-border/50 last:border-0">
                    <div>
                      <p className="text-sm font-medium text-text">{q.label}</p>
                      <p className="text-xs text-text-muted">{q.count} payment{q.count !== 1 ? "s" : ""}</p>
                    </div>
                    <p className="text-base font-semibold text-text tabular-nums">
                      {formatMoney(q.amount)}
                    </p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Service detail */}
          <Card className="rounded-2xl shadow-sm">
            <CardHeader>
              <CardTitle className="text-lg">Service detail</CardTitle>
              <CardDescription>Individual visits and charges for your records</CardDescription>
            </CardHeader>
            <CardContent>
              {claims.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-[11px] uppercase tracking-wider text-text-subtle border-b border-border">
                        <th className="py-2 pr-4">Date</th>
                        <th className="py-2 pr-4">Service</th>
                        <th className="py-2 pr-4 text-right">Charged</th>
                        <th className="py-2 text-right">Your cost</th>
                      </tr>
                    </thead>
                    <tbody>
                      {claims.map((claim) => {
                        const cptCodes = Array.isArray(claim.cptCodes) ? claim.cptCodes : [];
                        return (
                          <tr key={claim.id} className="border-b border-border/30 last:border-0">
                            <td className="py-3 pr-4 text-text-muted tabular-nums">
                              {claim.serviceDate
                                ? new Date(claim.serviceDate).toLocaleDateString("en-US", { month: "short", day: "numeric" })
                                : "—"}
                            </td>
                            <td className="py-3 pr-4 text-text">
                              {cptCodes.length > 0
                                ? (cptCodes as any[]).map((c: any) => c.code || c).join(", ")
                                : "Office visit"}
                            </td>
                            <td className="py-3 pr-4 text-right text-text-muted tabular-nums">
                              {formatMoney(claim.billedAmountCents ?? 0)}
                            </td>
                            <td className="py-3 text-right font-medium text-text tabular-nums">
                              {formatMoney(claim.patientRespCents ?? 0)}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="text-sm text-text-muted py-4 text-center">No service records found.</p>
              )}
            </CardContent>
          </Card>

          {/* Tax disclaimer */}
          <Card className="rounded-2xl shadow-sm border-l-4 border-l-amber-400/60 bg-amber-50/20">
            <CardContent className="py-5 px-5">
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-amber-700 mb-2">
                Tax information disclaimer
              </p>
              <div className="text-sm text-text-muted leading-relaxed space-y-2">
                <p>
                  This summary is provided for your convenience and informational purposes only.
                  It is not tax advice. Medical expenses may be deductible under IRS Publication 502
                  if they exceed 7.5% of your adjusted gross income.
                </p>
                <p>
                  Cannabis-related medical expenses may not be deductible under federal tax law
                  due to the current federal scheduling status. Consult a qualified tax professional
                  for guidance specific to your situation and jurisdiction.
                </p>
                <p className="text-xs text-text-subtle">
                  Provider: Leafjourney Medical &middot; EIN available upon request &middot; Generated {new Date().toLocaleDateString()}
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Print button (bottom) */}
          <div className="text-center print:hidden">
            <PrintButton variant="ghost" size="sm">
              Print or save as PDF
            </PrintButton>
          </div>
        </div>
      )}
    </PageShell>
  );
}
