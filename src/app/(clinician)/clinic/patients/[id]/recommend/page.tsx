import { notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/db/prisma";
import { requireUser } from "@/lib/auth/session";
import { PageShell } from "@/components/shell/PageHeader";
import { Eyebrow } from "@/components/ui/ornament";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { RecommendForm } from "./recommend-form";
import type { Recommendation } from "./actions";

interface PageProps {
  params: { id: string };
}

export const metadata = { title: "AI Recommendation" };

export default async function RecommendPage({ params }: PageProps) {
  const user = await requireUser();

  const patient = await prisma.patient.findFirst({
    where: {
      id: params.id,
      organizationId: user.organizationId!,
      deletedAt: null,
    },
  });

  if (!patient) notFound();

  // EMR-1098 (M1): recent saved recommendations — the durable record of the
  // decision support generated for this patient. The catch keeps the page up
  // while the CannabisRecommendation table migration is still rolling out.
  const recentRecommendations = await prisma.cannabisRecommendation
    .findMany({
      where: { patientId: params.id, organizationId: user.organizationId! },
      orderBy: { createdAt: "desc" },
      take: 5,
    })
    .catch(() => []);

  return (
    <PageShell maxWidth="max-w-[800px]">
      <div className="mb-8">
        <Eyebrow className="mb-3">AI recommendation</Eyebrow>
        <div className="flex items-center gap-4">
          <Avatar
            firstName={patient.firstName}
            lastName={patient.lastName}
            size="lg"
          />
          <div>
            <h1 className="font-display text-3xl text-text tracking-tight">
              Treatment plan for {patient.firstName} {patient.lastName}
            </h1>
            <p className="text-sm text-text-muted mt-1">
              Generate an evidence-based cannabis treatment recommendation using
              the patient&apos;s data and the research database.
            </p>
          </div>
        </div>
      </div>

      <RecommendForm
        patientId={params.id}
        patientName={`${patient.firstName} ${patient.lastName}`}
        concerns={patient.presentingConcerns}
        goals={patient.treatmentGoals}
      />

      {/* EMR-1098 (M1): previously generated recommendations survive reloads. */}
      {recentRecommendations.length > 0 && (
        <Card tone="raised" className="mt-8">
          <CardHeader>
            <CardTitle>Recent saved recommendations</CardTitle>
            <CardDescription>
              Every generated recommendation is saved to the chart as a record
              of the decision support used.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="divide-y divide-border/60">
              {recentRecommendations.map((saved) => {
                const rec = saved.recommendation as unknown as Recommendation;
                return (
                  <li
                    key={saved.id}
                    className="py-3 flex items-center justify-between gap-4 flex-wrap"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-medium text-text">
                          {rec.productType} · {rec.cannabinoidRatio}
                        </p>
                        <Badge
                          tone={
                            rec.confidence === "high"
                              ? "success"
                              : rec.confidence === "moderate"
                                ? "highlight"
                                : "neutral"
                          }
                        >
                          {rec.confidence} confidence
                        </Badge>
                      </div>
                      <p className="text-xs text-text-muted mt-0.5">
                        {rec.startingDoseMg} — {rec.frequency}
                      </p>
                      <p className="text-[11px] text-text-subtle mt-0.5">
                        {saved.createdAt.toLocaleDateString("en-US", {
                          year: "numeric",
                          month: "short",
                          day: "numeric",
                        })}{" "}
                        by {saved.createdByName}
                      </p>
                    </div>
                    <Link
                      href={`/clinic/patients/${params.id}/prescribe?rec=${saved.id}`}
                    >
                      <Button variant="secondary" size="sm">
                        Apply to prescription
                      </Button>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </CardContent>
        </Card>
      )}
    </PageShell>
  );
}
