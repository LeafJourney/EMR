import { prisma } from "@/lib/db/prisma";
import { requireUser } from "@/lib/auth/session";
import { PageHeader, PageShell } from "@/components/shell/PageHeader";
import { EmptyState } from "@/components/ui/empty-state";
import { logger } from "@/lib/observability/log";
import {
  ProvidersDirectoryClient,
  type ProviderRow,
} from "./providers-directory-client";
import { AncillaryServicesDirectory } from "./ancillary-services-directory";

export const metadata = { title: "Providers" };

// EMR-613 — hard cap on the directory size. The ticket targets 5,000
// contacts; we keep an explicit cap so a single render never balloons
// past it and log loudly when an org grows past the ceiling.
const PROVIDER_DIRECTORY_CAP = 5_000;

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
        description="View and contact providers in your organization. Type / in the search box for slash commands."
      />

      {rows.length === 0 ? (
        <EmptyState
          title="No providers found"
          description="There are no active providers in your organization yet."
        />
      ) : (
        <ProvidersDirectoryClient providers={rows} />
      )}

      {/* EMR-667 — Ancillary Services directory (labs, imaging, pharmacy, dispensary) */}
      <div className="mt-12 pt-8 border-t border-border">
        <AncillaryServicesDirectory />
      </div>
    </PageShell>
  );
}
