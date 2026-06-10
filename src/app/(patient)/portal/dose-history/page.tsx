import { requireRole } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { PageShell, PageHeader } from "@/components/shell/PageHeader";
import { PatientSectionNav } from "@/components/shell/PatientSectionNav";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatDate } from "@/lib/utils/format";
import { EMOJI_OPTIONS, EMOJI_RATING_SCORE, getSideEffectOption } from "@/lib/domain/emoji-outcomes";

export const metadata = { title: "Dose History" };

// EMR-1113 (PJ-1): the quick-dose flow stores a structured marker note
// ("[post_dose] product=… regimenId=… emoji=N"). Parse the emoji score back
// out for display and hide the raw marker from the note blockquote.
function parseFeeling(note: string | null) {
  const match = note?.match(/\bemoji=([1-5])\b/);
  if (!match) return null;
  const score = Number(match[1]);
  return EMOJI_OPTIONS.find((o) => EMOJI_RATING_SCORE[o.value] === score) ?? null;
}

function isStructuredMarker(note: string | null): boolean {
  return !!note && note.trimStart().startsWith("[post_dose");
}

function parseSideEffects(raw: unknown): string[] {
  return Array.isArray(raw) ? raw.filter((id): id is string => typeof id === "string") : [];
}

export default async function DoseHistoryPage() {
  const user = await requireRole("patient");

  const patient = await prisma.patient.findUnique({
    where: { userId: user.id },
  });

  if (!patient) {
    return (
      <PageShell>
        <p className="text-text-muted">Patient profile not found.</p>
      </PageShell>
    );
  }

  // EMR-221: Fetch the dose logs, joined with regimen to get product names
  const doseLogs = await prisma.doseLog.findMany({
    where: { patientId: patient.id },
    orderBy: { loggedAt: "desc" },
    include: {
      regimen: {
        include: { product: true }
      }
    },
    take: 50, // Display the last 50 for V1
  });

  return (
    <PageShell maxWidth="max-w-[880px]">
      <PageHeader
        eyebrow="My Health"
        title="Dose History"
        description="A timeline of your cannabis usage and product check-ins."
      />
      <PatientSectionNav section="health" />

      {doseLogs.length === 0 ? (
        <Card tone="glass" className="text-center py-16 mt-8">
          <CardContent>
            <div className="text-4xl mb-4">📓</div>
            <h2 className="text-xl font-display font-medium text-text mb-2">Your timeline starts with one tap</h2>
            <p className="text-sm text-text-muted mb-6 max-w-sm mx-auto">
              Log a dose after each use — it takes about 15 seconds. Every entry
              lands here and helps your care team dial in what works for you.
            </p>
            <a href="/portal/log-dose" className="inline-flex bg-[var(--accent)] text-white px-5 py-2.5 rounded-full text-sm font-medium hover:bg-[var(--accent-hover)] transition-colors">
              Log your first dose
            </a>
          </CardContent>
        </Card>
      ) : (
        <div className="mt-8 relative border-l border-[var(--border)] ml-4 pl-6 space-y-8">
          {doseLogs.map((log) => {
            const feeling = parseFeeling(log.note);
            const effects = parseSideEffects(log.sideEffects);
            return (
            <div key={log.id} className="relative">
              {/* Timeline dot */}
              <div className="absolute -left-[31px] top-1.5 w-3 h-3 bg-[var(--accent)] rounded-full ring-4 ring-[var(--bg)]" />

              <div className="mb-1 flex items-center gap-2">
                <span className="text-sm font-semibold text-text">
                  {formatDate(log.loggedAt)}
                </span>
                <span className="text-xs text-text-muted">
                  {new Date(log.loggedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>

              <Card tone="raised" className="mt-2">
                <CardContent className="p-5">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div>
                      <h4 className="font-medium text-text text-lg">
                        {log.regimen?.product.name || "Unknown Product"}
                      </h4>
                      <p className="text-sm text-text-muted mt-0.5">
                        {log.actualVolume} {log.volumeUnit} {log.route ? `via ${log.route.replace('_', ' ')}` : ""}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      {feeling && (
                        <Badge tone="neutral" className="text-sm">
                          {feeling.emoji} {feeling.label}
                        </Badge>
                      )}
                      {log.estimatedThcMg && log.estimatedThcMg > 0 && (
                        <Badge tone="warning">THC {log.estimatedThcMg.toFixed(1)}mg</Badge>
                      )}
                      {log.estimatedCbdMg && log.estimatedCbdMg > 0 && (
                        <Badge tone="success">CBD {log.estimatedCbdMg.toFixed(1)}mg</Badge>
                      )}
                    </div>
                  </div>
                  {/* EMR-1113: side-effect chips from the post-dose quick-pick grid */}
                  {effects.length > 0 && (
                    <div className="mt-4 pt-4 border-t border-[var(--border)] flex flex-wrap gap-1.5">
                      {effects.map((id) => {
                        const opt = getSideEffectOption(id);
                        return (
                          <span
                            key={id}
                            className="inline-flex items-center gap-1 rounded-full bg-[var(--surface-muted)] border border-[var(--border)] px-2.5 py-1 text-xs text-text"
                          >
                            <span>{opt?.emoji ?? "⚠️"}</span>
                            {opt?.label ?? id.replace(/_/g, " ")}
                          </span>
                        );
                      })}
                    </div>
                  )}
                  {log.note && !isStructuredMarker(log.note) && (
                    <div className="mt-4 pt-4 border-t border-[var(--border)]">
                      <p className="text-sm text-text-muted italic">"{log.note}"</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
            );
          })}
        </div>
      )}
    </PageShell>
  );
}
