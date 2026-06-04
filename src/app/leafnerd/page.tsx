import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { getLeafnerdData } from "@/lib/leafnerd/server-data";
import { getLeafnerdClinicalData } from "@/lib/leafnerd/clinical-surfaces";
import { getRealFhirResources } from "@/lib/leafnerd/fhir-real";
import LeafnerdApp from "@/components/leafnerd/fhir-intelligence/LeafnerdApp";
import type { ClaimAnomalyRow, CohortStatusCount } from "@/lib/leafnerd/types";

// Force dynamic so the page always reflects fresh aggregates (and never tries to
// statically prerender DB-backed data at build time).
export const dynamic = "force-dynamic";

export default async function LeafNerdDashboard() {
  // Access gate. ENFORCED in production: requires a signed-in user holding the
  // `leafnerd` (or `super_admin`) role — the demo identity Dr. Lena Reyes carries it.
  // Kept open in dev so local iteration never bounces to /sign-in.
  const user = await getCurrentUser().catch(() => null);
  if (process.env.NODE_ENV === "production") {
    if (!user) redirect("/sign-in?redirect_url=/leafnerd");
    const memberships = await prisma.membership
      .findMany({ where: { userId: user.id } })
      .catch(() => [] as { role: string }[]);
    const hasAccess = memberships.some(
      (m: { role: string }) => m.role === "leafnerd" || m.role === "super_admin",
    );
    if (!hasAccess) redirect("/forbidden");
  }
  const userName: string | undefined = user?.firstName ?? undefined;

  // The analytics layer always returns a complete, believable payload (it falls
  // back to DEMO_DATA internally if any DB query fails).
  const data = await getLeafnerdData();

  // Real seeded clinical lists (Patients/Encounters/Observations/Conditions/Medications/Labs).
  // Never throws — falls back to curated rows internally.
  const clinical = await getLeafnerdClinicalData();

  // Prepend genuinely-mapped FHIR R4 resources (built from real seeded patients via
  // platform/fhir.ts) so the FHIR Explorer leads with real data. Falls back silently.
  try {
    const realFhir = await getRealFhirResources();
    if (realFhir.length) data.fhirResources = [...realFhir, ...data.fhirResources];
  } catch {
    /* keep the curated fhirResources */
  }

  // Optional real-data overlays for the Cohort + Claims surfaces. Both are wrapped
  // in try/catch; on any failure the surfaces use their own curated demo fallback.
  let cohortStatusCounts: CohortStatusCount[] | undefined;
  try {
    const grouped = await prisma.patient.groupBy({ by: ["status"], _count: true });
    cohortStatusCounts = grouped.map((g) => ({
      status: String((g as { status: unknown }).status),
      count: typeof (g as { _count: unknown })._count === "number" ? (g as { _count: number })._count : 0,
    }));
  } catch {
    cohortStatusCounts = undefined;
  }

  let claims: ClaimAnomalyRow[] | undefined;
  try {
    const rows = await prisma.claimScrubResult.findMany({
      include: { claim: true },
      orderBy: { scrubbedAt: "desc" },
      take: 12,
    });
    claims = rows.map((row) => {
      const r = row as unknown as {
        id: string;
        claimId?: string | null;
        status?: string | null;
        edits?: unknown;
        scrubbedAt?: Date | null;
        claim?: {
          cptCodes?: unknown;
          billedAmountCents?: number | null;
          claimNumber?: string | null;
        } | null;
      };
      const firstEdit = Array.isArray(r.edits) ? (r.edits[0] as { message?: string } | undefined) : undefined;
      const firstCpt = Array.isArray(r.claim?.cptCodes)
        ? ((r.claim?.cptCodes as Array<{ code?: string }>)[0]?.code as string | undefined)
        : undefined;
      return {
        id: r.id,
        claimId: r.claimId ?? undefined,
        code: firstCpt,
        description: firstEdit?.message ?? r.status ?? "Flagged claim",
        amount:
          typeof r.claim?.billedAmountCents === "number" ? r.claim!.billedAmountCents / 100 : undefined,
        scrubbedAt: r.scrubbedAt ? r.scrubbedAt.toISOString() : undefined,
      } satisfies ClaimAnomalyRow;
    });
    if (claims.length === 0) claims = undefined; // let the surface use its demo fallback
  } catch {
    claims = undefined;
  }

  return (
    <LeafnerdApp
      data={data}
      userName={userName}
      claims={claims}
      cohortStatusCounts={cohortStatusCounts}
      clinical={clinical}
    />
  );
}
