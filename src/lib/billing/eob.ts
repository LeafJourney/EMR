/**
 * EOB Parsing + Surfacing (EMR-115)
 * ---------------------------------
 * When a payer EOB lands (835 ERA or PDF), we need to:
 *   1. Parse it into a normalized shape that both the patient portal
 *      and the doctor's chart view can consume.
 *   2. Generate an AI-ready summary input (plain-language template +
 *      structured facts) that the LLM can fill without inventing
 *      numbers.
 *   3. Surface it to the patient portal billing tab AND the chart's
 *      claims drawer with the same source of truth.
 *
 * The parser handles two inputs:
 *   - 835 ERA segments — re-uses `remittance.ts` taxonomy for CARC /
 *     RARC semantics (PR vs CO vs OA vs PI).
 *   - Free-text EOB body — for paper / fax EOBs scanned by the
 *     patient. Lower-confidence; the agent flags fields it couldn't
 *     extract instead of guessing.
 *
 * The plain-language template is structured so the LLM can only
 * substitute the facts we computed deterministically — no
 * hallucinated dollar amounts.
 */

import {
  GROUP_CODE_SEMANTICS,
  type GroupCode,
  type PatientRespBucket,
} from "@/lib/billing/remittance";

export interface EobLine {
  cptCode: string;
  description: string;
  billedCents: number;
  allowedCents: number;
  paidCents: number;
  adjustmentsCents: number;
  patientRespByBucket: Partial<Record<PatientRespBucket, number>>;
  reasonCodes: Array<{
    groupCode: GroupCode;
    carc: string;
    rarc?: string;
    amountCents: number;
  }>;
}

export interface ParsedEob {
  payerName: string;
  payerClaimNumber: string;
  claimId: string | null;
  checkOrEftNumber: string | null;
  paidDate: string;
  totals: {
    billedCents: number;
    allowedCents: number;
    paidCents: number;
    patientRespCents: number;
    contractualAdjustmentCents: number;
  };
  lines: EobLine[];
  unmatchedLines: Array<{ rawText: string; reason: string }>;
  fromFreeText: boolean;
}

export interface Era835ClaimSegment {
  payerClaimNumber: string;
  patientControlNumber: string;
  cptLines: Array<{
    cptCode: string;
    description?: string;
    billedCents: number;
    allowedCents: number;
    paidCents: number;
    adjustments: Array<{
      groupCode: GroupCode;
      carc: string;
      rarc?: string;
      amountCents: number;
    }>;
  }>;
}

export interface Era835Header {
  payerName: string;
  paidDate: string;
  checkOrEftNumber: string | null;
}

/**
 * Build our normalized patient-facing EOB shape from ALREADY-segmented 835
 * data (header + one claim segment). NOTE: this is NOT the raw-835 parser —
 * that is `parseEra835` in era-parser.ts, which takes a raw X12 string and is
 * the single source of truth for ingestion. This one is display-only. Named
 * distinctly to avoid the prior `parseEra835`/`parseEra835` collision.
 */
export function buildEobFromEra835(
  header: Era835Header,
  claim: Era835ClaimSegment,
  matchedClaimId: string | null,
): ParsedEob {
  const lines: EobLine[] = claim.cptLines.map((line) => {
    const patientRespByBucket: Partial<Record<PatientRespBucket, number>> = {};
    for (const adj of line.adjustments) {
      if (adj.groupCode !== "PR") continue;
      const bucket = bucketForCarc(adj.carc);
      patientRespByBucket[bucket] = (patientRespByBucket[bucket] ?? 0) + adj.amountCents;
    }
    return {
      cptCode: line.cptCode,
      description: line.description ?? line.cptCode,
      billedCents: line.billedCents,
      allowedCents: line.allowedCents,
      paidCents: line.paidCents,
      adjustmentsCents: line.adjustments.reduce((sum, a) => sum + a.amountCents, 0),
      patientRespByBucket,
      reasonCodes: line.adjustments,
    };
  });

  const totals = lines.reduce(
    (acc, line) => {
      acc.billedCents += line.billedCents;
      acc.allowedCents += line.allowedCents;
      acc.paidCents += line.paidCents;
      for (const groupCode of Object.keys(GROUP_CODE_SEMANTICS) as GroupCode[]) {
        const lineSum = line.reasonCodes
          .filter((r) => r.groupCode === groupCode)
          .reduce((sum, r) => sum + r.amountCents, 0);
        if (groupCode === "PR") acc.patientRespCents += lineSum;
        if (groupCode === "CO") acc.contractualAdjustmentCents += lineSum;
      }
      return acc;
    },
    {
      billedCents: 0,
      allowedCents: 0,
      paidCents: 0,
      patientRespCents: 0,
      contractualAdjustmentCents: 0,
    },
  );

  return {
    payerName: header.payerName,
    payerClaimNumber: claim.payerClaimNumber,
    claimId: matchedClaimId,
    checkOrEftNumber: header.checkOrEftNumber,
    paidDate: header.paidDate,
    totals,
    lines,
    unmatchedLines: [],
    fromFreeText: false,
  };
}

