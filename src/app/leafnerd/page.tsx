import { getCurrentUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { getLeafnerdData } from "@/lib/leafnerd/server-data";
import LeafnerdApp from "@/components/leafnerd/fhir-intelligence/LeafnerdApp";
import type { ClaimAnomalyRow, CohortStatusCount } from "@/lib/leafnerd/types";

// Force dynamic so the page always reflects fresh aggregates (and never tries to
// statically prerender DB-backed data at build time).
export const dynamic = "force-dynamic";

export default async function LeafNerdDashboard() {
  // Auth is best-effort for the demo: if a user is signed in we greet them by name,
  // but we never block rendering (all data shown is synthetic/demo data).
  // NOTE: re-enable a real access gate before shipping to production.
  let userName: string | undefined;
  try {
    const user = await getCurrentUser();
    userName = user?.firstName ?? undefined;
  } catch {
    userName = undefined;
  }

  // The analytics layer always returns a complete, believable payload (it falls
  // back to DEMO_DATA internally if any DB query fails).
  const data = await getLeafnerdData();

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
    />
  );
}
