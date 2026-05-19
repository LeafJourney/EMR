import * as React from "react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import {
  TemplateList,
  type TemplateRow,
} from "@/components/admin/template-list";
import { Breadcrumbs } from "@/components/super-admin/breadcrumbs";
// TODO(EMR-428): integrate once branch lands.
import { requireSuperAdmin } from "@/lib/auth/super-admin";
// TODO(EMR-408): integrate once branch lands.
import { listActiveSpecialtyTemplates } from "@/lib/specialty-templates/registry";
import { prisma } from "@/lib/db/prisma";

export const dynamic = "force-dynamic";

interface RegistryManifest {
  slug: string;
  name: string;
  version: string;
  description?: string | null;
  icon?: string | null;
  modalities?: {
    included?: ReadonlyArray<{ id: string }>;
    excluded?: ReadonlyArray<{ id: string }>;
  };
}

const CANNABIS_MODALITY_IDS = new Set(["cannabis", "medical-cannabis"]);

function manifestHasCannabisModality(m: RegistryManifest): boolean {
  // Treat all specialties with equal visual weight — this flag is metadata,
  // never a branching condition for behavior.
  const included = m.modalities?.included ?? [];
  return included.some((mod) => CANNABIS_MODALITY_IDS.has(mod.id));
}

async function loadDependentPracticeCounts(
  slugs: string[]
): Promise<Record<string, number>> {
  if (slugs.length === 0) return {};
  // TODO(EMR-407): swap to a typed Prisma model once `practiceConfiguration`
  // is added to the schema. For v1 we tolerate the model not yet existing —
  // wrapping in try/catch keeps the admin browser usable in environments
  // where the migration hasn't run yet.
  try {
    const client = prisma as unknown as {
      practiceConfiguration?: {
        groupBy: (args: {
          by: ["selectedSpecialty"];
          where: { status: string; selectedSpecialty: { in: string[] } };
          _count: { _all: true };
        }) => Promise<
          Array<{ selectedSpecialty: string; _count: { _all: number } }>
        >;
      };
    };
    if (!client.practiceConfiguration) return {};
    const grouped = await client.practiceConfiguration.groupBy({
      by: ["selectedSpecialty"],
      where: { status: "published", selectedSpecialty: { in: slugs } },
      _count: { _all: true },
    });
    return Object.fromEntries(
      grouped.map((g) => [g.selectedSpecialty, g._count._all])
    );
  } catch (err) {
    console.error("[templates] dependent practice count failed:", err);
    return {};
  }
}

export default async function SpecialtyTemplatesPage() {
  await requireSuperAdmin();

  const manifests = (await listActiveSpecialtyTemplates()) as RegistryManifest[];
  const slugs = manifests.map((m) => m.slug);
  const counts = await loadDependentPracticeCounts(slugs);

  const rows: TemplateRow[] = manifests
    .map((m) => ({
      slug: m.slug,
      name: m.name,
      version: m.version,
      description: m.description ?? null,
      icon: m.icon ?? null,
      includedModalitiesCount: m.modalities?.included?.length ?? 0,
      excludedModalitiesCount: m.modalities?.excluded?.length ?? 0,
      hasCannabisModality: manifestHasCannabisModality(m),
      dependentPracticesCount: counts[m.slug] ?? 0,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div className="mx-auto max-w-6xl px-6 py-10">
      <Breadcrumbs
        items={[
          { label: "HQ", href: "/admin/hq" },
          { label: "Operations" },
          { label: "Templates" },
        ]}
      />
      <Card>
        <CardHeader>
          <p className="text-[11px] uppercase tracking-wide text-text-subtle font-medium">
            Super admin
          </p>
          <h1 className="font-display text-2xl font-medium text-text tracking-tight mt-1">
            Specialty Templates
          </h1>
          <p className="text-sm text-text-muted mt-2 max-w-2xl">
            Read-only browser for the specialty template registry. Edits are
            made via pull request to{" "}
            <code className="text-xs bg-surface-muted px-1.5 py-0.5 rounded">
              src/lib/specialty-templates/manifests/
            </code>
            . To request a change, ping{" "}
            <span className="font-medium text-text">#onboarding-controller</span>.
          </p>
        </CardHeader>
        <CardContent>
          <TemplateList rows={rows} />
        </CardContent>
      </Card>
    </div>
  );
}
