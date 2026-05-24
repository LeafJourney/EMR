// Onboarding entry point — lists existing draft configurations for the
// admin's organization and offers a "Start a new practice" action that
// creates a draft via the EMR-435 API and redirects into the wizard.

import Link from "next/link";
import type { Metadata } from "next";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Eyebrow, EmptyIllustration } from "@/components/ui/ornament";
import { PageHeader, PageShell } from "@/components/shell/PageHeader";
import { Breadcrumbs } from "@/components/super-admin/breadcrumbs";
import {
  listDraftsForOrganization,
  requireImplementationAdminCompat,
} from "./wizard/[draftId]/loaders-list";
import { StartNewPracticeButton } from "./start-new-practice-button";

export const metadata: Metadata = {
  title: "Onboarding - Leafjourney",
  description: "Configure new practices on Leafjourney.",
};

export default async function OnboardingDashboardPage() {
  const user = await requireImplementationAdminCompat();
  const drafts = user.organizationId
    ? await listDraftsForOrganization(user.organizationId)
    : [];

  return (
    <PageShell maxWidth="max-w-[1100px]">
      <Breadcrumbs
        items={[
          { label: "HQ", href: "/admin/hq" },
          { label: "Operations" },
          { label: "Onboarding" },
        ]}
      />
      <PageHeader
        eyebrow="Implementation"
        title="Practice onboarding"
        description="Stand up a new practice configuration, or pick up where you left off on a draft."
        actions={<StartNewPracticeButton />}
      />

      {drafts.length === 0 ? (
        <Card tone="outlined">
          <CardContent className="py-16 flex flex-col items-center text-center">
            <EmptyIllustration size={140} className="mb-6 opacity-80" />
            <Eyebrow className="mb-2">No drafts yet</Eyebrow>
            <h2 className="font-display text-xl text-text">
              Start your first practice configuration
            </h2>
            <p className="text-sm text-text-muted mt-2 max-w-md">
              The wizard walks you through specialty, care model, modalities,
              workflows, and previews &mdash; saved as you go.
            </p>
            <div className="mt-6">
              <StartNewPracticeButton />
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {drafts.map((d) => (
            <Card key={d.id} tone="default">
              <CardHeader>
                <div className="flex items-start justify-between gap-3">
                  <CardTitle>
                    {d.name ?? "Untitled practice configuration"}
                  </CardTitle>
                  <Badge tone={d.publishedAt ? "success" : "neutral"}>
                    {d.publishedAt ? "Published" : "Draft"}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="flex items-center justify-between">
                <p className="text-xs text-text-muted">
                  Updated{" "}
                  {d.updatedAt
                    ? new Date(d.updatedAt).toLocaleDateString()
                    : "recently"}
                </p>
                <Link href={`/onboarding/wizard/${d.id}`}>
                  <Button variant="secondary" size="sm">
                    Resume
                  </Button>
                </Link>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </PageShell>
  );
}
