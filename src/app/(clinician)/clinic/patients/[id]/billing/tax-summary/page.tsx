import { notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/db/prisma";
import { requireUser } from "@/lib/auth/session";
import { PageShell } from "@/components/shell/PageHeader";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Eyebrow } from "@/components/ui/ornament";
import { formatMoney } from "@/lib/domain/billing";
import { getPatientTaxSummary } from "@/lib/domain/tax-summary";
import { TaxSummaryActions } from "./tax-summary-actions";

export const metadata = { title: "Year-End Tax Summary" };

interface PageProps {
  params: { id: string };
  searchParams: { year?: string };
}

// ---------------------------------------------------------------------------
// Clinician-side year-end tax summary (Dr. Patel directive — billing
// "Generate tax documents"). Renders the SAME shared computation the patient
// portal uses, with Print + Email/Text-notify actions. A patient's annual
// out-of-pocket healthcare expenses for IRS Pub 502 — not a 1099/W9.
// ---------------------------------------------------------------------------

export default async function ClinicianTaxSummaryPage({ params, searchParams }: PageProps) {
  const user = await requireUser();

  const patient = await prisma.patient.findFirst({
    where: { id: params.id, organizationId: user.organizationId!, deletedAt: null },
    select: { id: true, firstName: true, lastName: true, email: true, phone: true },
  });
  if (!patient) notFound();

  const currentYear = new Date().getFullYear();
  const requestedYear = Number(searchParams.year);
  const selectedYear =
    Number.isInteger(requestedYear) && requestedYear >= 2000 && requestedYear <= currentYear
      ? requestedYear
      : currentYear - 1;
  const yearOptions = [currentYear, currentYear - 1, currentYear - 2];

  const summary = await getPatientTaxSummary(patient.id, selectedYear);
  const hasActivity = summary.totalPatientPaidCents > 0 || summary.visitCount > 0;

  return (
    <PageShell maxWidth="max-w-[860px]">
      {/* Header + actions */}
      <div className="flex items-start justify-between gap-4 mb-8">
        <div>
          <Eyebrow className="mb-2">Billing · Year-end summary</Eyebrow>
          <h1 className="font-display text-2xl text-text tracking-tight">
            {selectedYear} Tax Summary —{" "}
            <Link
              href={`/clinic/patients/${params.id}/billing`}
              className="hover:text-accent transition-colors"
            >
              {patient.firstName} {patient.lastName}
            </Link>
          </h1>
          <p className="text-sm text-text-muted mt-0.5">
            Out-of-pocket healthcare expenses for IRS Pub 502 substantiation.
          </p>
        </div>
        <div className="flex flex-col items-end gap-2 shrink-0">
          <TaxSummaryActions
            patientId={params.id}
            year={selectedYear}
            canEmail={!!patient.email}
            canText={!!patient.phone}
          />
          <Link href={`/clinic/patients/${params.id}/billing`} className="print:hidden">
            <Button variant="ghost" size="sm">
              ← Back to billing
            </Button>
          </Link>
        </div>
      </div>

      {/* Year selector */}
      <div className="flex items-center gap-1 mb-8 print:hidden">
        {yearOptions.map((y) => (
          <Link
            key={y}
            href={`/clinic/patients/${params.id}/billing/tax-summary?year=${y}`}
            className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
              y === selectedYear
                ? "bg-accent/10 text-accent border-accent/20"
                : "bg-surface-muted text-text-muted border-border hover:text-text"
            }`}
          >
            {y}
          </Link>
        ))}
      </div>

      {!hasActivity ? (
        <Card tone="raised">
          <CardContent className="py-12 text-center text-text-muted">
            No recorded healthcare expenses for {selectedYear}.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {/* Hero totals */}
          <Card className="rounded-2xl shadow-sm border-2 border-accent/20">
            <CardContent className="pt-8 pb-8">
              <div className="text-center mb-6">
                <Eyebrow className="justify-center mb-2">Total out-of-pocket</Eyebrow>
                <p className="font-display text-4xl text-text tracking-tight">
                  {formatMoney(summary.totalPatientPaidCents)}
                </p>
                <p className="text-sm text-text-muted mt-2">
                  Across {summary.visitCount} visit{summary.visitCount !== 1 ? "s" : ""} in {selectedYear}
                </p>
              </div>
              <div className="grid grid-cols-3 gap-6 pt-6 border-t border-border">
                <Stat label="Total billed" value={formatMoney(summary.totalChargedCents)} />
                <Stat label="Patient responsibility" value={formatMoney(summary.totalPatientResponsibilityCents)} />
                <Stat label="Patient paid" value={formatMoney(summary.totalPatientPaidCents)} accent />
              </div>
            </CardContent>
          </Card>

          {/* Quarterly breakdown */}
          <Card className="rounded-2xl shadow-sm">
            <CardHeader>
              <CardTitle className="text-lg">Quarterly breakdown</CardTitle>
              <CardDescription>Out-of-pocket payments by quarter</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {summary.quarters.map((q) => (
                  <div key={q.label} className="flex items-center justify-between py-3 border-b border-border/50 last:border-0">
                    <div>
                      <p className="text-sm font-medium text-text">{q.label}</p>
                      <p className="text-xs text-text-muted">{q.count} payment{q.count !== 1 ? "s" : ""}</p>
                    </div>
                    <p className="text-base font-semibold text-text tabular-nums">
                      {formatMoney(q.amountCents)}
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
              <CardDescription>Individual visits and charges</CardDescription>
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
                        <th className="py-2 text-right">Patient cost</th>
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

          {/* Disclaimer */}
          <Card className="rounded-2xl shadow-sm border-l-4 border-l-amber-400/60 bg-amber-50/20">
            <CardContent className="py-5 px-5">
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-amber-700 mb-2">
                Tax information disclaimer
              </p>
              <div className="text-sm text-text-muted leading-relaxed space-y-2">
                <p>
                  This summary is informational only and is not tax advice. Medical expenses may be
                  deductible under IRS Publication 502 if they exceed 7.5% of adjusted gross income.
                </p>
                <p>
                  Cannabis-related medical expenses may not be deductible under federal tax law due to
                  the current federal scheduling status. Advise the patient to consult a qualified tax
                  professional.
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </PageShell>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="text-center">
      <p className="text-xs text-text-subtle uppercase tracking-wider mb-1">{label}</p>
      <p className={`text-lg font-semibold ${accent ? "text-accent" : "text-text"}`}>{value}</p>
    </div>
  );
}
