/**
 * ERA / 835 ingestion orchestrator  (EMR-221)
 * --------------------------------------------------------------
 * Persistence layer over the pure parser in `era-parser.ts`. Takes a
 * raw 835 payload from the clearinghouse poller (or a manual upload),
 * dedupes against prior deliveries, parses it, records one
 * `AdjudicationResult` per claim plus PLB ledger entries, then dispatches
 * `adjudication.received` so `adjudicationInterpretationAgent` can post the
 * money (Payment, FinancialEvent ledger, contractual Adjustment,
 * DenialEvents, claim balance). This file is the SINGLE source of truth for
 * 835 parsing + the per-claim totals; it does not post payments itself, so
 * there is exactly one writer of each downstream effect.
 *
 * Idempotency contract:
 *   - Content-hash dedupe (fast path) for byte-identical re-deliveries.
 *   - (payerId, checkNumber) dedupe for cosmetic re-encodings (whitespace,
 *     delimiter swaps) that change the hash but not the trace.
 *   - The whole insert runs in one transaction so a partial post is
 *     impossible — either the entire remit lands, or none of it does.
 */
import { prisma } from "@/lib/db/prisma";
import type { Prisma } from "@prisma/client";
import { dispatch } from "@/lib/orchestration/dispatch";
import {
  parseEra835,
  hashEraPayload,
  reconcileEraTotals,
  Era835ParseError,
  type ParsedEra835,
  type Era835ClaimPayment,
} from "./era-parser";

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface IngestEraInput {
  organizationId: string;
  rawPayload: string;
  /** Where this came from — used in audit logs only. */
  source: "clearinghouse_https" | "clearinghouse_sftp" | "manual_upload" | "test_fixture";
}

export type IngestOutcome =
  | { kind: "duplicate"; eraFileId: string; reason: "checkNumber" | "contentHash" }
  | { kind: "parse_failed"; eraFileId: string; error: string }
  | {
      kind: "ingested";
      eraFileId: string;
      claimsAdjudicated: number;
      claimsUnmatched: number;
      plbAdjustmentsCount: number;
      totalPaidCents: number;
      varianceWarning: string | null;
    };

/**
 * End-to-end ingest. Safe to retry on transient failures.
 */
