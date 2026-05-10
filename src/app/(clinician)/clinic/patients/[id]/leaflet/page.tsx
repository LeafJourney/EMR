import { redirect, notFound } from "next/navigation";
import { requireUser } from "@/lib/auth/session";
import { PageShell } from "@/components/shell/PageHeader";
import { Eyebrow } from "@/components/ui/ornament";
import { generateLeafletData, generateLeafletNarrative } from "./actions";
import { LeafletEditor } from "./leaflet-editor";
import { buildDeterministicNarrative } from "@/lib/domain/leaflet";
import { logger } from "@/lib/observability/log";

export const metadata = { title: "Leaflet — After Visit Summary" };

// ---------------------------------------------------------------------------
// EMR-148: Leaflet page — generate, preview, edit, print
// ---------------------------------------------------------------------------

export default async function LeafletPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { encounter?: string };
}) {
  const user = await requireUser();
  const encounterId = searchParams.encounter;

  if (!encounterId) {
    // No encounter specified — find the most recent one
    const { prisma } = await import("@/lib/db/prisma");
    const latest = await prisma.encounter.findFirst({
      where: {
        patientId: params.id,
        organizationId: user.organizationId!,
      },
      orderBy: { createdAt: "desc" },
      select: { id: true },
    });
    if (latest) {
      redirect(`/clinic/patients/${params.id}/leaflet?encounter=${latest.id}`);
    }
    // No encounters at all — show a helpful message
    return (
      <PageShell maxWidth="max-w-[800px]">
        <div className="text-center py-16">
          <Eyebrow className="justify-center mb-4">Leaflet</Eyebrow>
          <h1 className="font-display text-2xl text-text tracking-tight mb-3">
            No visit found
          </h1>
          <p className="text-sm text-text-muted max-w-md mx-auto mb-6">
            There are no completed visits for this patient yet. Start a visit first,
            finalize the note, then generate a leaflet.
          </p>
          <a href={`/clinic/patients/${params.id}?tab=notes`}>
            <button className="rounded-md bg-accent px-4 py-2 text-sm text-white hover:bg-accent/90 transition-colors">
              Back to chart
            </button>
          </a>
        </div>
      </PageShell>
    );
  }

  let result: Awaited<ReturnType<typeof generateLeafletData>>;
  try {
    result = await generateLeafletData(encounterId);
  } catch (err) {
    // Query or data assembly error — show a friendly message
    logger.error({ event: "clinic.leaflet.generate_failed", err });
    return (
      <PageShell maxWidth="max-w-[800px]">
        <div className="text-center py-16">
          <Eyebrow className="justify-center mb-4">Leaflet</Eyebrow>
          <h1 className="font-display text-2xl text-text tracking-tight mb-3">
            Unable to generate leaflet
          </h1>
          <p className="text-sm text-text-muted max-w-md mx-auto mb-6">
            There was an issue loading the visit data. This can happen if the note
            hasn&apos;t been finalized yet, or if there&apos;s a data issue.
          </p>
          <a href={`/clinic/patients/${params.id}?tab=notes`}>
            <button className="rounded-md bg-accent px-4 py-2 text-sm text-white hover:bg-accent/90 transition-colors">
              Back to notes
            </button>
          </a>
        </div>
      </PageShell>
    );
  }

  if (!result.ok) {
    return (
      <PageShell maxWidth="max-w-[800px]">
        <div className="text-center py-16">
          <Eyebrow className="justify-center mb-4">Leaflet</Eyebrow>
          <h1 className="font-display text-2xl text-text tracking-tight mb-3">
            Visit not found
          </h1>
          <p className="text-sm text-text-muted max-w-md mx-auto mb-6">
            {result.error ?? "The encounter could not be found. It may belong to a different organization."}
          </p>
          <a href={`/clinic/patients/${params.id}?tab=notes`}>
            <button className="rounded-md bg-accent px-4 py-2 text-sm text-white hover:bg-accent/90 transition-colors">
              Back to notes
            </button>
          </a>
        </div>
      </PageShell>
    );
  }

  const data = result.data;

  // Generate initial narrative
  const narrativeResult = await generateLeafletNarrative(data, "warm");
  const initialNarrative = narrativeResult.ok
    ? narrativeResult.narrative
    : buildDeterministicNarrative(data);

  return (
    <PageShell maxWidth="max-w-[800px]">
      <div className="mb-6 print:hidden">
        <Eyebrow className="mb-2">Leaflet</Eyebrow>
        <h1 className="font-display text-2xl text-text tracking-tight">
          After Visit Summary
        </h1>
        <p className="text-sm text-text-muted mt-1">
          Review, edit, then print or save to the patient&apos;s chart.
        </p>
      </div>

      <LeafletEditor
        data={data}
        encounterId={encounterId}
        initialNarrative={initialNarrative}
      />
    </PageShell>
  );
}
