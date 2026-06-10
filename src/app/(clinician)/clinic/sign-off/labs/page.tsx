import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db/prisma";
import { requireUser } from "@/lib/auth/session";
import { hasPermission } from "@/lib/rbac/permissions";
import { PageHeader, PageShell } from "@/components/shell/PageHeader";
import { EmptyState } from "@/components/ui/empty-state";
import { LabsReviewView, type LabRow } from "./labs-review-view";

export const metadata = { title: "Lab Review" };

// MALLIK-006 — Physician Lab Review Queue
//
// Landing page for labs awaiting physician review. Loads the pending queue
// (unsigned) for the clinician's org, plus the prior same-panel result for
// each row so the overlay can render current-vs-prior without another
// round-trip. Rendering (queue list + overlay + draft preview) lives in the
// client component `labs-review-view.tsx`.

export default async function LabsReviewPage() {
  const user = await requireUser();

  // EMR-1111 (FO-B5) — the lab review queue is clinical PHI; gate on
  // notes.read before any query runs.
  if (!hasPermission(user, "notes.read")) redirect("/clinic");

  const organizationId = user.organizationId!;

  const pending = await prisma.labResult.findMany({
    where: { organizationId, signedAt: null },
    orderBy: { receivedAt: "desc" },
    include: {
      patient: { select: { id: true, firstName: true, lastName: true } },
      outreach: true,
    },
  });

  // For each pending lab, fetch the most recent prior result of the same
  // panel. One query per lab is fine at Phase 1 demo scale; batch if the
  // queue ever grows to hundreds.
  const rows: LabRow[] = await Promise.all(
    pending.map(async (lab) => {
      const priors = await prisma.labResult.findMany({
        where: {
          patientId: lab.patientId,
          panelName: lab.panelName,
          id: { not: lab.id },
          receivedAt: { lt: lab.receivedAt },
        },
        orderBy: { receivedAt: "desc" },
        take: 4,
        select: { id: true, receivedAt: true, results: true },
      });
      const prior = priors[0] ?? null;
      return {
        id: lab.id,
        patientId: lab.patient.id,
        patientFirstName: lab.patient.firstName,
        patientLastName: lab.patient.lastName,
        panelName: lab.panelName,
        receivedAt: lab.receivedAt.toISOString(),
        abnormalFlag: lab.abnormalFlag,
        results: lab.results as Record<string, unknown>,
        prior: prior
          ? {
              id: prior.id,
              receivedAt: prior.receivedAt.toISOString(),
              results: prior.results as Record<string, unknown>,
            }
          : null,
        history: priors.map((p) => ({
          receivedAt: p.receivedAt.toISOString(),
          results: p.results as Record<string, unknown>,
        })),
        outreach: lab.outreach
          ? {
              id: lab.outreach.id,
              patientDraft: lab.outreach.patientDraft,
              maDraft: lab.outreach.maDraft,
              physicianNote: lab.outreach.physicianNote,
              status: lab.outreach.status,
            }
          : null,
      };
    })
  );

  return (
    <PageShell maxWidth="max-w-[1080px]">
      <Link
        href="/clinic"
        className="text-sm text-accent hover:underline mb-4 inline-block"
      >
        &larr; Back to Command
      </Link>

      <PageHeader
        eyebrow="Mission Control"
        title="Lab Review"
        description={
          rows.length === 0
            ? "No labs waiting for your signature."
            : `${rows.length} lab${rows.length === 1 ? "" : "s"} waiting for review. Click a row to compare current vs. prior values, draft patient outreach, and sign.`
        }
      />

      {rows.length === 0 ? (
        <EmptyState
          title="Queue clear"
          description="Nothing to review. New labs will appear here as they arrive."
        />
      ) : (
        <LabsReviewView rows={rows} />
      )}
    </PageShell>
  );
}
