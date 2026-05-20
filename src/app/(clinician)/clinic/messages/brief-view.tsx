// EMR-708 — Morning Brief, rendered as the "brief" filter category of
// /clinic/messages. Lifted from the old `/clinic/morning-brief` route
// without semantic changes; the route there now redirects here.
//
// Data shape and copy match the previous Morning Brief page so this is
// a pure relocation — bookmarks deep-link to `?filter=brief` and the
// experience is unchanged.

import Link from "next/link";
import { prisma } from "@/lib/db/prisma";
import { requireUser } from "@/lib/auth/session";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EditorialRule, LeafSprig } from "@/components/ui/ornament";
import { formatRelative } from "@/lib/utils/format";
import {
  calculateNoShowRisk,
  type NoShowRiskFactors,
} from "@/lib/domain/clinical-intelligence";

interface BriefItem {
  id: string;
  category: "unsigned" | "noshow" | "message" | "intake" | "worsening" | "approval";
  title: string;
  detail: string;
  href: string;
  urgency: "high" | "medium" | "low";
}

export async function MorningBriefView() {
  const user = await requireUser();
  const orgId = user.organizationId!;

  const now = new Date();
  const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const endOfDay = new Date(today.getTime() + 86_400_000);

  const [
    unsignedNotes,
    noShows,
    oldMessages,
    incompleteIntake,
    pendingApprovals,
    todayEncounters,
    worseningPatients,
    todayScheduled,
  ] = await Promise.all([
    prisma.note.findMany({
      where: {
        status: { in: ["draft", "needs_review"] },
        encounter: { organizationId: orgId },
        updatedAt: { lt: today },
      },
      include: {
        encounter: { include: { patient: { select: { id: true, firstName: true, lastName: true } } } },
      },
      take: 10,
    }),

    prisma.encounter.findMany({
      where: {
        organizationId: orgId,
        status: "cancelled",
        scheduledFor: { gte: yesterday, lt: today },
      },
      include: { patient: { select: { id: true, firstName: true, lastName: true } } },
      take: 10,
    }),

    prisma.message.findMany({
      where: {
        status: "sent",
        senderAgent: null,
        createdAt: { lt: yesterday },
        thread: {
          patient: { organizationId: orgId },
          messages: { none: { senderAgent: { not: null }, createdAt: { gt: yesterday } } },
        },
      },
      include: {
        thread: { include: { patient: { select: { id: true, firstName: true, lastName: true } } } },
      },
      take: 10,
    }),

    prisma.encounter.findMany({
      where: {
        organizationId: orgId,
        status: "scheduled",
        scheduledFor: { gte: today, lt: endOfDay },
        patient: {
          chartSummary: { completenessScore: { lt: 70 } },
        },
      },
      include: {
        patient: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            chartSummary: { select: { completenessScore: true } },
          },
        },
      },
      take: 10,
    }),

    prisma.agentJob.count({
      where: { organizationId: orgId, status: "needs_approval" },
    }),

    prisma.encounter.count({
      where: { organizationId: orgId, scheduledFor: { gte: today, lt: endOfDay } },
    }),

    prisma.$queryRaw<Array<{ patientId: string; firstName: string; lastName: string; metric: string; oldAvg: number; newAvg: number }>>`
      SELECT DISTINCT ON (p.id)
        p.id as "patientId", p."firstName", p."lastName",
        ol.metric,
        AVG(CASE WHEN ol."loggedAt" < NOW() - INTERVAL '7 days' THEN ol.value END) as "oldAvg",
        AVG(CASE WHEN ol."loggedAt" >= NOW() - INTERVAL '7 days' THEN ol.value END) as "newAvg"
      FROM "OutcomeLog" ol
      JOIN "Patient" p ON p.id = ol."patientId"
      WHERE p."organizationId" = ${orgId}
        AND ol.metric IN ('pain', 'anxiety')
        AND ol."loggedAt" > NOW() - INTERVAL '14 days'
      GROUP BY p.id, p."firstName", p."lastName", ol.metric
      HAVING AVG(CASE WHEN ol."loggedAt" >= NOW() - INTERVAL '7 days' THEN ol.value END)
           - AVG(CASE WHEN ol."loggedAt" < NOW() - INTERVAL '7 days' THEN ol.value END) >= 2
      LIMIT 10
    `.catch(() => []),

    prisma.encounter.findMany({
      where: {
        organizationId: orgId,
        status: "scheduled",
        scheduledFor: { gte: today, lt: endOfDay },
      },
      include: {
        patient: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            encounters: {
              where: { scheduledFor: { lt: today } },
              orderBy: { scheduledFor: "desc" },
              select: { status: true, scheduledFor: true },
              take: 30,
            },
          },
        },
      },
      orderBy: { scheduledFor: "asc" },
    }),
  ]);

  const riskAppointments = todayScheduled
    .map((enc) => {
      const history = enc.patient.encounters;
      const priorNoShowCount = history.filter((h) => h.status === "cancelled").length;
      const lastVisit = history.find((h) => h.status === "complete");
      const daysSinceLastVisit = lastVisit?.scheduledFor
        ? Math.max(0, Math.floor((now.getTime() - lastVisit.scheduledFor.getTime()) / 86_400_000))
        : 365;
      const appointmentTypeIsNewPatient = history.length === 0;
      const hoursUntilAppointment = enc.scheduledFor
        ? Math.max(0, (enc.scheduledFor.getTime() - now.getTime()) / 3_600_000)
        : 0;
      const isTelehealthAppointment = enc.modality === "video" || enc.modality === "phone";
      const hasConfirmedAttendance = false;

      const factors: NoShowRiskFactors = {
        priorNoShowCount,
        daysSinceLastVisit,
        appointmentTypeIsNewPatient,
        hoursUntilAppointment,
        isTelehealthAppointment,
        hasConfirmedAttendance,
      };

      return {
        id: enc.id,
        patientId: enc.patient.id,
        patientName: `${enc.patient.firstName} ${enc.patient.lastName}`,
        scheduledFor: enc.scheduledFor,
        modality: enc.modality,
        risk: calculateNoShowRisk(factors),
      };
    })
    .filter((a) => a.risk.level !== "low")
    .sort((a, b) => b.risk.score - a.risk.score);

  const items: BriefItem[] = [];

  for (const note of unsignedNotes) {
    items.push({
      id: `note-${note.id}`,
      category: "unsigned",
      title: `Unsigned note for ${note.encounter.patient.firstName} ${note.encounter.patient.lastName}`,
      detail: `${note.status === "needs_review" ? "Needs review" : "Draft"} · updated ${formatRelative(note.updatedAt)}`,
      href: `/clinic/patients/${note.encounter.patient.id}/notes/${note.id}`,
      urgency: "high",
    });
  }

  for (const enc of noShows) {
    items.push({
      id: `noshow-${enc.id}`,
      category: "noshow",
      title: `${enc.patient.firstName} ${enc.patient.lastName} didn't show up yesterday`,
      detail: "Consider following up to reschedule",
      href: `/clinic/patients/${enc.patient.id}`,
      urgency: "medium",
    });
  }

  for (const msg of oldMessages) {
    items.push({
      id: `msg-${msg.id}`,
      category: "message",
      title: `Unanswered message from ${msg.thread.patient.firstName} ${msg.thread.patient.lastName}`,
      detail: `Sent ${formatRelative(msg.createdAt)} · waiting >24h`,
      href: `/clinic/patients/${msg.thread.patient.id}`,
      urgency: "high",
    });
  }

  for (const enc of incompleteIntake) {
    const score =
      (enc.patient as { chartSummary?: { completenessScore?: number } }).chartSummary
        ?.completenessScore ?? 0;
    items.push({
      id: `intake-${enc.id}`,
      category: "intake",
      title: `${enc.patient.firstName} ${enc.patient.lastName} has incomplete intake (${score}%)`,
      detail: `Appointment today · intake should be ≥70% before visit`,
      href: `/clinic/patients/${enc.patient.id}`,
      urgency: "medium",
    });
  }

  for (const wp of worseningPatients) {
    items.push({
      id: `worsen-${wp.patientId}-${wp.metric}`,
      category: "worsening",
      title: `${wp.firstName} ${wp.lastName}'s ${wp.metric} is worsening`,
      detail: `Average went from ${Number(wp.oldAvg).toFixed(1)} to ${Number(wp.newAvg).toFixed(1)} this week`,
      href: `/clinic/patients/${wp.patientId}`,
      urgency: "high",
    });
  }

  items.sort((a, b) => {
    const urgencyOrder = { high: 0, medium: 1, low: 2 };
    return urgencyOrder[a.urgency] - urgencyOrder[b.urgency];
  });

  const CATEGORY_EMOJI: Record<string, string> = {
    unsigned: "✍️",
    noshow: "❌",
    message: "💬",
    intake: "📋",
    worsening: "📉",
    approval: "✅",
  };

  const URGENCY_TONE: Record<string, "danger" | "warning" | "neutral"> = {
    high: "danger",
    medium: "warning",
    low: "neutral",
  };

  return (
    <>
      <div className="grid grid-cols-3 gap-3 mb-8">
        <Card tone="raised" className="text-center py-4">
          <p className="font-display text-3xl text-text tabular-nums">{todayEncounters}</p>
          <p className="text-xs text-text-muted mt-1">Patients today</p>
        </Card>
        <Card tone="raised" className="text-center py-4">
          <p className="font-display text-3xl text-text tabular-nums">{items.length}</p>
          <p className="text-xs text-text-muted mt-1">Items to review</p>
        </Card>
        <Card tone="raised" className="text-center py-4">
          <p className="font-display text-3xl text-text tabular-nums">{pendingApprovals}</p>
          <p className="text-xs text-text-muted mt-1">AI drafts waiting</p>
        </Card>
      </div>

      {riskAppointments.length > 0 && (
        <section className="mb-8">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-display text-lg text-text tracking-tight">
              High-risk appointments today
            </h2>
            <span className="text-xs text-text-subtle">
              {riskAppointments.length} flagged · auto-scored
            </span>
          </div>
          <div className="space-y-2">
            {riskAppointments.map((apt) => (
              <details
                key={apt.id}
                className="rounded-xl border border-border/80 bg-surface shadow-sm overflow-hidden group"
              >
                <summary className="flex items-center gap-3 px-4 py-3 cursor-pointer list-none">
                  <span className="text-lg shrink-0" aria-hidden="true">
                    {apt.risk.level === "high" ? "🔴" : "🟡"}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-text truncate">
                      {apt.patientName}
                    </p>
                    <p className="text-xs text-text-muted mt-0.5">
                      {apt.scheduledFor
                        ? apt.scheduledFor.toLocaleTimeString("en-US", {
                            hour: "numeric",
                            minute: "2-digit",
                          })
                        : "Time TBD"}{" "}
                      · {apt.modality}
                    </p>
                  </div>
                  <Badge tone={apt.risk.level === "high" ? "danger" : "warning"}>
                    {apt.risk.level} · {apt.risk.score}
                  </Badge>
                </summary>
                <div className="px-4 pb-4 pt-1 border-t border-border/60 bg-surface-muted/30 text-sm">
                  <p className="text-[11px] uppercase tracking-wider text-text-subtle mb-1.5">
                    Risk factors
                  </p>
                  <ul className="space-y-1 mb-3">
                    {apt.risk.factors.map((f, i) => (
                      <li key={i} className="text-xs text-text-muted">
                        · {f}
                      </li>
                    ))}
                  </ul>
                  <p className="text-[11px] uppercase tracking-wider text-text-subtle mb-1.5">
                    Recommendation
                  </p>
                  <p className="text-xs text-text-muted leading-relaxed mb-3">
                    {apt.risk.recommendation}
                  </p>
                  <div className="flex justify-end">
                    <Link href={`/clinic/patients/${apt.patientId}`}>
                      <Button size="sm" variant="secondary">
                        Open chart
                      </Button>
                    </Link>
                  </div>
                </div>
              </details>
            ))}
          </div>
        </section>
      )}

      {pendingApprovals > 0 && (
        <Link href="/clinic/approvals">
          <Card className="mb-6 border-l-4 border-l-accent card-hover cursor-pointer px-5 py-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <LeafSprig size={18} className="text-accent" />
                <p className="text-sm font-medium text-text">
                  {pendingApprovals} AI draft{pendingApprovals !== 1 ? "s" : ""} waiting for your review
                </p>
              </div>
              <Button size="sm">Review</Button>
            </div>
          </Card>
        </Link>
      )}

      <EditorialRule className="mb-6" />

      {items.length === 0 ? (
        <Card tone="ambient" className="text-center py-16">
          <CardContent>
            <LeafSprig size={32} className="text-accent mx-auto mb-4" />
            <h2 className="font-display text-2xl text-text tracking-tight mb-2">
              All clear.
            </h2>
            <p className="text-sm text-text-muted">
              Nothing flagged this morning. You&apos;re starting the day clean.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {items.map((item) => (
            <Link key={item.id} href={item.href}>
              <Card className="card-hover cursor-pointer">
                <CardContent className="py-3 px-4">
                  <div className="flex items-center gap-3">
                    <span className="text-lg shrink-0">{CATEGORY_EMOJI[item.category] ?? "📌"}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-text truncate">{item.title}</p>
                      <p className="text-xs text-text-muted mt-0.5">{item.detail}</p>
                    </div>
                    <Badge tone={URGENCY_TONE[item.urgency]}>{item.urgency}</Badge>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
