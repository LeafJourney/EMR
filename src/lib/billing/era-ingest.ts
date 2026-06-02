/**
 * ERA / 835 ingestion orchestrator  (EMR-221)
 * --------------------------------------------------------------
 * Persistence layer over the pure parser in `era-parser.ts`. Takes a
 * raw 835 payload from the clearinghouse poller (or a manual upload),
 * dedupes against prior deliveries, parses it, and posts an
 * `AdjudicationResult` per claim plus PLB ledger entries.
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
    for (const claim of parsed.claimPayments) {
      const internalClaim = await resolveClaim(tx, input.organizationId, claim.claimControlNumber, claim.payerClaimId);
      if (!internalClaim) {
        claimsUnmatched++;
        continue;
      }
      await tx.adjudicationResult.create({
        data: {
          claimId: internalClaim.id,
          eraFileId: eraFile.id,
          eraDate: parsed.checkDate,
          checkNumber: parsed.checkNumber,
          totalPaidCents: claim.totalPaidCents,
          totalAllowedCents: computeAllowed(claim),
          totalAdjustedCents: sumAdjustments(claim),
          totalPatientRespCents: claim.patientRespCents,
          claimStatus: mapClpStatus(claim.claimStatusCode),
          lineDetails: claim.serviceLines as unknown as Prisma.InputJsonValue,
          rawEra: input.rawPayload,
        },
      });
      await tx.claim.update({
        where: { id: internalClaim.id },
        data: {
          paidAmountCents: { increment: claim.totalPaidCents },
          patientRespCents: { increment: claim.patientRespCents },
        },
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

    return { eraFileId: eraFile.id, claimsAdjudicated, claimsUnmatched, plbAdjustmentsCount };
  });

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
  // NOTE: when the 835 echoes only the payer's own claim id (CLP07) and not
  // our control number, there is no reliable key to match on — the schema
  // doesn't persist the payer claim id. We intentionally DO NOT fall back to
  // an arbitrary adjudication row (the prior behavior), which posted the
  // payment to a random claim. Leave it unmatched so it surfaces in
  // `claimsUnmatched` for manual posting instead of corrupting a ledger.
  void payerClaimId;
  return null;
}

function computeAllowed(c: Era835ClaimPayment): number {
  const adj = sumAdjustments(c);
  return Math.max(0, c.totalPaidCents + c.patientRespCents + adj);
}

function sumAdjustments(c: Era835ClaimPayment): number {
  let total = 0;
  for (const a of c.claimAdjustments) total += Math.abs(a.amountCents);
  for (const line of c.serviceLines) {
    for (const a of line.adjustments) total += Math.abs(a.amountCents);
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
