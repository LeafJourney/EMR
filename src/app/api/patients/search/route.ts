// EMR-683 — Patient quick-search for the /telehealth "Launch Video Visit" popup.
//
// GET /api/patients/search?q=<free-text>
//
// Free-text matches against name, phone, DOB (ISO substring), partial name,
// and email — scoped to the caller's organization. Returns a small list
// suitable for a single-popup picker (max 8 rows). Soft-deleted patients
// are excluded. Auth: any signed-in clinician in the org.

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { requireApiAuth } from "@/lib/auth/api-gate";
import { prisma } from "@/lib/db/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const LIMIT = 8;
const MIN_Q = 2;

export async function GET(req: NextRequest) {
  const gate = await requireApiAuth();
  if (gate.error) return gate.error;
  const orgId = gate.actor.organizationId;
  if (!orgId) {
    return NextResponse.json({ patients: [] });
  }

  const q = (new URL(req.url).searchParams.get("q") ?? "").trim();
  if (q.length < MIN_Q) {
    return NextResponse.json({ patients: [] });
  }

  // Build a tolerant set of OR predicates. Phone and DOB are stored
  // verbatim (DOB is a DateTime), so we compare by stringified ISO
  // substring; that's good enough for "type the year" or "type MM-DD"
  // free-text matching without bringing in a date parser.
  const patients = await prisma.patient.findMany({
    where: {
      organizationId: orgId,
      deletedAt: null,
      OR: [
        { firstName: { contains: q, mode: "insensitive" } },
        { lastName: { contains: q, mode: "insensitive" } },
        { email: { contains: q, mode: "insensitive" } },
        { phone: { contains: q } },
      ],
    },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      email: true,
      phone: true,
      dateOfBirth: true,
    },
    orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    take: LIMIT,
  });

  // Layered DOB match — separate query so we can union without forcing
  // Postgres to cast every row. Skipped if q has no digits.
  let dobMatches: typeof patients = [];
  if (/\d/.test(q) && patients.length < LIMIT) {
    const all = await prisma.patient.findMany({
      where: { organizationId: orgId, deletedAt: null, dateOfBirth: { not: null } },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        phone: true,
        dateOfBirth: true,
      },
      take: 200,
    });
    const known = new Set(patients.map((p) => p.id));
    dobMatches = all
      .filter(
        (p) =>
          !known.has(p.id) &&
          p.dateOfBirth &&
          p.dateOfBirth.toISOString().slice(0, 10).includes(q),
      )
      .slice(0, LIMIT - patients.length);
  }

  return NextResponse.json({
    patients: [...patients, ...dobMatches].map((p) => ({
      id: p.id,
      firstName: p.firstName,
      lastName: p.lastName,
      email: p.email,
      phone: p.phone,
      dateOfBirth: p.dateOfBirth?.toISOString().slice(0, 10) ?? null,
    })),
  });
}
