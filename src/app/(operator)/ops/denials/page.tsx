import { prisma } from "@/lib/db/prisma";
import { requireUser } from "@/lib/auth/session";
import { PageShell, PageHeader } from "@/components/shell/PageHeader";
import { formatDate, formatRelative, formatMoney } from "@/lib/utils/format";
import {
  classifyDenial,
  NEXT_ACTION_LABEL,
} from "@/lib/billing/denials";
import { type TimelineEntry } from "./denials-client";
import {
  DenialsDashboard,
  type DenialRow,
  type CategoryStat,
  type PayerStat,
} from "./denials-dashboard";

export const metadata = { title: "Denials Command Center" };

const URGENCY_TONE: Record<"high" | "medium" | "low", "danger" | "warning" | "neutral"> = {
  high: "danger",
  medium: "warning",
  low: "neutral",
};

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default async function DenialsPage() {
  const user = await requireUser();
  const organizationId = user.organizationId!;

  const claims = await prisma.claim.findMany({
    where: {
      organizationId,
      status: { in: ["denied", "appealed"] },
    },
    include: {
      patient: { select: { id: true, firstName: true, lastName: true } },
      provider: {
        include: { user: { select: { firstName: true, lastName: true } } },
      },
      // EMR-985 — relations powering the per-claim audit timeline.
      denialEvents: {
        select: {
          id: true,
          resolution: true,
          resolvedAt: true,
          createdAt: true,
          carcCode: true,
        },
      },
      appealPackets: {
        select: {
          id: true,
          appealLevel: true,
          status: true,
          submittedAt: true,
          outcomeReceivedAt: true,
          createdAt: true,
        },
      },
      appealOutcomes: {
        select: {
          id: true,
          result: true,
          decisionDate: true,
          recoveredCents: true,
          createdAt: true,
        },
      },
      adjustments: {
        select: {
          id: true,
          type: true,
          amountCents: true,
          postedAt: true,
          createdAt: true,
        },
      },
      submissions: {
        select: {
          id: true,
          clearinghouseName: true,
          submittedAt: true,
          responseStatus: true,
          isSecondary: true,
        },
      },
    },
    orderBy: { deniedAt: "desc" },
    take: 100,
  });

  // Classify each denial + build a serialized audit timeline per claim.
  const triaged = claims.map((claim) => ({
    claim,
    triage: classifyDenial(claim.denialReason),
    timeline: buildTimeline(claim),
  }));

  // Hero stats
  const totalDenials = triaged.length;
  const totalDollars = triaged.reduce(
    (acc, t) => acc + t.claim.billedAmountCents,
    0,
  );
  const highUrgencyCount = triaged.filter(
    (t) => t.triage.urgency === "high",
  ).length;
  const recoveryTargetCents = Math.round(totalDollars * 0.6);

  // EMR-935 — aggregate actual recovered dollars from appeal outcomes.
  const recoveredCents = triaged.reduce(
    (acc, t) =>
      acc +
      t.claim.appealOutcomes.reduce((s, o) => s + (o.recoveredCents ?? 0), 0),
    0,
  );

  // Stats by category (count + dollars + carried plain-language description).
  const categoryAgg = new Map<
    string,
    { label: string; description: string; count: number; dollars: number }
  >();
  for (const t of triaged) {
    const key = t.triage.category;
    const existing =
      categoryAgg.get(key) ??
      { label: t.triage.label, description: t.triage.description, count: 0, dollars: 0 };
    existing.count += 1;
    existing.dollars += t.claim.billedAmountCents;
    categoryAgg.set(key, existing);
  }
  const categoryStats: CategoryStat[] = Array.from(categoryAgg.entries())
    .map(([category, v]) => ({ category, ...v }))
    .sort((a, b) => b.count - a.count);

  // Payer denial mix (count + dollars).
  const payerAgg = new Map<string, { count: number; dollars: number }>();
  for (const t of triaged) {
    if (!t.claim.payerName) continue;
    const existing = payerAgg.get(t.claim.payerName) ?? { count: 0, dollars: 0 };
    existing.count += 1;
    existing.dollars += t.claim.billedAmountCents;
    payerAgg.set(t.claim.payerName, existing);
  }
  const payerStats: PayerStat[] = Array.from(payerAgg.entries())
    .map(([payer, v]) => ({ payer, ...v }))
    .sort((a, b) => b.count - a.count);

  // Serialize worklist rows for the client island (no Date/Prisma objects).
  const rows: DenialRow[] = triaged.map(({ claim, triage, timeline }) => ({
    id: claim.id,
    urgency: triage.urgency,
    urgencyTone: URGENCY_TONE[triage.urgency],
    patientId: claim.patient.id,
    patientFirstName: claim.patient.firstName,
    patientLastName: claim.patient.lastName,
    serviceDateLabel: formatDate(claim.serviceDate),
    payerName: claim.payerName,
    claimNumber: claim.claimNumber,
    deniedRelative: claim.deniedAt ? formatRelative(claim.deniedAt) : null,
    billedLabel: formatMoney(claim.billedAmountCents),
    triageLabel: triage.label,
    triageCategory: triage.category,
    triageDescription: triage.description,
    denialReason: claim.denialReason,
    suggestedActionLabel: NEXT_ACTION_LABEL[triage.suggestedAction],
    timeline,
    category: triage.category,
    billedAmountCents: claim.billedAmountCents,
    deniedAtISO: claim.deniedAt ? claim.deniedAt.toISOString() : null,
  }));

  return (
    <PageShell maxWidth="max-w-[1320px]">
      <PageHeader
        eyebrow="Practice management"
        title="Denials command center"
        description="Every denied claim, classified and routed to a next action. Work the worklist top-down — the urgent ones are surfaced first."
      />

      <DenialsDashboard
        rows={rows}
        categoryStats={categoryStats}
        payerStats={payerStats}
        totalDenials={totalDenials}
        totalDollars={totalDollars}
        highUrgencyCount={highUrgencyCount}
        recoveryTargetCents={recoveryTargetCents}
        recoveredCents={recoveredCents}
      />
    </PageShell>
  );
}

