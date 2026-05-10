// EMR-447 — Practice admin dashboard
//
// Loads the latest *published* PracticeConfiguration for the signed-in
// practice admin's practice and renders <PracticeAdminShell />. This is the
// read-only home — editing is controller-only (EMR-428 / EMR-431).
//
// Role gate:
//   - Must be signed in (else redirect to /sign-in).
//   - Must hold the `practice_admin` role somewhere; if not, redirect to
//     /forbidden. Note that super_admin / implementation_admin are NOT
//     auto-allowed here — they have their own surfaces. This dashboard is
//     specifically the tenant-facing home.
//
// Multi-org practice admins:
//   - We list every Practice the user holds `practice_admin` on. If they
//     hold more than one, the page renders a picker at the top. The
//     selected practice is passed via `?practiceId=`. The first listed
//     practice is the default.
//
// Specialty-adaptive: nothing in this file branches on specialty.

import * as React from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import type { Metadata } from "next";

import {
  PracticeAdminShell,
  type PracticeSummary,
} from "@/components/shell/practice-admin-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { getCurrentUser } from "@/lib/auth/session";
import { canViewPracticeConfig } from "@/lib/auth/super-admin";
import { prisma } from "@/lib/db/prisma";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Practice dashboard - LeafJourney",
  description: "Read-only summary of your practice's published configuration.",
  robots: { index: false, follow: false },
};

interface PracticeAdminDashboardPageProps {
  searchParams?: { practiceId?: string };
}

/** Practices reachable by this practice_admin user. EMR-428 anchors the
 *  membership scope on `organizationId` — every Practice that rolls up under
 *  an Organization the user is `practice_admin` in is reachable. */
async function loadReachablePractices(userId: string): Promise<
  Array<{
    id: string;
    name: string;
    organizationId: string;
    organizationName: string;
  }>
> {
  const memberships = await prisma.membership.findMany({
    where: { userId, role: "practice_admin" },
    select: { organizationId: true },
  });
  const orgIds = memberships.map((m) => m.organizationId);
  if (orgIds.length === 0) return [];

  const practices = await prisma.practice.findMany({
    where: { organizationId: { in: orgIds } },
    orderBy: [{ organizationId: "asc" }, { name: "asc" }],
    select: {
      id: true,
      name: true,
      organizationId: true,
      organization: { select: { name: true } },
    },
  });

  return practices.map((p) => ({
    id: p.id,
    name: p.name,
    organizationId: p.organizationId,
    organizationName: p.organization.name,
  }));
}

export default async function PracticeAdminDashboardPage({
  searchParams,
}: PracticeAdminDashboardPageProps) {
  const user = await getCurrentUser();
  if (!user) redirect("/sign-in");

  if (!user.roles.includes("practice_admin")) {
    redirect("/forbidden");
  }

  const reachable = await loadReachablePractices(user.id);

  if (reachable.length === 0) {
    // Has the role but no practice memberships — shouldn't happen, but render
    // a friendly empty state rather than throwing.
    return (
      <div className="min-h-[60vh] flex items-center justify-center px-6 py-16">
        <Card className="max-w-md w-full text-center p-8">
          <h1 className="font-display text-xl text-text">No practice yet</h1>
          <p className="text-sm text-text-muted mt-2">
            Your account has the practice admin role but is not yet attached to
            a practice. Contact your LeafJourney implementation team.
          </p>
        </Card>
      </div>
    );
  }

  // Pick the active practice. `?practiceId=` wins when valid; otherwise the
  // first reachable practice is the default.
  const requested = searchParams?.practiceId;
  const active =
    (requested && reachable.find((p) => p.id === requested)) || reachable[0];

  // Defense in depth — re-check the read scope through the EMR-428 helper.
  // `canViewPracticeConfig` keys on the org scope; `active.organizationId`
  // is what the helper expects in its `practiceId` parameter.
  const allowed = await canViewPracticeConfig(user, active.organizationId);
  if (!allowed) {
    redirect("/forbidden");
  }

  // Direct Prisma read — the controller is server-side, no /api round trip.
  const [config, practice] = await Promise.all([
    prisma.practiceConfiguration.findFirst({
      where: { practiceId: active.id, status: "published" },
      orderBy: { publishedAt: "desc" },
    }),
    prisma.practice.findUnique({
      where: { id: active.id },
      select: {
        id: true,
        name: true,
        npi: true,
        street: true,
        city: true,
        state: true,
        postalCode: true,
        organization: {
          select: { brandName: true, legalName: true, name: true },
        },
      },
    }),
  ]);

  if (!practice) {
    // Membership pointed at a deleted practice — bail safely.
    redirect("/forbidden");
  }

  const practiceSummary: PracticeSummary = {
    id: practice.id,
    name: practice.name,
    brandName:
      practice.organization.brandName ??
      practice.organization.legalName ??
      practice.organization.name ??
      null,
    npi: practice.npi,
    street: practice.street,
    city: practice.city,
    state: practice.state,
    postalCode: practice.postalCode,
  };

  if (!config) {
    return (
      <div className="px-6 lg:px-12 py-10 mx-auto max-w-[1100px]">
        {reachable.length > 1 ? (
          <div className="mb-6">
            <PracticePicker reachable={reachable} activeId={active.id} />
          </div>
        ) : null}
        <Card>
          <CardHeader>
            <CardTitle>{practiceSummary.brandName ?? practiceSummary.name}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-text-muted">
              No published configuration yet. Your LeafJourney implementation
              team will publish a configuration once onboarding is complete.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <PracticeAdminShell
      config={config}
      practice={practiceSummary}
      picker={
        reachable.length > 1 ? (
          <PracticePicker reachable={reachable} activeId={active.id} />
        ) : undefined
      }
    />
  );
}

function PracticePicker({
  reachable,
  activeId,
}: {
  reachable: Array<{
    id: string;
    name: string;
    organizationId: string;
    organizationName: string;
  }>;
  activeId: string;
}) {
  return (
    <Card tone="outlined">
      <CardHeader>
        <p className="text-[11px] uppercase tracking-wide text-text-subtle font-medium">
          Switch practice
        </p>
        <CardTitle>You manage multiple practices</CardTitle>
      </CardHeader>
      <CardContent>
        <ul className="flex flex-wrap gap-2">
          {reachable.map((p) => {
            const isActive = p.id === activeId;
            return (
              <li key={p.id}>
                <Link
                  href={`/practice-admin/dashboard?practiceId=${encodeURIComponent(p.id)}`}
                  className="inline-flex items-center rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
                  aria-current={isActive ? "page" : undefined}
                >
                  <Badge tone={isActive ? "accent" : "neutral"}>
                    {p.name}
                    <span className="text-text-subtle ml-1">
                      · {p.organizationName}
                    </span>
                  </Badge>
                </Link>
              </li>
            );
          })}
        </ul>
      </CardContent>
    </Card>
  );
}
