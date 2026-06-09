// EMR-1078 (Back-Office Operations Audit §6.4) — patient-responsibility
// balance aggregation for the front-desk payments surface.
//
// Pure + dependency-free so the money math is unit-testable without a DB.
// "Patient owes" = sum of patient-responsibility on their claims minus what
// the patient has already paid against those claims. Insurance/adjustment
// payments don't reduce the patient's share.

export interface ClaimForBalance {
  patientId: string;
  patientFirstName: string;
  patientLastName: string;
  patientRespCents: number;
  payments: Array<{ source: string; amountCents: number }>;
}

export interface PatientBalance {
  patientId: string;
  patientName: string;
  owedCents: number;
}

/**
 * Collapse claims into per-patient outstanding balances. Patients whose
 * patient-responsibility is fully paid (or net-negative from overpayment) are
 * dropped. Returned most-owed first.
 */
export function aggregateOutstandingBalances(
  claims: ClaimForBalance[],
): PatientBalance[] {
  const byPatient = new Map<string, PatientBalance>();

  for (const claim of claims) {
    const patientPaid = claim.payments
      .filter((p) => p.source === "patient")
      .reduce((sum, p) => sum + p.amountCents, 0);
    const claimOwed = claim.patientRespCents - patientPaid;

    const existing = byPatient.get(claim.patientId);
    if (existing) {
      existing.owedCents += claimOwed;
    } else {
      byPatient.set(claim.patientId, {
        patientId: claim.patientId,
        patientName: `${claim.patientFirstName} ${claim.patientLastName}`.trim(),
        owedCents: claimOwed,
      });
    }
  }

  return [...byPatient.values()]
    .filter((b) => b.owedCents > 0)
    .sort((a, b) => b.owedCents - a.owedCents);
}
