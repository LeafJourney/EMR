// ---------------------------------------------------------------------------
// Year-end tax summary (Dr. Patel directive — billing "Generate tax documents").
//
// A patient's out-of-pocket healthcare expenses for a calendar year, for IRS
// Pub 502 medical-expense substantiation. NOT a 1099/W9 (those are payer→
// contractor / vendor forms — the directive's wording was a mis-spec; the real
// artifact is this annual payment summary).
//
// `summarizeTaxData` is pure + dependency-free (unit-testable). The portal page
// and the clinician billing tab both render from this one source of truth.
// ---------------------------------------------------------------------------

import { prisma } from "@/lib/db/prisma";

export interface TaxSummaryPaymentInput {
  amountCents: number;
  paymentDateMs: number;
}

export interface TaxSummaryClaimInput {
  serviceDateMs: number | null;
  cptLabel: string;
  billedCents: number;
  patientRespCents: number;
}

export interface TaxQuarter {
  label: string;
  amountCents: number;
  count: number;
}

export interface TaxServiceRow {
  serviceDateMs: number | null;
  cptLabel: string;
  billedCents: number;
  patientRespCents: number;
}

export interface TaxSummary {
  year: number;
  totalPatientPaidCents: number;
  totalChargedCents: number;
  totalPatientResponsibilityCents: number;
  visitCount: number;
  quarters: TaxQuarter[];
  services: TaxServiceRow[];
}

const QUARTERS: { label: string; months: number[] }[] = [
  { label: "Q1 (Jan–Mar)", months: [0, 1, 2] },
  { label: "Q2 (Apr–Jun)", months: [3, 4, 5] },
  { label: "Q3 (Jul–Sep)", months: [6, 7, 8] },
  { label: "Q4 (Oct–Dec)", months: [9, 10, 11] },
];

/** Aggregate a year's patient payments + claims into the tax-summary shape. */
export function summarizeTaxData(
  year: number,
  payments: TaxSummaryPaymentInput[],
  claims: TaxSummaryClaimInput[],
): TaxSummary {
  const totalPatientPaidCents = payments.reduce((s, p) => s + p.amountCents, 0);
  const totalChargedCents = claims.reduce((s, c) => s + c.billedCents, 0);
  const totalPatientResponsibilityCents = claims.reduce(
    (s, c) => s + c.patientRespCents,
    0,
  );

  // Bucket payments by quarter using UTC months for deterministic results.
  const quarters: TaxQuarter[] = QUARTERS.map((q) => {
    const inQuarter = payments.filter((p) =>
      q.months.includes(new Date(p.paymentDateMs).getUTCMonth()),
    );
    return {
      label: q.label,
      amountCents: inQuarter.reduce((s, p) => s + p.amountCents, 0),
      count: inQuarter.length,
    };
  });

  const services: TaxServiceRow[] = [...claims]
    .sort((a, b) => (a.serviceDateMs ?? 0) - (b.serviceDateMs ?? 0))
    .map((c) => ({
      serviceDateMs: c.serviceDateMs,
      cptLabel: c.cptLabel,
      billedCents: c.billedCents,
      patientRespCents: c.patientRespCents,
    }));

  return {
    year,
    totalPatientPaidCents,
    totalChargedCents,
    totalPatientResponsibilityCents,
    visitCount: claims.length,
    quarters,
    services,
  };
}

function cptLabelOf(cptCodes: unknown): string {
  if (!Array.isArray(cptCodes) || cptCodes.length === 0) return "Office visit";
  const codes = cptCodes
    .map((c) =>
      typeof c === "string"
        ? c
        : c && typeof c === "object" && "code" in c
          ? String((c as { code: unknown }).code ?? "")
          : "",
    )
    .filter(Boolean);
  return codes.length > 0 ? codes.join(", ") : "Office visit";
}

/**
 * Load + aggregate a patient's year-end tax summary. Org scoping is the
 * caller's responsibility (verify the patient belongs to the caller's org
 * before calling).
 */
export async function getPatientTaxSummary(
  patientId: string,
  year: number,
): Promise<TaxSummary> {
  const start = new Date(Date.UTC(year, 0, 1, 0, 0, 0));
  const end = new Date(Date.UTC(year, 11, 31, 23, 59, 59));

  const [payments, claims] = await Promise.all([
    prisma.payment.findMany({
      where: {
        claim: { patientId },
        source: "patient",
        paymentDate: { gte: start, lte: end },
      },
      select: { amountCents: true, paymentDate: true },
    }),
    prisma.claim.findMany({
      where: { patientId, serviceDate: { gte: start, lte: end } },
      select: {
        serviceDate: true,
        cptCodes: true,
        billedAmountCents: true,
        patientRespCents: true,
      },
      orderBy: { serviceDate: "asc" },
    }),
  ]);

  return summarizeTaxData(
    year,
    payments.map((p) => ({
      amountCents: p.amountCents,
      paymentDateMs: p.paymentDate.getTime(),
    })),
    claims.map((c) => ({
      serviceDateMs: c.serviceDate ? c.serviceDate.getTime() : null,
      cptLabel: cptLabelOf(c.cptCodes),
      billedCents: c.billedAmountCents ?? 0,
      patientRespCents: c.patientRespCents ?? 0,
    })),
  );
}