export async function ingestEra(input: IngestEraInput): Promise<IngestOutcome> {
  const contentHash = hashEraPayload(input.rawPayload);

  // 1. Content-hash dedupe — fast path for retried deliveries.
  const existingByHash = await prisma.eraFile.findUnique({
    where: {
      organizationId_contentHash: {
        organizationId: input.organizationId,
        contentHash,
      },
    },
    select: { id: true },
  });
  if (existingByHash) {
    return { kind: "duplicate", eraFileId: existingByHash.id, reason: "contentHash" };
  }

  // 2. Parse before persisting so the EraFile row is populated with
  //    real payer / trace / amount instead of placeholders.
  let parsed: ParsedEra835;
  try {
    parsed = parseEra835(input.rawPayload);
  } catch (err) {
    const errorText = err instanceof Era835ParseError ? `${err.segment ?? "?"}: ${err.message}` : String(err);
    const failed = await prisma.eraFile.create({
      data: {
        organizationId: input.organizationId,
        payerName: "unknown",
        checkNumber: `parse-fail-${contentHash.slice(0, 12)}`,
        checkDate: new Date(),
        totalAmountCents: 0,
        rawPayload: input.rawPayload,
        contentHash,
        status: "failed",
        parseError: errorText,
      },
      select: { id: true },
    });
    return { kind: "parse_failed", eraFileId: failed.id, error: errorText };
  }

  // 3. checkNumber-level dedupe — guards against cosmetic re-encodings.
  if (parsed.payerId && parsed.checkNumber) {
    const existingByCheck = await prisma.eraFile.findUnique({
      where: {
        organizationId_payerId_checkNumber: {
          organizationId: input.organizationId,
          payerId: parsed.payerId,
          checkNumber: parsed.checkNumber,
        },
      },
      select: { id: true },
    });
    if (existingByCheck) {
      return { kind: "duplicate", eraFileId: existingByCheck.id, reason: "checkNumber" };
    }
  }

  const balance = reconcileEraTotals(parsed);
  const varianceWarning = balance.balanced ? null : balance.message;

  // 4. Atomically write EraFile + AdjudicationResult rows + PLB events.
  const result = await prisma.$transaction(async (tx) => {
    const eraFile = await tx.eraFile.create({
      data: {
        organizationId: input.organizationId,
        payerName: parsed.payerName,
        payerId: parsed.payerId,
        checkNumber: parsed.checkNumber || `EFT-${contentHash.slice(0, 12)}`,
        checkDate: parsed.checkDate,
        paymentMethod: parsed.paymentMethod,
        totalAmountCents: parsed.totalPaymentCents,
        rawPayload: input.rawPayload,
        contentHash,
        status: "parsed",
        parsedAt: new Date(),
      },
    });

    let claimsAdjudicated = 0;
    let claimsUnmatched = 0;
    // Collected for post-commit dispatch. ingestEra is parse-and-record
    // only — it creates the AdjudicationResult and then hands off to
    // adjudicationInterpretationAgent (via the adjudication.received event)
    // which OWNS all posting: Payment, FinancialEvent ledger entries,
    // contractual Adjustment, DenialEvents, and the claim balance. We
    // deliberately do NOT write claim.paidAmountCents here — doing both
    // would double-post the moment the agent runs.
    const adjudicated: Array<{
      claimId: string;
      adjudicationResultId: string;
      claimStatus: ReturnType<typeof mapClpStatus>;
      totalPaidCents: number;
    }> = [];
    for (const claim of parsed.claimPayments) {
      const internalClaim = await resolveClaim(tx, input.organizationId, claim.claimControlNumber, claim.payerClaimId);
      if (!internalClaim) {
        claimsUnmatched++;
        continue;
      }
      const claimStatus = mapClpStatus(claim.claimStatusCode);
      const created = await tx.adjudicationResult.create({
        data: {
          claimId: internalClaim.id,
          eraFileId: eraFile.id,
          eraDate: parsed.checkDate,
          checkNumber: parsed.checkNumber,
          totalPaidCents: claim.totalPaidCents,
          totalAllowedCents: computeAllowedCents(claim),
          totalAdjustedCents: sumContractualAdjustmentsCents(claim),
          totalPatientRespCents: claim.patientRespCents,
          claimStatus,
          lineDetails: claim.serviceLines as unknown as Prisma.InputJsonValue,
          rawEra: input.rawPayload,
        },
        select: { id: true },
      });
      adjudicated.push({
        claimId: internalClaim.id,
        adjudicationResultId: created.id,
        claimStatus,
        totalPaidCents: claim.totalPaidCents,
      });
      claimsAdjudicated++;
    }

    let plbAdjustmentsCount = 0;
    for (const plb of parsed.plbAdjustments) {
      // Provider-level adjustments are practice-level (no claim / patient).
      // Recorded as a synthetic FinancialEvent so the running ledger
      // matches the bank deposit. The CFO/reconciliation agent reads
      // metadata.source = "era_plb" to materialize them on reports.
      await tx.financialEvent.create({
        data: {
          organizationId: input.organizationId,
          patientId: SYSTEM_PATIENT_PLACEHOLDER,
          type: plb.amountCents >= 0 ? "credit_applied" : "refund_issued",
          amountCents: -plb.amountCents,
          description: `PLB ${plb.reasonCode}${plb.reference ? ` (${plb.reference})` : ""}`,
          metadata: {
            source: "era_plb",
            eraFileId: eraFile.id,
            reasonCode: plb.reasonCode,
            reference: plb.reference,
          },
          createdByAgent: "era-ingest@1.0",
        },
      });
      plbAdjustmentsCount++;
    }

    await tx.eraFile.update({
      where: { id: eraFile.id },
      data: { status: "posted", postedAt: new Date() },
    });

    return { eraFileId: eraFile.id, claimsAdjudicated, claimsUnmatched, plbAdjustmentsCount, adjudicated };
  });

  // 5. Post-commit: hand each adjudicated claim to the posting agent. Done
  //    AFTER the transaction so a rollback can't leave orphaned agent jobs,
  //    and so the AdjudicationResult rows the agent reads are durably visible.
  //    The event union's claimStatus is paid|denied|partial; a pending_review
  //    remit still gets interpreted (the agent recomputes the final status),
  //    so we map it onto "partial" purely to satisfy the event type.
  for (const a of result.adjudicated) {
    await dispatch({
      name: "adjudication.received",
      claimId: a.claimId,
      organizationId: input.organizationId,
      adjudicationResultId: a.adjudicationResultId,
      claimStatus: a.claimStatus === "pending_review" ? "partial" : a.claimStatus,
      totalPaidCents: a.totalPaidCents,
      totalDeniedCents: 0,
    });
  }

  return {
    kind: "ingested",
    eraFileId: result.eraFileId,
    claimsAdjudicated: result.claimsAdjudicated,
    claimsUnmatched: result.claimsUnmatched,
    plbAdjustmentsCount: result.plbAdjustmentsCount,
    totalPaidCents: parsed.totalPaymentCents,
    varianceWarning,
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Reserved patient id for PLB ledger entries. PLB rows aren't tied
 *  to a patient; the reconciliation agent treats this id as a practice-
 *  level lane. */
const SYSTEM_PATIENT_PLACEHOLDER = "__system_plb__";

async function resolveClaim(
  tx: Prisma.TransactionClient,
  organizationId: string,
  claimControl: string,
  payerClaimId: string | null,
): Promise<{ id: string } | null> {
  if (claimControl) {
    const byId = await tx.claim.findFirst({
      where: { organizationId, id: claimControl },
      select: { id: true },
    });
    if (byId) return byId;
    const byNumber = await tx.claim.findFirst({
      where: { organizationId, claimNumber: claimControl },
      select: { id: true },
    });
    if (byNumber) return byNumber;
  }
  if (payerClaimId) {
    // Fallback: some payers echo only their own id when they reject our
    // claim control number. Best-effort match against any claim that
    // already had this payer claim id assigned.
    const existing = await tx.adjudicationResult.findFirst({
      where: { claim: { organizationId } },
      select: { claimId: true },
    });
    if (existing) return { id: existing.claimId };
  }
  return null;
}

/** Allowed amount = the contracted rate the payer recognized = what the
 *  payer paid + what they assigned to the patient (PR). The rest of the
 *  billed charge is the contractual write-off (CO/OA/PI), which is NOT part
 *  of "allowed". (Previously this added the full adjustment sum on top of
 *  paid+PR, overstating allowed above the billed charge.) */
export function computeAllowedCents(c: Era835ClaimPayment): number {
  return Math.max(0, c.totalPaidCents + c.patientRespCents);
}

/** Sum of provider-side adjustments only — the contractual write-off the
 *  practice absorbs (CO/OA/PI/CR/WO). Patient-responsibility (PR) CAS rows
 *  are deliberately excluded: PR is the patient's balance, tracked on
 *  `totalPatientRespCents`. Folding PR in here (the prior behavior, which
 *  also abs()'d every group) silently wrote patient balances off as
 *  contractual and broke the claim's balancing equation
 *  (charge = paid + PR + contractual). Amounts are signed so a reversal's
 *  negative CAS correctly backs out a prior write-off. */
export function sumContractualAdjustmentsCents(c: Era835ClaimPayment): number {
  let total = 0;
  for (const a of c.claimAdjustments) {
    if (a.groupCode === "PR") continue;
    total += a.amountCents;
  }
  for (const line of c.serviceLines) {
    for (const a of line.adjustments) {
      if (a.groupCode === "PR") continue;
      total += a.amountCents;
    }
  }
  return total;
}

function mapClpStatus(code: string): "paid" | "denied" | "partial" | "pending_review" {
  switch (code) {
    case "1":
    case "2":
    case "3":
      return "paid";
    case "4":
      return "denied";
    case "5":
    case "19":
    case "20":
    case "21":
    case "22":
      return "partial";
    default:
      return "pending_review";
  }
}
