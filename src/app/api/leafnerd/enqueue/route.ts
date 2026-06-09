import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";

/**
 * Leafnerd demo: enqueue a REAL governed AgentJob from a UI action.
 *
 * Created in `needs_approval` status (the worker only claims `pending`, so this
 * never auto-executes) — authentically demonstrating the governed posture:
 * AI recommends → job queued → human approves. Scoped to the demo org and an
 * allowlisted set of action kinds so the UI can't create arbitrary jobs.
 */
const DEMO_ORG_SLUG = "leafnerd-demo";

const ACTION_MAP: Record<string, { workflowName: string; agentName: string }> = {
  quality: { workflowName: "patient-outreach", agentName: "patientOutreach" },
  risk: { workflowName: "adherence-drift-check", agentName: "adherenceDriftDetector" },
  data: { workflowName: "source-anomaly-investigation", agentName: "anomalyInvestigator" },
  mapping: { workflowName: "terminology-remap", agentName: "mappingAssistant" },
  identity: { workflowName: "identity-resolution", agentName: "mpiResolver" },
};

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as {
      kind?: string;
      label?: string;
      count?: number;
    };
    const kind = body.kind && ACTION_MAP[body.kind] ? body.kind : "quality";
    const map = ACTION_MAP[kind];
    const label = typeof body.label === "string" ? body.label.slice(0, 240) : "Queued governed action";
    const count = typeof body.count === "number" ? body.count : null;

    const org = await prisma.organization
      .findUnique({ where: { slug: DEMO_ORG_SLUG }, select: { id: true } })
      .catch(() => null);

    const job = await prisma.agentJob.create({
      data: {
        organizationId: org?.id ?? undefined,
        workflowName: map.workflowName,
        agentName: map.agentName,
        eventName: `leafnerd.action:${kind}`,
        input: { label, count, source: "leafnerd-ui" },
        status: "needs_approval",
        requiresApproval: true,
        approvalRequiredAt: new Date(),
      },
      select: { id: true, workflowName: true, agentName: true, status: true },
    });

    return NextResponse.json({
      ok: true,
      job,
      message: "Queued for human approval — governed action, autonomy off.",
    });
  } catch {
    return NextResponse.json({ ok: false, message: "Could not enqueue job." }, { status: 200 });
  }
}
