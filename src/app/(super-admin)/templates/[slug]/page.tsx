import * as React from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import {
  TemplateDetail,
  type DependentPractice,
} from "@/components/admin/template-detail";
import { Breadcrumbs } from "@/components/super-admin/breadcrumbs";
// TODO(EMR-428): integrate once branch lands.
import { requireSuperAdmin } from "@/lib/auth/super-admin";
// TODO(EMR-408): integrate once branch lands.
import { getSpecialtyTemplate } from "@/lib/specialty-templates/registry";
import { prisma } from "@/lib/db/prisma";

export const dynamic = "force-dynamic";

async function loadDependentPractices(
  slug: string
): Promise<DependentPractice[]> {
  // TODO(EMR-407): swap to a typed Prisma model once `practiceConfiguration`
  // is added to the schema. For v1 we tolerate the model not yet existing.
  try {
    const client = prisma as unknown as {
      practiceConfiguration?: {
        findMany: (args: {
          where: { selectedSpecialty: string; status: string };
          select: { id: true; practiceName: true; organizationId: true };
          orderBy: { practiceName: "asc" };
        }) => Promise<
          Array<{ id: string; practiceName: string; organizationId: string }>
        >;
      };
    };
    if (!client.practiceConfiguration) return [];
    const rows = await client.practiceConfiguration.findMany({
      where: { selectedSpecialty: slug, status: "published" },
      select: { id: true, practiceName: true, organizationId: true },
      orderBy: { practiceName: "asc" },
    });
    return rows.map((r) => ({
      id: r.id,
      name: r.practiceName,
      // Internal super-admin link to the practice configuration view.
      configHref: `/ops/onboarding/practices/${r.organizationId}`,
    }));
  } catch (err) {
    console.error("[templates] dependent practice lookup failed:", err);
    return [];
  }
}

export default async function SpecialtyTemplateDetailPage({
  params,
}: {
  params: { slug: string };
}) {
  await requireSuperAdmin();

  const manifest = await getSpecialtyTemplate(params.slug);
  if (!manifest) {
    notFound();
  }

  const dependentPractices = await loadDependentPractices(params.slug);

  const templateName = (manifest as { name: string }).name;

  return (
    <div className="mx-auto max-w-5xl px-6 py-10 space-y-5">
      <Breadcrumbs
        items={[
          { label: "HQ", href: "/admin/hq" },
          { label: "Operations" },
          { label: "Templates", href: "/templates" },
          { label: templateName },
        ]}
      />
      <div className="flex items-center gap-3 text-xs text-text-subtle">
        <Link
          href="/templates"
          className="hover:text-text transition-colors"
        >
          ← All specialty templates
        </Link>
      </div>

      <Card>
        <CardHeader>
          <p className="text-[11px] uppercase tracking-wide text-text-subtle font-medium">
            Super admin · Specialty template
          </p>
          <h1 className="font-display text-2xl font-medium text-text tracking-tight mt-1">
            {templateName}
          </h1>
          <p className="text-sm text-text-muted mt-2">
            Templates are edited via pull request to{" "}
            <code className="text-xs bg-surface-muted px-1.5 py-0.5 rounded">
              src/lib/specialty-templates/manifests/
            </code>
            . To request a change, ping{" "}
            <span className="font-medium text-text">#onboarding-controller</span>.
          </p>
        </CardHeader>
        <CardContent>
          <TemplateDetail
            manifest={manifest}
            dependentPractices={dependentPractices}
          />
        </CardContent>
      </Card>
    </div>
  );
}