/** Heuristic free-text parser for a paper EOB. Conservative — flags
 * "couldn't parse" rather than booking wrong numbers. */
export function parseFreeTextEob(rawText: string): ParsedEob {
  const payerName =
    /^\s*(?:from|payer)[:\s]+(.+)$/im.exec(rawText)?.[1]?.trim() ?? "Unknown payer";
  const payerClaimNumber =
    /(?:claim\s*(?:number|#))[:\s]+([A-Z0-9-]+)/i.exec(rawText)?.[1] ?? "";
  const paidDate = /(?:paid\s*(?:date|on))[:\s]+([0-9/.-]+)/i.exec(rawText)?.[1] ?? "";
  const checkOrEftNumber =
    /(?:check|eft)\s*#[:\s]*([A-Z0-9-]+)/i.exec(rawText)?.[1] ?? null;

  const billed = matchMoney(rawText, /total\s+billed[:\s]+\$?([\d,.]+)/i);
  const allowed = matchMoney(rawText, /total\s+allowed[:\s]+\$?([\d,.]+)/i);
  const paid = matchMoney(rawText, /total\s+paid[:\s]+\$?([\d,.]+)/i);
  const pr = matchMoney(rawText, /patient\s+responsibility[:\s]+\$?([\d,.]+)/i);
  const co = matchMoney(rawText, /(?:contractual|adjustment)[:\s]+\$?([\d,.]+)/i);

  return {
    payerName,
    payerClaimNumber,
    claimId: null,
    checkOrEftNumber,
    paidDate,
    totals: {
      billedCents: billed,
      allowedCents: allowed,
      paidCents: paid,
      patientRespCents: pr,
      contractualAdjustmentCents: co,
    },
    lines: [],
    unmatchedLines: [
      {
        rawText: rawText.slice(0, 400),
        reason: "Free-text EOB — line items require human review.",
      },
    ],
    fromFreeText: true,
  };
}

function matchMoney(text: string, re: RegExp): number {
  const m = re.exec(text);
  if (!m) return 0;
  const n = parseFloat(m[1].replace(/,/g, ""));
  if (!isFinite(n)) return 0;
  return Math.round(n * 100);
}

const CARC_BUCKET: Record<string, PatientRespBucket> = {
  "1": "deductible",
  "2": "coinsurance",
  "3": "copay",
  "96": "non_covered",
  "204": "non_covered",
  "23": "prior_payer_paid",
};

function bucketForCarc(carc: string): PatientRespBucket {
  return CARC_BUCKET[carc] ?? "other";
}

export interface PlainLanguageSummaryInput {
  payerName: string;
  serviceDate: string;
  totals: ParsedEob["totals"];
  topReasons: Array<{ carc: string; amountCents: number; bucket: PatientRespBucket | "other" }>;
}

/**
 * Build a structured prompt the AI summarizer fills in. The numbers
 * are passed in as facts the model MUST reproduce verbatim — the
 * prompt explicitly forbids adjusting them.
 */
export function buildSummaryPrompt(input: PlainLanguageSummaryInput): string {
  const fmt = (cents: number) => `$${(cents / 100).toFixed(2)}`;
  return [
    `You are explaining a medical bill summary to a patient.`,
    `Use ONLY the numbers below. Do not change them or invent new ones.`,
    `Tone: friendly, plain language, 4–6 sentences.`,
    ``,
    `Payer: ${input.payerName}`,
    `Date of service: ${input.serviceDate}`,
    `Total billed: ${fmt(input.totals.billedCents)}`,
    `Insurance allowed amount: ${fmt(input.totals.allowedCents)}`,
    `Insurance paid: ${fmt(input.totals.paidCents)}`,
    `Contractual adjustment (insurance discount): ${fmt(input.totals.contractualAdjustmentCents)}`,
    `Your responsibility: ${fmt(input.totals.patientRespCents)}`,
    ``,
    `Reasons for your responsibility:`,
    ...input.topReasons.map((r) => `  - CARC ${r.carc} (${r.bucket}): ${fmt(r.amountCents)}`),
  ].join("\n");
}

export function topPatientRespReasons(
  eob: ParsedEob,
  n = 3,
): PlainLanguageSummaryInput["topReasons"] {
  const byCarc = new Map<string, { amountCents: number; bucket: PatientRespBucket | "other" }>();
  for (const line of eob.lines) {
    for (const r of line.reasonCodes) {
      if (r.groupCode !== "PR") continue;
      const bucket = bucketForCarc(r.carc);
      const cur = byCarc.get(r.carc) ?? { amountCents: 0, bucket };
      cur.amountCents += r.amountCents;
      byCarc.set(r.carc, cur);
    }
  }
  return Array.from(byCarc.entries())
    .map(([carc, v]) => ({ carc, amountCents: v.amountCents, bucket: v.bucket }))
    .sort((a, b) => b.amountCents - a.amountCents)
    .slice(0, n);
}
