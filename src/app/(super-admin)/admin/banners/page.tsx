import type { Metadata } from "next";

import { requireUser } from "@/lib/auth/session";
import { requireSuperAdmin } from "@/lib/auth/super-admin";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { PageShell } from "@/components/shell/PageHeader";
import { Eyebrow } from "@/components/ui/ornament";
import { Breadcrumbs } from "@/components/super-admin/breadcrumbs";
import { SYSTEM_BANNERS } from "@/lib/banners/config";
// Server-safe module (NOT the "use client" hook file) — a Server Component
// calling a fn exported from a "use client" module gets a client-reference
// proxy and 500s. See ./active-banners.
import { getActiveSystemBanners } from "@/lib/banners/active-banners";

export const metadata: Metadata = {
  title: "System banners — LeafJourney",
  description:
    "Read-only view of system-wide banners declared in lib/banners/config.ts.",
};

export const dynamic = "force-dynamic";

const SEVERITY_BADGE: Record<string, string> = {
  info: "bg-sky-100 text-sky-900 border border-sky-300",
  warning: "bg-amber-100 text-amber-900 border border-amber-300",
  danger: "bg-red-100 text-red-900 border border-red-300",
};

const CATEGORY_LABEL: Record<string, string> = {
  "system-health": "System health",
  maintenance: "Scheduled maintenance",
  announcement: "Announcement",
  billing: "Billing notice",
};

