import { redirect } from "next/navigation";
import { prisma } from "@/lib/db/prisma";
import { requireUser } from "@/lib/auth/session";
import { hasPermission } from "@/lib/rbac/permissions";
import { EmptyState } from "@/components/ui/empty-state";
import { RefillsView, type RefillRow } from "./refills-view";
import { evaluateRefill } from "@/lib/agents/refill-copilot-agent";
import { logger } from "@/lib/observability/log";

export const metadata = { title: "Refill Queue" };

export default async function RefillsPage() {
  const user = await requireUser();

  // EMR-1111 (FO-B5) — the refill queue is clinical PHI; gate on
  // notes.read before any query runs.
  if (!hasPermission(user, "notes.read")) redirect("/clinic");

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

  // Evaluate any refills that haven't been scored yet.
  const toEvaluate = pending.filter((r) => !r.copilotSuggestion);
  if (toEvaluate.length > 0) {
    await Promise.all(
      toEvaluate.map((r) =>
        evaluateRefill(r.id).catch((err) => {
          logger.error({
            event: "clinic.refills.copilot_eval_failed",
            refillId: r.id,
            err,
          });
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
          select: { id: true, panelName: true, receivedAt: true },
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
        safetyFlags: Array.isArray(r.safetyFlags) ? (r.safetyFlags as string[]) : [],
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

  if (rows.length === 0) {
    return (
      <div className="flex items-center justify-center h-full p-12">
        <EmptyState
          title="Queue clear"
          description="Nothing to sign. New refill requests will appear here as they arrive."
        />
      </div>
    );
  }

  return <RefillsView rows={rows} />;
}
