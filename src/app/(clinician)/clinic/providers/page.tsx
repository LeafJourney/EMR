import Link from "next/link";
import { prisma } from "@/lib/db/prisma";
import { requireUser } from "@/lib/auth/session";
import { PageHeader, PageShell } from "@/components/shell/PageHeader";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { logger } from "@/lib/observability/log";
import {
  ProvidersDirectoryClient,
  type ProviderRow,
} from "./providers-directory-client";

export const metadata = { title: "Providers" };

// EMR-613 — hard cap on the directory size. The ticket targets 5,000
// contacts; we keep an explicit cap so a single render never balloons
// past it and log loudly when an org grows past the ceiling (mirrors the
// pattern in `src/app/(clinician)/clinic/patients/page.tsx`).
const PROVIDER_DIRECTORY_CAP = 5_000;

type AncillaryDiscipline = "ot" | "pt" | "speech" | "case_mgmt" | "home_health";

const ANCILLARY_DISCIPLINES: Array<{
  key: AncillaryDiscipline;
  label: string;
  blurb: string;
}> = [
  {
    key: "ot",
    label: "Occupational therapy",
    blurb: "ADLs, fine motor, sensory regulation, return-to-work assessments.",
  },
  {
    key: "pt",
    label: "Physical therapy",
    blurb: "Mobility, balance, post-op rehab, pain-driven movement therapy.",
  },
  {
    key: "speech",
    label: "Speech & language",
    blurb: "Swallow studies, aphasia recovery, cognitive-communication therapy.",
  },
  {
    key: "case_mgmt",
    label: "Case management",
    blurb: "Care coordination, transitional care, social work hand-offs.",
  },
  {
    key: "home_health",
    label: "Home health",
    blurb: "Skilled nursing, wound care, IV therapy, in-home rehab.",
  },
];

export default async function ProvidersPage() {
  const user = await requireUser();

  const providers = await prisma.provider.findMany({
    where: {
      organizationId: user.organizationId!,
      active: true,
    },
    include: {
      user: {
        select: { firstName: true, lastName: true, email: true },
      },
    },
    orderBy: { createdAt: "asc" },
    take: PROVIDER_DIRECTORY_CAP,
  });

  if (providers.length === PROVIDER_DIRECTORY_CAP) {
    logger.warn({
      event: "clinic.providers_directory.cap_hit",
      cap: PROVIDER_DIRECTORY_CAP,
      orgId: user.organizationId,
      message:
        "Add server-side pagination + filtered search before this org grows further.",
    });
  }

  const rows: ProviderRow[] = providers.map((p) => ({
    id: p.id,
    firstName: p.user.firstName,
    lastName: p.user.lastName,
    title: p.title,
    specialties: p.specialties,
    practiceAddress: p.practiceAddress,
    hospitalAffiliations: p.hospitalAffiliations,
    bio: p.bio,
  }));

  return (
    <PageShell>
      <PageHeader
        eyebrow="Providers"
        title="Provider directory"
        description="View and contact providers in your organization."
      />

      {rows.length === 0 ? (
        <EmptyState
          title="No providers found"
          description="There are no active providers in your organization yet."
        />
      ) : (
        <ProvidersDirectoryClient providers={rows} />
      )}

      {/* EMR-614 — Ancillary services summary */}
      <section className="mt-12 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-display text-xl font-semibold text-text tracking-tight">
              Ancillary services
            </h2>
            <p className="text-sm text-text-muted mt-0.5">
              Non-physician care team disciplines. View the full queue for open
              referrals and pending intake.
            </p>
          </div>
          <Link href="/clinic/ancillary">
            <Button variant="secondary" size="sm">
              View full queue
            </Button>
          </Link>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {ANCILLARY_DISCIPLINES.map((d) => (
            <Card key={d.key} tone="raised">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">{d.label}</CardTitle>
                <CardDescription className="text-xs">{d.blurb}</CardDescription>
              </CardHeader>
              <CardContent>
                <Link href={`/clinic/ancillary?discipline=${d.key}`}>
                  <Badge tone="neutral" className="cursor-pointer hover:opacity-80 transition-opacity">
                    Open queue →
                  </Badge>
                </Link>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>
    </PageShell>
  );
}
