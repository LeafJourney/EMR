import Link from "next/link";
import { prisma } from "@/lib/db/prisma";
import { requireUser } from "@/lib/auth/session";
import { PageHeader, PageShell } from "@/components/shell/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { EXCLUDE_CALENDAR_BLOCK_PATIENT } from "@/lib/domain/calendar-block-patient";

export const dynamic = "force-dynamic";
export const metadata = { title: "Recalls" };

const THRESHOLDS = [90, 180, 365] as const;
const DAY_MS = 24 * 60 * 60 * 1000;

type Search = { since?: string };

/**
 * Recalls / outreach (Back-Office Operations Audit §6.5, EMR-1079). Surfaces
 * established patients who are overdue for a follow-up — no upcoming
 * appointment and a last visit older than the chosen window — so the back
 * office can pull them back in. /ops/recalls no longer 404s.
 *
 * First slice is the worklist + one-tap scheduling. Batch outreach through the
 * waitlist's staggered, quiet-hours-aware engine is a tracked follow-up.
 */
export default async function RecallsPage({
  searchParams,
}: {
  searchParams: Search;
}) {
  const user = await requireUser();
  const orgId = user.organizationId;
  if (!orgId) {
    return (
      <PageShell>
        <PageHeader
          eyebrow="Between visits"
          title="Recalls"
          description="No practice is associated with your account."
        />
      </PageShell>
    );
  }

  const sinceDays = (THRESHOLDS as readonly number[]).includes(
    Number(searchParams.since),
  )
    ? Number(searchParams.since)
    : 90;

  const now = Date.now();
  const cutoff = new Date(now - sinceDays * DAY_MS);

  // Active, real patients and their appointment timeline (just the dates).
  const patients = await prisma.patient.findMany({
    where: {
      organizationId: orgId,
      status: "active",
      deletedAt: null,
      ...EXCLUDE_CALENDAR_BLOCK_PATIENT,
    },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      appointments: {
        select: { startAt: true, status: true },
        orderBy: { startAt: "desc" },
      },
    },
    take: 1000,
  });

  // Overdue = no upcoming appointment AND a most-recent past visit older than
  // the window. (Brand-new patients with no past visit aren't "recalls" yet.)
  const overdue = patients
    .map((p) => {
      const hasUpcoming = p.appointments.some(
        (a) => a.startAt.getTime() >= now && a.status !== "cancelled",
      );
      const lastPast = p.appointments
        .filter((a) => a.startAt.getTime() < now && a.status !== "cancelled")
        .sort((a, b) => b.startAt.getTime() - a.startAt.getTime())[0];
      if (hasUpcoming || !lastPast) return null;
      if (lastPast.startAt.getTime() >= cutoff.getTime()) return null;
      const daysSince = Math.floor((now - lastPast.startAt.getTime()) / DAY_MS);
      return {
        id: p.id,
        name: `${p.firstName} ${p.lastName}`.trim(),
        lastVisit: lastPast.startAt,
        daysSince,
      };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null)
    .sort((a, b) => b.daysSince - a.daysSince);

  return (
    <PageShell maxWidth="max-w-[1000px]">
      <PageHeader
        eyebrow="Between visits"
        title="Recalls"
        description="Established patients with no upcoming visit and a lapsed last appointment. Pull them back in before they fall through the cracks."
      />

      <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-8">
        <StatCard label={`Overdue ${sinceDays}d+`} value={overdue.length} tone="warning" />
        <StatCard label="Active patients" value={patients.length} tone="muted" />
      </div>

      <div className="mb-6 flex flex-wrap items-center gap-2">
        <span className="text-[11px] font-medium uppercase tracking-wider text-text-subtle mr-1">
          Lapsed for
        </span>
        {THRESHOLDS.map((t) => (
          <Link
            key={t}
            href={t === 90 ? "/ops/recalls" : `/ops/recalls?since=${t}`}
            className={
              sinceDays === t
                ? "rounded-full border border-accent/50 bg-accent/10 px-3 py-1 text-xs font-medium text-accent"
                : "rounded-full border border-border px-3 py-1 text-xs font-medium text-text-muted hover:border-border-strong"
            }
          >
            {t} days
          </Link>
        ))}
      </div>

      {overdue.length === 0 ? (
        <EmptyState
          title="No recalls due"
          description="Every active patient has an upcoming visit or a recent one. Widen the window to look further back."
        />
      ) : (
        <div className="space-y-2">
          {overdue.map((p) => (
            <div
              key={p.id}
              className="flex items-center justify-between gap-3 rounded-lg border border-border/60 p-4"
            >
              <div className="min-w-0">
                <Link
                  href={`/clinic/patients/${p.id}`}
                  className="font-medium text-text hover:text-accent hover:underline"
                >
                  {p.name}
                </Link>
                <div className="mt-1 flex items-center gap-2 text-xs text-text-subtle">
                  <Badge tone="warning">{p.daysSince} days since last visit</Badge>
                  <span>
                    Last seen{" "}
                    {p.lastVisit.toLocaleDateString("en-US", {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                    })}
                  </span>
                </div>
              </div>
              <Link
                href={`/clinic/schedule?patientId=${p.id}`}
                className="shrink-0 rounded-md bg-surface-raised border border-border-strong/70 px-3 h-9 inline-flex items-center text-sm font-medium text-text hover:bg-surface-muted"
              >
                Schedule
              </Link>
            </div>
          ))}
        </div>
      )}
    </PageShell>
  );
}

function StatCard({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: number;
  tone?: "neutral" | "warning" | "muted";
}) {
  const colors = { neutral: "text-text", warning: "text-[color:var(--warning)]", muted: "text-text-muted" };
  return (
    <Card tone="raised">
      <CardContent className="pt-5 pb-5">
        <p className={`font-display text-3xl tabular-nums ${colors[tone]}`}>{value}</p>
        <p className="text-xs text-text-muted mt-1">{label}</p>
      </CardContent>
    </Card>
  );
}
