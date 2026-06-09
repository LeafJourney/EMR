import { prisma } from "@/lib/db/prisma";
import { requireUser } from "@/lib/auth/session";
import { PageShell, PageHeader } from "@/components/shell/PageHeader";
import { ChargeCapturePipeline } from "./charge-capture-pipeline";
import {
  scrubClaim,
  countBySeverity,
  isClaimSubmittable,
} from "@/lib/billing/scrub";
import { formatMoney } from "@/lib/domain/billing";
import { listPortalAdapters } from "@/lib/billing/prior-auth-adapters";
import {
  ScrubWorkbench,
  type SerializedScrubClaim,
  type HistoricalClaim,
  type TopIssue,
  type PaEngineOption,
} from "./scrub-workbench";

// EMR-944 — page renamed to "Scrub and Auths" (in-scope: header + metadata).
export const metadata = { title: "Scrub and Auths" };

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default async function ScrubWorkbenchPage() {
  const user = await requireUser();
  const organizationId = user.organizationId!;

  // Pull claims that haven't been submitted yet (draft + held) so we can
  // run the scrub on them and surface issues to billers.
  const claims = await prisma.claim.findMany({
    where: {
      organizationId,
      status: { in: ["draft", "submitted"] },
    },
    include: {
      patient: { select: { id: true, firstName: true, lastName: true } },
      provider: { select: { id: true } },
    },
    orderBy: { serviceDate: "desc" },
    take: 50,
  });

  // Coverage lookup for eligibility checks
  const patientIds = claims.map((c) => c.patientId);
  const coverages = await prisma.patientCoverage.findMany({
    where: { patientId: { in: patientIds }, type: "primary", active: true },
  });
  const coverageMap = Object.fromEntries(
    coverages.map((c) => [c.patientId, c]),
  );

  // Run the scrub engine on every claim
  const scrubbed = claims.map((claim) => {
    const issues = scrubClaim({
      cptCodes: claim.cptCodes as any,
      icd10Codes: claim.icd10Codes as any,
      payerName: claim.payerName,
      serviceDate: claim.serviceDate,
      providerId: claim.providerId,
      patientCoverage: coverageMap[claim.patientId]
        ? {
            eligibilityStatus: coverageMap[claim.patientId].eligibilityStatus,
            payerName: coverageMap[claim.patientId].payerName,
          }
        : null,
    });
    return {
      claim,
      issues,
      counts: countBySeverity(issues),
      submittable: isClaimSubmittable(issues),
    };
  });

  // Stats
  const totalClaims = scrubbed.length;
  const cleanClaims = scrubbed.filter((s) => s.issues.length === 0).length;
  const blockedClaims = scrubbed.filter((s) => !s.submittable).length;
  const totalErrors = scrubbed.reduce((acc, s) => acc + s.counts.error, 0);
  const totalWarnings = scrubbed.reduce((acc, s) => acc + s.counts.warning, 0);
  const totalDollarsHeld = scrubbed
    .filter((s) => !s.submittable)
    .reduce((acc, s) => acc + s.claim.billedAmountCents, 0);

  // Group by primary issue category
  const ruleCounts: Record<string, number> = {};
  for (const s of scrubbed) {
    for (const i of s.issues) {
      ruleCounts[i.ruleCode] = (ruleCounts[i.ruleCode] ?? 0) + 1;
    }
  }
  // EMR-979 — serialize "top issues this week" for the interactive client
  // shell. The bubbles become buttons that filter the review list.
  const topIssues: TopIssue[] = Object.entries(ruleCounts)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 5)
    .map(([ruleCode, count]) => ({
      ruleCode,
      count,
      label: humanizeRuleCode(ruleCode),
    }));

  // EMR-952 — engine/plug-in options for the Prior Authorization hub, sourced
  // from the adapter registry so the 4 new engines auto-appear.
  const paEngines: PaEngineOption[] = listPortalAdapters().map((a) => ({
    id: a.id,
    displayName: a.displayName,
    supportedPayers: [...a.supportedPayers],
  }));

  // ── EMR-975 — wider historical / chronological set for the search modal.
  // Org-scoped, bounded at 200, across every lifecycle status so staff can
  // search the full claims-management history (not just the scrub queue).
  const historyRows = await prisma.claim.findMany({
    where: { organizationId },
    include: {
      patient: { select: { id: true, firstName: true, lastName: true } },
    },
    orderBy: { serviceDate: "desc" },
    take: 200,
  });

  const historical: HistoricalClaim[] = historyRows.map((c) => {
    const cptCodes = ((c.cptCodes as any[]) ?? [])
      .map((x) => x?.code)
      .filter(Boolean) as string[];
    const reason =
      c.status === "denied" && c.denialReason
        ? `Denied: ${c.denialReason}`
        : c.status === "draft"
          ? "In scrub queue — pending review"
          : c.status === "submitted"
            ? "Submitted to payer"
            : c.status === "paid"
              ? "Paid"
              : `Status: ${c.status}`;
    return {
      id: c.id,
      claimNumber: c.claimNumber,
      status: c.status,
      serviceDateIso: c.serviceDate.toISOString(),
      payerName: c.payerName,
      billedAmountCents: c.billedAmountCents,
      patientName: `${c.patient.firstName} ${c.patient.lastName}`,
      patientId: c.patient.id,
      cptCodes,
      reason,
    };
  });

  // ── EMR-968 — serialize the scrub queue for the interactive client shell.
  const serializedScrubbed: SerializedScrubClaim[] = scrubbed.map(
    ({ claim, issues, counts, submittable }) => ({
      id: claim.id,
      claimNumber: claim.claimNumber,
      status: claim.status,
      serviceDateIso: claim.serviceDate.toISOString(),
      payerName: claim.payerName,
      billedAmountCents: claim.billedAmountCents,
      patient: {
        id: claim.patient.id,
        firstName: claim.patient.firstName,
        lastName: claim.patient.lastName,
      },
      cptCodes: ((claim.cptCodes as any[]) ?? []).map((c) => ({
        code: c.code,
      })),
      icd10Codes: ((claim.icd10Codes as any[]) ?? []).map((c) => ({
        code: c.code,
      })),
      issues,
      counts,
      submittable,
    }),
  );

  const tiles = [
    { key: "queue" as const, label: "Claims in queue", value: totalClaims.toString(), tone: "neutral" as const },
    { key: "clean" as const, label: "Reviewed and ready", value: cleanClaims.toString(), tone: "success" as const },
    {
      key: "blocked" as const,
      label: "Blocked",
      value: blockedClaims.toString(),
      tone: "danger" as const,
      hint: blockedClaims > 0 ? formatMoney(totalDollarsHeld) + " held" : undefined,
    },
    { key: "errors" as const, label: "Errors", value: totalErrors.toString(), tone: "danger" as const },
    { key: "warnings" as const, label: "Warnings", value: totalWarnings.toString(), tone: "warning" as const },
  ];

  return (
    <PageShell maxWidth="max-w-[1320px]">
      {/* EMR-944 — page renamed to "Scrub and Auths". */}
      <PageHeader
        eyebrow="Practice management"
        title="Scrub and Auths"
        description="Every claim is checked against payer + coding rules. Plain language issues, structured detail, suggested fixes. Submit prior authorizations from one hub."
      />

      {/* EMR-1080 — charge capture → submission funnel so staff see the
          hand-off from a signed note's codes into a scrubbed, submitted claim. */}
      <ChargeCapturePipeline organizationId={organizationId} />

      {/* EMR-979 — "Top issues this week" now lives inside the client shell so
          its count bubbles can filter the review list. */}
      <ScrubWorkbench
        scrubbed={serializedScrubbed}
        historical={historical}
        tiles={tiles}
        topIssues={topIssues}
        paEngines={paEngines}
        defaultSectionTitle="Claims requiring review"
      />
    </PageShell>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function humanizeRuleCode(code: string): string {
  return code
    .toLowerCase()
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}
