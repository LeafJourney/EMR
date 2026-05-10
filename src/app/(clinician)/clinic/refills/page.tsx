import Link from "next/link";
import { prisma } from "@/lib/db/prisma";
import { requireUser } from "@/lib/auth/session";
import { PageHeader, PageShell } from "@/components/shell/PageHeader";
import { EmptyState } from "@/components/ui/empty-state";
import { RefillsView, type RefillRow } from "./refills-view";
import { evaluateRefill } from "@/lib/agents/refill-copilot-agent";
import { logger } from "@/lib/observability/log";

export const metadata = { title: "Refill Queue" };

// MALLIK-007 — Refill Queue
//
// Landing page for pending refill requests. Each request is evaluated by
// the Refill Copilot on first load if it hasn't been already — that way the
// physician always sees a suggestion + safety flags without having to click
// through. The evaluation is deterministic and cheap, so running it on
// pageload is fine at Phase 1 demo scale. We persist the result on the
// RefillRequest row so subsequent loads skip re-evaluation.

export default async function RefillsPage() {
  const user = await requireUser();
  const organizationId = user.organizationId!;

  const pending = await prisma.refillRequest.findMany({
    where: {
      organizationId,
      status: { in: ["new", "flagged"] },
      signedAt: null,
    },
    orderBy: { receivedAt: "asc" },
    include: {
      patient: { select: { id: true, firstName: true, lastName: true } },
      medication: true,
      lastRelevantLab: {
        select: { id: true, panelName: true, receivedAt: true, results: true },
      },
    },
  });

  // Evaluate any refills that haven't been scored yet. Fire-and-forget
  // from the physician's perspective — we await so the first paint already
  // has suggestions, but each call is a handful of queries.
  const toEvaluate = pending.filter((r) => !r.copilotSuggestion);
  if (toEvaluate.length > 0) {
    await Promise.all(
      toEvaluate.map((r) =>
        evaluateRefill(r.id).catch((err) => {
          logger.error({ event: "clinic.refills.copilot_eval_failed", refillId: r.id, err });
        })
      )
    );
  }

  // Re-read after evaluation so the UI has the freshest copilot output.
  const rows: RefillRow[] = await prisma.refillRequest
    .findMany({
      where: {
        organizationId,
        status: { in: ["new", "flagged"] },
        signedAt: null,
      },
      orderBy: [{ status: "desc" }, { receivedAt: "asc" }],
      include: {
        patient: { select: { id: true, firstName: true, lastName: true } },
        medication: true,
        lastRelevantLab: {
          select: {
            id: true,
            panelName: true,
            receivedAt: true,
          },
        },
      },
    })
    .then((refills) =>
      refills.map((r) => ({
        id: r.id,
        patientId: r.patient.id,
        patientFirstName: r.patient.firstName,
        patientLastName: r.patient.lastName,
        medicationName: r.medication.name,
        medicationDosage: r.medication.dosage ?? "",
        medicationType: r.medication.type,
        requestedQty: r.requestedQty,
        requestedDays: r.requestedDays,
        pharmacyName: r.pharmacyName,
        pharmacyPhone: r.pharmacyPhone,
        pharmacyAddress: r.pharmacyAddress,
        receivedAt: r.receivedAt.toISOString(),
        status: r.status,
        copilotSuggestion: r.copilotSuggestion,
        safetyFlags: Array.isArray(r.safetyFlags)
          ? (r.safetyFlags as string[])
          : [],
        rationale: r.rationale,
        lastRelevantLab: r.lastRelevantLab
          ? {
              id: r.lastRelevantLab.id,
              panelName: r.lastRelevantLab.panelName,
              receivedAt: r.lastRelevantLab.receivedAt.toISOString(),
            }
          : null,
      }))
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
        title="Refill Queue"
        description={
          rows.length === 0
            ? "No refills waiting."
            : `${rows.length} refill${rows.length === 1 ? "" : "s"} waiting for review. Copilot flags high-risk items first; routine ones are ready to approve.`
        }
      />

      {rows.length === 0 ? (
        <EmptyState
          title="Queue clear"
          description="Nothing to sign. New refill requests will appear here as they arrive."
        />
      ) : (
        <RefillsView rows={rows} />
      )}
    </PageShell>
  );
}
