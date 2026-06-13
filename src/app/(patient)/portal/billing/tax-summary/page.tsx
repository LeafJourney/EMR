import { PatientSectionNav } from "@/components/shell/PatientSectionNav";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db/prisma";
import { requireRole } from "@/lib/auth/session";
import { PageShell, PageHeader } from "@/components/shell/PageHeader";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Eyebrow } from "@/components/ui/ornament";
import { formatMoney } from "@/lib/domain/billing";
import { getPatientTaxSummary } from "@/lib/domain/tax-summary";

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

  // Shared aggregation — the clinician billing tab renders from the same source.
  const summary = await getPatientTaxSummary(patient.id, selectedYear);

  const totalPatientPaid = summary.totalPatientPaidCents;
  const totalCharged = summary.totalChargedCents;
  const totalPatientResponsibility = summary.totalPatientResponsibilityCents;
  const quarterTotals = summary.quarters.map((q) => ({
    label: q.label,
    amount: q.amountCents,
    count: q.count,
  }));
  const visitCount = summary.visitCount;

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
        <PrintButton variant="primary" label="Print summary" />
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
              {summary.services.length > 0 ? (
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
                      {summary.services.map((row, i) => (
                        <tr key={i} className="border-b border-border/30 last:border-0">
                          <td className="py-3 pr-4 text-text-muted tabular-nums">
                            {row.serviceDateMs
                              ? new Date(row.serviceDateMs).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" })
                              : "—"}
                          </td>
                          <td className="py-3 pr-4 text-text">{row.cptLabel}</td>
                          <td className="py-3 pr-4 text-right text-text-muted tabular-nums">
                            {formatMoney(row.billedCents)}
                          </td>
                          <td className="py-3 text-right font-medium text-text tabular-nums">
                            {formatMoney(row.patientRespCents)}
                          </td>
                        </tr>
                      ))}
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
            <PrintButton />
          </div>
        </div>
      )}
    </PageShell>
  );
}

function PrintButton({
  label = "Print or save as PDF",
  variant = "link",
}: {
  label?: string;
  variant?: "link" | "primary";
}) {
  return (
    <button
      type="button"
      onClick={() => {
        if (typeof window !== "undefined") window.print();
      }}
      className={
        variant === "primary"
          ? "inline-flex items-center gap-2 rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-accent-ink shadow-sm hover:bg-accent-strong transition-colors"
          : "inline-flex items-center gap-2 text-sm text-accent hover:text-accent/80 transition-colors font-medium"
      }
    >
      {label}
    </button>
  );
}
