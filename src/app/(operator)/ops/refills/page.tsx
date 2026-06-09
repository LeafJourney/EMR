import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { requireUser } from "@/lib/auth/session";
import { PageHeader, PageShell } from "@/components/shell/PageHeader";
import { Card, CardContent } from "@/components/ui/card";
import { canManageTeam } from "@/lib/rbac/team-management";
import { RefillsBoard, type RefillRow } from "./refills-board";

export const dynamic = "force-dynamic";
export const metadata = { title: "Refills" };

type View = "open" | "all" | "signed";
type Search = { view?: string };

/**
 * Refill queue — staff side (Back-Office Operations Audit §6.5, EMR-1079).
 * Routes incoming refill requests to a provider. The clinical approve/sign
 * step lives in the provider sign-off queue (/clinic/sign-off/refills); this
 * surface gives the back office visibility + a one-tap "flag for provider".
 * /ops/refills no longer 404s.
 */
export default async function RefillsPage({
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
          title="Refills"
          description="No practice is associated with your account."
        />
      </PageShell>
    );
  }

  const view: View =
    searchParams.view === "all" || searchParams.view === "signed"
      ? searchParams.view
      : "open";

  const statusWhere: Prisma.RefillRequestWhereInput =
    view === "all"
      ? {}
      : view === "signed"
        ? { status: { in: ["approved", "sent", "denied"] } }
        : { status: { in: ["new", "flagged"] } };

  const [refills, newCount, flaggedCount] = await Promise.all([
    prisma.refillRequest.findMany({
      where: { organizationId: orgId, ...statusWhere },
      orderBy: [{ status: "asc" }, { receivedAt: "asc" }],
      take: 200,
      include: {
        patient: { select: { id: true, firstName: true, lastName: true } },
        medication: { select: { name: true, dosage: true } },
      },
    }),
    prisma.refillRequest.count({ where: { organizationId: orgId, status: "new" } }),
    prisma.refillRequest.count({
      where: { organizationId: orgId, status: "flagged" },
    }),
  ]);

  const rows: RefillRow[] = refills.map((r) => ({
    id: r.id,
    patientId: r.patient.id,
    patientName: `${r.patient.firstName} ${r.patient.lastName}`.trim(),
    medicationName: r.medication.name,
    medicationDosage: r.medication.dosage ?? null,
    requestedQty: r.requestedQty,
    requestedDays: r.requestedDays,
    pharmacyName: r.pharmacyName,
    status: r.status,
    copilotSuggestion: r.copilotSuggestion,
    rationale: r.rationale,
    safetyFlags: Array.isArray(r.safetyFlags) ? (r.safetyFlags as string[]) : [],
    receivedAt: r.receivedAt.toISOString(),
  }));

  const canManage =
    canManageTeam(user.roles) ||
    user.roles.some((role) => role === "operator" || role === "front_office" || role === "back_office");

  return (
    <PageShell maxWidth="max-w-[1100px]">
      <PageHeader
        eyebrow="Between visits"
        title="Refills"
        description="Incoming refill requests. Route them to a provider — the clinical approve & sign step lives in the provider sign-off queue."
        actions={
          <Link
            href="/clinic/sign-off/refills"
            className="rounded-md bg-surface-raised border border-border-strong/70 px-4 h-10 inline-flex items-center text-sm font-medium text-text hover:bg-surface-muted"
          >
            Provider sign-off →
          </Link>
        }
      />

      <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-8">
        <StatCard label="New" value={newCount} tone="accent" />
        <StatCard label="Flagged for provider" value={flaggedCount} tone="warning" />
        <StatCard label="Showing" value={rows.length} tone="muted" />
      </div>

      <div className="mb-6 flex flex-wrap items-center gap-2">
        {(
          [
            { key: "open", label: "Open" },
            { key: "signed", label: "Resolved" },
            { key: "all", label: "All" },
          ] as Array<{ key: View; label: string }>
        ).map((opt) => (
          <Link
            key={opt.key}
            href={opt.key === "open" ? "/ops/refills" : `/ops/refills?view=${opt.key}`}
            className={
              view === opt.key
                ? "rounded-full border border-accent/50 bg-accent/10 px-3 py-1 text-xs font-medium text-accent"
                : "rounded-full border border-border px-3 py-1 text-xs font-medium text-text-muted hover:border-border-strong"
            }
          >
            {opt.label}
          </Link>
        ))}
      </div>

      <RefillsBoard rows={rows} canManage={canManage} />
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
  tone?: "neutral" | "accent" | "warning" | "muted";
}) {
  const colors = {
    neutral: "text-text",
    accent: "text-accent",
    warning: "text-[color:var(--warning)]",
    muted: "text-text-muted",
  };
  return (
    <Card tone="raised">
      <CardContent className="pt-5 pb-5">
        <p className={`font-display text-3xl tabular-nums ${colors[tone]}`}>{value}</p>
        <p className="text-xs text-text-muted mt-1">{label}</p>
      </CardContent>
    </Card>
  );
}
