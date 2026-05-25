// GET /api/patients/[id]/preview
//
// Lightweight patient summary for the HoverCard primitive. Returns just
// the fields needed to render a one-glance card: name, DOB, primary
// presenting concern, last completed encounter date, and the most-recent
// rendering provider. Heavy chart data (notes, labs, intake answers) is
// intentionally excluded — this endpoint is hit on hover and must stay fast.
//
// Auth: any signed-in clinician in the patient's organization. Chart-
// restricted patients still expose the demographic header (matches the
// "office-roles can see demographics" rule from Patient.chartRestricted
// in prisma/schema.prisma); clinical fields are nulled out for non-listed
// providers.

import { NextResponse } from "next/server";
import { requireApiAuth } from "@/lib/auth/api-gate";
import { prisma } from "@/lib/db/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface Params {
  params: { id: string };
}

export async function GET(_request: Request, { params }: Params) {
  const gate = await requireApiAuth();
  if (gate.error) return gate.error;
  const orgId = gate.actor.organizationId;
  if (!orgId) {
    return NextResponse.json({ error: "no_org" }, { status: 403 });
  }

  const patient = await prisma.patient.findFirst({
    where: { id: params.id, organizationId: orgId, deletedAt: null },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      dateOfBirth: true,
      status: true,
      presentingConcerns: true,
      qualificationStatus: true,
      chartRestricted: true,
      restrictedProviderIds: true,
    },
  });
  if (!patient) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const restricted =
    patient.chartRestricted &&
    !patient.restrictedProviderIds.includes(gate.actor.id);

  // Most recent completed encounter — for "last visit" and primary provider.
  const lastEncounter = restricted
    ? null
    : await prisma.encounter.findFirst({
        where: {
          patientId: patient.id,
          organizationId: orgId,
          status: "complete",
        },
        select: {
          completedAt: true,
          scheduledFor: true,
          provider: {
            select: {
              user: { select: { firstName: true, lastName: true } },
              title: true,
            },
          },
        },
        orderBy: [{ completedAt: "desc" }, { scheduledFor: "desc" }],
      });

  const providerUser = lastEncounter?.provider?.user;
  const providerName = providerUser
    ? `${providerUser.firstName} ${providerUser.lastName}`.trim()
    : null;

  return NextResponse.json({
    id: patient.id,
    firstName: patient.firstName,
    lastName: patient.lastName,
    dateOfBirth: patient.dateOfBirth?.toISOString().slice(0, 10) ?? null,
    status: patient.status,
    qualificationStatus: patient.qualificationStatus,
    presentingConcerns: restricted ? null : patient.presentingConcerns,
    lastVisitAt:
      lastEncounter?.completedAt?.toISOString() ??
      lastEncounter?.scheduledFor?.toISOString() ??
      null,
    primaryProviderName: providerName,
    primaryProviderTitle: lastEncounter?.provider?.title ?? null,
    chartRestricted: restricted,
  });
}