// ---------------------------------------------------------------------------
// Timeline builder (EMR-985)
// ---------------------------------------------------------------------------

// Shape of the relations we select for the audit timeline. Kept local so the
// builder is decoupled from the full Prisma payload type.
type TimelineClaim = {
  deniedAt: Date | null;
  closedAt: Date | null;
  closureType: string | null;
  denialEvents: {
    resolution: string;
    resolvedAt: Date | null;
    createdAt: Date;
    carcCode: string;
  }[];
  appealPackets: {
    appealLevel: number;
    status: string;
    submittedAt: Date | null;
    outcomeReceivedAt: Date | null;
    createdAt: Date;
  }[];
  appealOutcomes: {
    result: string;
    decisionDate: Date | null;
    recoveredCents: number;
    createdAt: Date;
  }[];
  adjustments: {
    type: string;
    amountCents: number;
    postedAt: Date | null;
    createdAt: Date;
  }[];
  submissions: {
    clearinghouseName: string;
    submittedAt: Date;
    isSecondary: boolean;
  }[];
};

const DENIAL_RESOLUTION_LABEL: Record<string, string> = {
  pending: "Denial under review",
  corrected_and_resubmitted: "Corrected and resubmitted",
  appealed: "Appeal filed",
  written_off: "Written off",
  patient_responsibility: "Moved to patient responsibility",
  overturned: "Denial overturned — resolved",
  escalated: "Escalated for review",
};

const APPEAL_OUTCOME_LABEL: Record<string, string> = {
  pending: "Appeal decision pending",
  overturned: "Appeal overturned — denial reversed",
  upheld: "Appeal upheld — denial stands",
  partial: "Appeal partially overturned",
  withdrawn: "Appeal withdrawn",
  no_response: "Appeal — no payer response",
};

