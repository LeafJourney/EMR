import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db/prisma";
import { requireUser } from "@/lib/auth/session";
import { hasPermission } from "@/lib/rbac/permissions";
import { PageHeader, PageShell } from "@/components/shell/PageHeader";
import { EmptyState } from "@/components/ui/empty-state";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export const metadata = { title: "Notes Sign-Off" };

export default async function NotesSignOffPage() {
  const user = await requireUser();

  // EMR-1111 (FO-B5) — clinical notes queue requires notes.read.
  if (!hasPermission(user, "notes.read")) redirect("/clinic");

  const notes = await prisma.note.findMany({
    where: {
      status: "pending_cosign",
      encounter: { patient: { organizationId: user.organizationId! } },
    },
    orderBy: { updatedAt: "desc" },
    include: {
      encounter: {
        include: {
          patient: { select: { id: true, firstName: true, lastName: true } },
        },
      },
    },
    take: 50,
  });

  return (
    <PageShell maxWidth="max-w-[1080px]">
      <PageHeader
        eyebrow="Sign-Off"
        title="Clinical Notes"
        description="AI-drafted or pending clinical notes awaiting your final review and signature."
      />

      {notes.length === 0 ? (
        <EmptyState
          title="All caught up"
          description="There are no pending notes requiring your signature."
        />
      ) : (
        <div className="space-y-3">
          {notes.map((n) => {
            const confidence = n.aiConfidence ?? 1;
            const isLowConfidence = confidence < 0.6;
            return (
              <Link key={n.id} href={`/clinic/patients/${n.encounter.patient.id}/notes/${n.id}`} className="block">
                <Card className="hover:border-accent/50 transition-colors">
                  <CardContent className="flex items-center justify-between px-5 py-4">
                    <div>
                      <p className="font-medium text-text">
                        {n.encounter.patient.firstName} {n.encounter.patient.lastName}
                      </p>
                      <p className="text-sm text-text-muted mt-0.5">
                        Encounter on {n.encounter.scheduledFor ? n.encounter.scheduledFor.toLocaleDateString() : "Unknown"}
                      </p>
                    </div>
                    <div className="text-right">
                      <Badge tone={isLowConfidence ? "danger" : "info"} className="mb-1">
                        Confidence {Math.round(confidence * 100)}%
                      </Badge>
                      <p className="text-xs text-text-subtle">
                        Drafted {n.updatedAt.toLocaleDateString()}
                      </p>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </PageShell>
  );
}