export default async function SystemBannersAdminPage() {
  // Super-admin gating: layout already runs requireSuperAdmin, but we
  // double-check here so a routing regression cannot accidentally expose
  // banner config to a non-super-admin.
  await requireUser();
  await requireSuperAdmin();

  const allBanners = SYSTEM_BANNERS;
  const activeClinician = getActiveSystemBanners({ surface: "clinician" });
  const activeOperator = getActiveSystemBanners({ surface: "operator" });

  return (
    <PageShell maxWidth="max-w-[1100px]">
      <Breadcrumbs
        items={[
          { label: "Operations", href: "/admin/hq" },
          { label: "System banners" },
        ]}
      />

      <header className="flex flex-col md:flex-row md:items-end md:justify-between gap-5 mb-10">
        <div>
          <Eyebrow className="mb-3">Internal</Eyebrow>
          <h1 className="font-display text-3xl md:text-4xl text-text tracking-tight leading-[1.1]">
            System banners
          </h1>
          <p className="text-[15px] text-text-muted mt-3 leading-relaxed max-w-2xl">
            Read-only viewer for the system-wide banner catalogue. Banners
            are declared statically in{" "}
            <code className="font-mono text-[13px] px-1 py-0.5 rounded bg-surface-raised border border-border">
              src/lib/banners/config.ts
            </code>{" "}
            and ship with a deploy. Toasts and the per-user notification
            center live elsewhere — this surface is reserved for
            system-wide status, maintenance, announcements, and important
            holds.
          </p>
        </div>
      </header>

      <div className="space-y-8">
        <Card>
          <CardHeader>
            <CardTitle>Active right now</CardTitle>
            <CardDescription>
              Banners currently rendered for each surface. A banner is
              active when <code className="font-mono text-[12px]">enabled: true</code>{" "}
              and its optional time window contains the current moment.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <ActiveSurfaceList
                heading="Clinician surface"
                banners={activeClinician.map((b) => b.id)}
              />
              <ActiveSurfaceList
                heading="Operator surface"
                banners={activeOperator.map((b) => b.id)}
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Catalogue</CardTitle>
            <CardDescription>
              Every banner declared in config. Order matches render order
              (earlier entries render on top).
            </CardDescription>
          </CardHeader>
          <CardContent>
            {allBanners.length === 0 ? (
              <p className="text-sm text-text-muted">
                No banners declared. Add one to{" "}
                <code className="font-mono text-[12px]">SYSTEM_BANNERS</code>{" "}
                in <code className="font-mono text-[12px]">src/lib/banners/config.ts</code>.
              </p>
            ) : (
              <ul className="divide-y divide-border">
                {allBanners.map((b) => (
                  <li
                    key={b.id}
                    className="py-4 flex flex-col md:flex-row md:items-start md:justify-between gap-3"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span
                          className={
                            "inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide " +
                            (SEVERITY_BADGE[b.severity] ?? "")
                          }
                        >
                          {b.severity}
                        </span>
                        <span className="inline-flex items-center rounded-full bg-surface-raised border border-border px-2 py-0.5 text-[11px] font-medium text-text-muted">
                          {CATEGORY_LABEL[b.category] ?? b.category}
                        </span>
                        <span
                          className={
                            "inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium " +
                            (b.enabled
                              ? "bg-emerald-100 text-emerald-900 border border-emerald-300"
                              : "bg-surface-raised text-text-subtle border border-border")
                          }
                        >
                          {b.enabled ? "enabled" : "disabled"}
                        </span>
                        {b.dismissible ? (
                          <span className="inline-flex items-center rounded-full bg-surface-raised border border-border px-2 py-0.5 text-[11px] font-medium text-text-muted">
                            dismissible
                          </span>
                        ) : null}
                      </div>
                      <p className="mt-2 text-[14px] text-text font-medium">
                        {b.message}
                      </p>
                      <p className="mt-1 text-[12px] text-text-subtle font-mono">
                        id: {b.id}
                      </p>
                      {b.ctaLabel && b.ctaHref ? (
                        <p className="mt-1 text-[12px] text-text-muted">
                          CTA: <span className="font-medium">{b.ctaLabel}</span>{" "}
                          → <code className="font-mono">{b.ctaHref}</code>
                        </p>
                      ) : null}
                      {b.startsAt || b.endsAt ? (
                        <p className="mt-1 text-[12px] text-text-muted">
                          Window: {b.startsAt ?? "—"} → {b.endsAt ?? "—"}
                        </p>
                      ) : null}
                      {b.surfaces && b.surfaces.length > 0 ? (
                        <p className="mt-1 text-[12px] text-text-muted">
                          Surfaces: {b.surfaces.join(", ")}
                        </p>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>How to edit</CardTitle>
            <CardDescription>
              Persistence is a TypeScript module today. This is intentional
              for v1.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ol className="list-decimal pl-5 space-y-2 text-[14px] text-text-muted leading-relaxed">
              <li>
                Open{" "}
                <code className="font-mono text-[12px]">
                  src/lib/banners/config.ts
                </code>{" "}
                and edit the{" "}
                <code className="font-mono text-[12px]">SYSTEM_BANNERS</code>{" "}
                array.
              </li>
              <li>
                Bump the <code className="font-mono text-[12px]">id</code>{" "}
                if you want users who previously dismissed the banner to
                see it again (dismissal is keyed by id in{" "}
                <code className="font-mono text-[12px]">localStorage</code>).
              </li>
              <li>Open a PR. Merge ships the banner to production.</li>
            </ol>
            <p className="mt-4 text-[12px] text-text-subtle border-l-2 border-border pl-3 leading-relaxed">
              Follow-up — tracked, not blocking: promote to a DB-backed{" "}
              <code className="font-mono">Banner</code> model + admin write
              surface (create / edit / schedule / target by org or role)
              when persistence requirements firm up. The hook contract in{" "}
              <code className="font-mono">system-banner-source.ts</code> is
              already shaped to swap the source from a static array to a
              fetch against <code className="font-mono">/api/status</code>{" "}
              or a future <code className="font-mono">/api/banners</code>{" "}
              endpoint without changing call sites.
            </p>
          </CardContent>
        </Card>
      </div>
    </PageShell>
  );
}

function ActiveSurfaceList({
  heading,
  banners,
}: {
  heading: string;
  banners: string[];
}) {
  return (
    <div>
      <h3 className="text-[13px] font-semibold uppercase tracking-wide text-text-muted mb-2">
        {heading}
      </h3>
      {banners.length === 0 ? (
        <p className="text-sm text-text-subtle italic">
          No active banners.
        </p>
      ) : (
        <ul className="space-y-1">
          {banners.map((id) => (
            <li
              key={id}
              className="font-mono text-[13px] text-text px-2 py-1 rounded bg-surface-raised border border-border"
            >
              {id}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