const ADJUSTMENT_TYPE_LABEL: Record<string, string> = {
  contractual: "Contractual adjustment posted",
  write_off: "Write-off posted",
  refund: "Refund posted",
  takeback: "Payer takeback posted",
  courtesy: "Courtesy adjustment posted",
};

// Build the per-claim audit trail: the denial anchor plus every dated step
// across submissions, appeals, outcomes, adjustments and denial-event
// resolutions, merged and sorted chronologically. All dates are serialized to
// ISO strings so the result is safe to pass to a client component.
function buildTimeline(claim: TimelineClaim): TimelineEntry[] {
  const entries: TimelineEntry[] = [];

  // Anchor: the denial itself. Always present even if deniedAt is null so the
  // timeline never renders empty.
  entries.push({
    label: "Denied",
    date: claim.deniedAt ? claim.deniedAt.toISOString() : null,
    kind: "denied",
  });

  // Resubmissions to the clearinghouse.
  for (const s of claim.submissions) {
    entries.push({
      label: s.isSecondary
        ? `Secondary claim submitted to ${s.clearinghouseName}`
        : `Resubmitted to ${s.clearinghouseName}`,
      date: s.submittedAt.toISOString(),
      kind: "submission",
    });
  }

  // Appeal packets — sent + corrections received.
  for (const a of claim.appealPackets) {
    if (a.submittedAt) {
      entries.push({
        label: `Appeal sent (level ${a.appealLevel})`,
        date: a.submittedAt.toISOString(),
        kind: "appeal",
      });
    }
    if (a.outcomeReceivedAt) {
      entries.push({
        label: "Corrections from insurer received",
        date: a.outcomeReceivedAt.toISOString(),
        kind: "insurer",
      });
    }
  }

  // Appeal outcomes (decision dates).
  for (const o of claim.appealOutcomes) {
    const when = o.decisionDate ?? null;
    if (when) {
      entries.push({
        label: APPEAL_OUTCOME_LABEL[o.result] ?? `Appeal ${o.result}`,
        date: when.toISOString(),
        kind: o.result === "overturned" || o.result === "partial"
          ? "resolved"
          : "outcome",
      });
    }
  }

  // Adjustments posted to the ledger.
  for (const adj of claim.adjustments) {
    const when = adj.postedAt ?? null;
    if (when) {
      entries.push({
        label: ADJUSTMENT_TYPE_LABEL[adj.type] ?? "Adjustment posted",
        date: when.toISOString(),
        kind: "adjustment",
      });
    }
  }

  // Denial-event resolutions — terminal/status changes on the denial.
  for (const e of claim.denialEvents) {
    if (e.resolution !== "pending" && e.resolvedAt) {
      const isTerminal =
        e.resolution === "overturned" ||
        e.resolution === "written_off" ||
        e.resolution === "patient_responsibility";
      entries.push({
        label:
          DENIAL_RESOLUTION_LABEL[e.resolution] ??
          `Resolved — ${e.resolution.replace(/_/g, " ")}`,
        date: e.resolvedAt.toISOString(),
        kind: isTerminal ? "resolved" : "revision",
      });
    }
  }

  // Claim closure as a final terminal marker if recorded.
  if (claim.closedAt) {
    const closure = (claim.closureType ?? "").replace(/_/g, " ");
    entries.push({
      label: closure ? `Claim closed — ${closure}` : "Claim closed",
      date: claim.closedAt.toISOString(),
      kind: "resolved",
    });
  }

  // Sort chronologically. The denial anchor (or any null-dated entry) sorts to
  // the front; everything else by ascending timestamp.
  entries.sort((a, b) => {
    if (a.date === null) return -1;
    if (b.date === null) return 1;
    return a.date.localeCompare(b.date);
  });

  return entries;
}
