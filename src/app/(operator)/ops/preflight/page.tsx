import { prisma } from "@/lib/db/prisma";
import { requireUser } from "@/lib/auth/session";
import { PageShell, PageHeader } from "@/components/shell/PageHeader";
import { formatDate, formatMoney } from "@/lib/utils/format";
import {
  runPreflight,
  PAYER_WINDOW_DAYS,
  type ClaimOutcomeRow,
} from "@/lib/billing/preflight";
import {
  PREFLIGHT_CANDIDATE_STATUSES,
  collectHighlightTerms,
  displayCode,
  groupPayerHistory,
  payerKey,
  pickEncounterNarrative,
  splitNarrativeForEvidence,
  toPreflightClaim,
} from "./helpers";
import {
  PreflightWorklist,
  type PreflightRow,
  type PreflightTile,
} from "./preflight-worklist";

// EMR-1139 — Pre-Flight Claims Dashboard (red-text spec, RCM Phases 5–6).
export const metadata = { title: "Pre-Flight" };

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default async function PreflightPage() {
  const user = await requireUser();
  const organizationId = user.organizationId!;
  const asOf = new Date();

  // Pre-submission claims (drafts in coding + "ready" awaiting submission)
  // — the population the pre-flight gate evaluates before the EDI 837
  // compiler ever sees them. Same org-scoped access pattern as /ops/scrub.
  const claims = await prisma.claim.findMany({
    where: {
      organizationId,
      status: { in: [...PREFLIGHT_CANDIDATE_STATUSES] },
    },
    select: {
      id: true,
      claimNumber: true,
      status: true,
      payerName: true,
      payerId: true,
      providerId: true,
      serviceDate: true,
      billedAmountCents: true,
      cptCodes: true,
      icd10Codes: true,
      patient: { select: { id: true, firstName: true, lastName: true } },
      encounter: {
        select: {
          notes: {
            select: { status: true, narrative: true, blocks: true, updatedAt: true },
            orderBy: { updatedAt: "desc" },
            take: 5,
          },
        },
      },
    },
    orderBy: { serviceDate: "desc" },
    take: 50,
  });

  // One adjudicated-outcomes query for the whole page (engine contract:
  // the caller feeds payerHistory; querying per claim would be N+1).
  // Rolling 180-day window over paid/denied/partial decisions, grouped by
  // payer so each claim's run only sees its own payer's rows.
  const cutoff = new Date(asOf.getTime() - PAYER_WINDOW_DAYS * 86_400_000);
  const adjudicated = await prisma.claim.findMany({
    where: {
      organizationId,
      status: { in: ["paid", "denied", "partial"] },
      OR: [{ paidAt: { gte: cutoff } }, { deniedAt: { gte: cutoff } }],
    },
    select: {
      payerName: true,
      payerId: true,
      status: true,
      cptCodes: true,
      paidAt: true,
      deniedAt: true,
    },
    take: 2000,
  });
  const historyByPayer = groupPayerHistory(adjudicated);
  const EMPTY_HISTORY: ClaimOutcomeRow[] = [];

  // Run the pre-flight engine on every candidate, server-side.
  const rows: PreflightRow[] = claims.map((claim) => {
    const preflightClaim = toPreflightClaim(claim);
    const narrativeNote = pickEncounterNarrative(claim.encounter?.notes ?? []);
    const result = runPreflight(
      preflightClaim,
      { narrativeNote, providerId: claim.providerId },
      {
        asOf,
        payerHistory:
          historyByPayer.get(payerKey(claim.payerName) ?? "") ?? EMPTY_HISTORY,
      },
    );

    // Context-aware evidence: the note split into sentences with the
    // engine-relevant phrases (Mod-25 evidence, LCD keywords) marked.
    const cptCodes = preflightClaim.serviceLines.map((l) => l.code);
    const highlightTerms = collectHighlightTerms(result.findings, cptCodes);
    const evidence = splitNarrativeForEvidence(narrativeNote, highlightTerms);

    return {
      id: claim.id,
      claimNumber: claim.claimNumber,
      status: claim.status,
      patientId: claim.patient.id,
      patientName: `${claim.patient.firstName} ${claim.patient.lastName}`,
      payerName: claim.payerName,
      serviceDateLabel: formatDate(claim.serviceDate),
      billedLabel: formatMoney(claim.billedAmountCents),
      billedAmountCents: claim.billedAmountCents,
      cptDisplay: preflightClaim.serviceLines.map(displayCode),
      icdDisplay: preflightClaim.icd10Codes.map((i) => i.code),
      score: result.score.score,
      disposition: result.score.disposition,
      findings: result.findings,
      evidence,
      payerSampleSize: result.features.details.payerHistory.sampleSize,
    };
  });

  // Highest risk first — staff work the worklist top-down.
  rows.sort((a, b) => b.score - a.score);

  const holds = rows.filter((r) => r.disposition === "hold");
  const reviews = rows.filter((r) => r.disposition === "review");
  const releases = rows.filter((r) => r.disposition === "release");
  const dollarsHeld = holds.reduce((acc, r) => acc + r.billedAmountCents, 0);

  const tiles: PreflightTile[] = [
    { label: "In pre-flight", value: rows.length.toString(), tone: "neutral" },
    {
      label: "Held",
      value: holds.length.toString(),
      tone: "danger",
      hint: holds.length > 0 ? `${formatMoney(dollarsHeld)} held` : undefined,
    },
    { label: "Needs review", value: reviews.length.toString(), tone: "warning" },
    {
      label: "Green — clear to submit",
      value: releases.length.toString(),
      tone: "success",
    },
  ];

  return (
    <PageShell maxWidth="max-w-[1320px]">
      <PageHeader
        eyebrow="Practice management"
        title="Pre-Flight"
        description="Every claim is scored for denial risk before it reaches the EDI 837 compiler. Held claims show exactly why — with the note evidence inline — and most fixes are one click."
      />

      <PreflightWorklist rows={rows} tiles={tiles} />
    </PageShell>
  );
}
