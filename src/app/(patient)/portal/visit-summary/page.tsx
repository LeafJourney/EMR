import { PatientSectionNav } from "@/components/shell/PatientSectionNav";
import { PageHeader, PageShell } from "@/components/shell/PageHeader";
import { prisma } from "@/lib/db/prisma";
import { requireRole } from "@/lib/auth/session";
import { AvsSummaryView } from "@/components/avs/AvsSummaryView";
import { safeParseAvsDocument } from "@/lib/domain/avs/types";

export const metadata = { title: "Visit summaries" };

// EMR-1152 — patient-facing after-visit summaries. Released summaries appear
// here immediately (the release action revalidates this path + sends a portal
// notification deep-linking here). Latest is expanded; earlier ones collapse
// into a scannable list. No pop-ups; Zen-Density styling.
export default async function VisitSummaryPage() {
  const user = await requireRole("patient");
  const patient = await prisma.patient.findUnique({ where: { userId: user.id } });

  if (!patient) {
    return (
      <PageShell maxWidth="max-w-[880px]">
        <PageHeader eyebrow="My Health" title="Visit summaries" />
        <PatientSectionNav section="health" />
        <p className="text-sm text-text-muted">No patient profile found.</p>
      </PageShell>
    );
  }

  const rows = await prisma.afterVisitSummary.findMany({
    where: { patientId: patient.id, status: "released" },
    orderBy: { releasedAt: "desc" },
    take: 20,
  });

  const summaries = rows.flatMap((r) => {
    const doc = safeParseAvsDocument(r.payload);
    return doc ? [{ id: r.id, releasedAt: r.releasedAt, doc }] : [];
  });

  const [latest, ...earlier] = summaries;

  return (
    <PageShell maxWidth="max-w-[880px]">
      <PageHeader eyebrow="My Health" title="Visit summaries" />
      <PatientSectionNav section="health" />

      {summaries.length === 0 ? (
        <div className="mt-6 rounded-xl border border-border bg-surface-muted/40 px-5 py-8 text-center">
          <p className="text-3xl" aria-hidden>📋</p>
          <p className="mt-2 text-sm font-medium text-text">No visit summaries yet</p>
          <p className="mt-1 text-sm text-text-muted">
            After your next visit, your care team will share a plain-language summary here.
          </p>
        </div>
      ) : (
        <div className="mt-6 space-y-8">
          <article className="rounded-2xl border border-border bg-surface p-5 shadow-sm md:p-6">
            <AvsSummaryView doc={latest.doc} />
          </article>

          {earlier.length > 0 && (
            <section className="space-y-3">
              <h2 className="text-sm font-semibold uppercase tracking-[0.12em] text-text-subtle">
                Earlier summaries
              </h2>
              {earlier.map((s) => (
                <details key={s.id} className="group rounded-xl border border-border bg-surface">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-sm font-medium text-text">
                    <span>
                      {s.doc.visitDate} · {s.doc.provider}
                    </span>
                    <span className="text-xs text-text-muted group-open:hidden">View</span>
                    <span className="hidden text-xs text-text-muted group-open:inline">Hide</span>
                  </summary>
                  <div className="border-t border-border/60 px-4 py-4">
                    <AvsSummaryView doc={s.doc} />
                  </div>
                </details>
              ))}
            </section>
          )}
        </div>
      )}
    </PageShell>
  );
}
