import { prisma } from "@/lib/db/prisma";
import { requireUser } from "@/lib/auth/session";
import { PageShell, PageHeader } from "@/components/shell/PageHeader";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  scrubClaim,
  countBySeverity,
  isClaimSubmittable,
} from "@/lib/billing/scrub";
import { formatMoney } from "@/lib/domain/billing";
import {
  ScrubWorkbench,
  type SerializedScrubClaim,
  type HistoricalClaim,
} from "./scrub-workbench";

export const metadata = { title: "Claim Scrub Workbench" };

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
  const topIssues = Object.entries(ruleCounts)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 5);

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
    { key: "clean" as const, label: "Clean & ready", value: cleanClaims.toString(), tone: "success" as const },
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
      <PageHeader
        eyebrow="Practice management"
        title="Claim scrub workbench"
        description="Every claim is checked against payer + coding rules. Plain language issues, structured detail, suggested fixes."
      />

      <ScrubWorkbench
        scrubbed={serializedScrubbed}
        historical={historical}
        tiles={tiles}
        defaultSectionTitle="Claims requiring review"
      >
        {/* Top issues — server-rendered, slotted between tiles and the list */}
        {topIssues.length > 0 && (
          <Card tone="raised" className="mb-8">
            <CardHeader>
              <CardTitle className="text-base">Top issues this week</CardTitle>
              <CardDescription>
                Fixing root causes upstream prevents these from coming back.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {topIssues.map(([ruleCode, count]) => (
                  <div
                    key={ruleCode}
                    className="flex items-center justify-between"
                  >
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-[10px] text-text-subtle">
                        {ruleCode}
                      </span>
                      <span className="text-sm text-text">
                        {humanizeRuleCode(ruleCode)}
                      </span>
                    </div>
                    <Badge tone="warning">{count} occurrences</Badge>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </ScrubWorkbench>
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
