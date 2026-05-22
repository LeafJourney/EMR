import { prisma } from "@/lib/db/prisma";
import { requireUser } from "@/lib/auth/session";
import { SignOffTreeView, type SignOffRow } from "./sign-off-tree-view";

export const metadata = { title: "Sign-Off Queue" };

export default async function SignOffPage() {
  const user = await requireUser();
  const orgId = user.organizationId!;

  const [labs, refills, notes, messages] = await Promise.all([
    prisma.labResult.findMany({
      where: { organizationId: orgId, signedAt: null },
      orderBy: { receivedAt: "desc" },
      include: { patient: { select: { id: true, firstName: true, lastName: true } } },
      take: 50,
    }),
    prisma.refillRequest.findMany({
      where: {
        organizationId: orgId,
        signedAt: null,
        status: { in: ["new", "flagged"] },
      },
      orderBy: { receivedAt: "desc" },
      include: {
        patient: { select: { id: true, firstName: true, lastName: true } },
        medication: { select: { name: true, dosage: true } },
      },
      take: 50,
    }),
    prisma.note.findMany({
      where: {
        status: "needs_review",
        encounter: { patient: { organizationId: orgId } },
      },
      orderBy: { updatedAt: "desc" },
      include: {
        encounter: {
          include: {
            patient: { select: { id: true, firstName: true, lastName: true } },
          },
        },
      },
      take: 50,
    }),
    prisma.message.findMany({
      where: {
        status: "draft",
        aiDrafted: true,
        thread: { patient: { organizationId: orgId } },
      },
      orderBy: { createdAt: "desc" },
      include: {
        thread: {
          include: {
            patient: { select: { id: true, firstName: true, lastName: true } },
          },
        },
      },
      take: 50,
    }),
  ]);

  const urgRank = { high: 0, normal: 1, low: 2 } as const;

  const rows: SignOffRow[] = [
    ...labs.map<SignOffRow>((l) => ({
      id: `lab-${l.id}`,
      kind: "lab",
      title: l.panelName,
      patientName: `${l.patient.firstName} ${l.patient.lastName}`,
      patientId: l.patient.id,
      receivedAt: l.receivedAt.toISOString(),
      urgency: l.abnormalFlag ? "high" : "normal",
      hint: l.abnormalFlag ? "Abnormal — review and route" : "Within reference range",
      href: `/clinic/sign-off/labs`,
    })),
    ...refills.map<SignOffRow>((r) => ({
      id: `refill-${r.id}`,
      kind: "refill",
      title: `${r.medication.name}${r.medication.dosage ? ` · ${r.medication.dosage}` : ""}`,
      patientName: `${r.patient.firstName} ${r.patient.lastName}`,
      patientId: r.patient.id,
      receivedAt: r.receivedAt.toISOString(),
      urgency:
        r.status === "flagged" ? "high" : r.copilotSuggestion === "review" ? "normal" : "low",
      hint: r.rationale ?? `Qty ${r.requestedQty} · ${r.pharmacyName}`,
      href: `/clinic/sign-off/refills`,
    })),
    ...notes.map<SignOffRow>((n) => ({
      id: `note-${n.id}`,
      kind: "note",
      title: "AI-drafted clinic note",
      patientName: `${n.encounter.patient.firstName} ${n.encounter.patient.lastName}`,
      patientId: n.encounter.patient.id,
      receivedAt: n.updatedAt.toISOString(),
      urgency: (n.aiConfidence ?? 1) < 0.6 ? "high" : "normal",
      hint:
        (n.aiConfidence ?? 1) < 0.6
          ? `Low confidence (${Math.round((n.aiConfidence ?? 0) * 100)}%) — verify before signing`
          : `Confidence ${Math.round((n.aiConfidence ?? 1) * 100)}%`,
      href: `/clinic/patients/${n.encounter.patient.id}/notes/${n.id}`,
    })),
    ...messages.map<SignOffRow>((m) => ({
      id: `msg-${m.id}`,
      kind: "message",
      title: m.thread.subject,
      patientName: `${m.thread.patient.firstName} ${m.thread.patient.lastName}`,
      patientId: m.thread.patient.id,
      receivedAt: m.createdAt.toISOString(),
      urgency:
        m.thread.triageUrgency === "emergency" || m.thread.triageUrgency === "high"
          ? "high"
          : "normal",
      hint: m.thread.triageSummary ?? "AI-drafted reply awaiting review",
      href: `/clinic/sign-off/messages`,
    })),
  ];

  rows.sort((a, b) => {
    const u = urgRank[a.urgency] - urgRank[b.urgency];
    if (u !== 0) return u;
    return new Date(a.receivedAt).getTime() - new Date(b.receivedAt).getTime();
  });

  return <SignOffTreeView rows={rows} />;
}
