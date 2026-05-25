// EMR-447 — PracticeAdminShell renderer
//
// Read-only home view for a practice admin. Driven entirely by the practice's
// published `PracticeConfiguration` plus the related `Practice` row. Practice
// admins see what was configured for their practice — they cannot edit. Edits
// happen in the controller wizard, scoped to implementation_admin / super_admin
// (see EMR-428).
//
// Architecture invariants (HARD constraints — see CLAUDE.md / Epic 2):
//   - LeafJourney is specialty-adaptive, NOT cannabis-first. Nothing in this
//     file branches on `selectedSpecialty === 'cannabis-medicine'`. Cannabis
//     surfacing here is a *compliance signal* — when cannabis-medicine appears
//     in `disabledModalities` we render it with a warning tone so a practice
//     admin can verify the bleed-gate is locked. That is metadata, not a
//     code path.
//   - Specialty display name comes from the registered manifest. If the slug
//     is unknown we render the slug verbatim and surface a soft warning —
//     never throw, since a published config might reference a manifest that
//     was renamed in main since publish.
//
// Scope (EMR-447):
//   - Renders the practice header, configuration summary, applied template
//     versions (slugs only — versioning UI is EMR-471 / EMR-431), and three
//     forward-link admin action cards (users / schedule / billing).
//   - Does NOT render template contents — only slugs. EMR-471 owns rich
//     template rendering.
//   - Does NOT mount any edit UI.

import * as React from "react";
import Link from "next/link";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PageHeader, PageShell } from "@/components/shell/PageHeader";
import { RouterRefreshFreshness } from "@/components/ui/freshness-indicator.client";
import type { PracticeConfiguration } from "@/lib/practice-config/types";

// EMR-410 (`@/lib/modality/registry`) is in flight in this storm but not yet
// merged. We keep a local minimal display map keyed on the modality slugs that
// `manifest-schema.REGISTERED_MODALITIES` already enumerates. When EMR-410
// lands, swap to `MODALITY_META` from that registry. The shape is intentionally
// the same so the swap is mechanical.
const MODALITY_DISPLAY: Record<string, string> = {
  medications: "Medications",
  "pain-medications": "Pain medications",
  labs: "Labs",
  imaging: "Imaging",
  referrals: "Referrals",
  procedures: "Procedures",
  lifestyle: "Lifestyle",
  "physical-therapy": "Physical therapy",
  "functional-pain": "Functional pain",
  "patient-reported-outcomes": "Patient-reported outcomes",
  "cannabis-medicine": "Cannabis medicine",
  "commerce-leafmart": "Leafmart commerce",
};

const CANNABIS_MODALITY_SLUG = "cannabis-medicine";

function modalityLabel(slug: string): string {
  return MODALITY_DISPLAY[slug] ?? slug;
}

/** A minimal "this surface isn't built yet" footer for forward-link cards. */
function UnimplementedNotice() {
  return (
    <p className="text-[11px] uppercase tracking-wide text-text-subtle font-medium mt-2">
      Coming soon
    </p>
  );
}

/** The Practice row fields the shell renders. Keeping this narrow lets the
 *  page query exactly what it needs and makes server/test wiring trivial. */
export interface PracticeSummary {
  id: string;
  name: string;
  brandName: string | null;
  npi: string | null;
  street: string | null;
  city: string | null;
  state: string | null;
  postalCode: string | null;
}

export interface PracticeAdminShellProps {
  config: PracticeConfiguration;
  practice: PracticeSummary;
  /** When the practice admin is in multiple orgs, the page passes a picker
   *  so the user can switch which practice they're viewing. The shell just
   *  renders it — picking is the page's responsibility. */
  picker?: React.ReactNode;
  /** Display name of the selected specialty. Passed from caller so this
   *  component remains client-safe (no server registry imports). */
  specialtyName?: string;
}

function formatAddress(p: PracticeSummary): string | null {
  const parts: string[] = [];
  if (p.street) parts.push(p.street);
  const cityState = [p.city, p.state].filter(Boolean).join(", ");
  if (cityState) parts.push(cityState);
  if (p.postalCode) parts.push(p.postalCode);
  return parts.length > 0 ? parts.join(" · ") : null;
}

export function PracticeAdminShell({
  config,
  practice,
  picker,
  specialtyName,
}: PracticeAdminShellProps) {

  const enabled = config.enabledModalities ?? [];
  const disabled = config.disabledModalities ?? [];
  const cannabisDisabled = disabled.includes(CANNABIS_MODALITY_SLUG);
  const otherDisabled = disabled.filter((m) => m !== CANNABIS_MODALITY_SLUG);

  const address = formatAddress(practice);

  const adminActions: Array<{
    href: string;
    title: string;
    description: string;
  }> = [
    {
      href: "/practice-admin/users",
      title: "Manage users",
      description:
        "Invite clinicians, operators, and additional admins to this practice.",
    },
    {
      href: "/practice-admin/schedule",
      title: "Schedule",
      description:
        "Configure clinic hours, provider availability, and appointment types.",
    },
    {
      href: "/practice-admin/billing",
      title: "Billing",
      description:
        "Review claims, fee schedules, and payer configuration for the practice.",
    },
  ];

  return (
    <PageShell maxWidth="max-w-[1100px]">
      {picker ? <div className="mb-6">{picker}</div> : null}

      <PageHeader
        eyebrow="Practice admin"
        title={practice.brandName ?? practice.name}
        description="Read-only view of your practice's published configuration. To request a change, contact your LeafJourney implementation team."
        actions={<RouterRefreshFreshness since={new Date().toISOString()} />}
      />

      <div className="grid grid-cols-1 gap-6">
        {/* 1. Practice header */}
        <Card>
          <CardHeader>
            <CardTitle>Practice</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field label="Practice name" value={practice.name} />
            <Field
              label="Brand name"
              value={practice.brandName ?? "—"}
              muted={!practice.brandName}
            />
            <Field
              label="NPI"
              value={practice.npi ?? "Not on file"}
              muted={!practice.npi}
            />
            <Field
              label="Address"
              value={address ?? "Not on file"}
              muted={!address}
            />
          </CardContent>
        </Card>

        {/* 2. Configuration summary */}
        <Card>
          <CardHeader>
            <CardTitle>Configuration summary</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Field
                label="Specialty"
                value={
                  config.selectedSpecialty ? (
                    <span className="flex flex-col">
                      <span className="text-text">
                        {specialtyName ?? config.selectedSpecialty}
                      </span>
                      <code className="text-[11px] text-text-subtle bg-surface-muted px-1.5 py-0.5 rounded mt-1 self-start">
                        {config.selectedSpecialty}
                      </code>
                    </span>
                  ) : (
                    "Not set"
                  )
                }
                muted={!config.selectedSpecialty}
              />
              <Field
                label="Care model"
                value={config.careModel ?? "Not set"}
                muted={!config.careModel}
              />
            </div>

            <div>
              <Eyebrow>Enabled modalities</Eyebrow>
              {enabled.length === 0 ? (
                <p className="text-sm text-text-muted mt-2">
                  No modalities enabled.
                </p>
              ) : (
                <div className="flex flex-wrap gap-2 mt-2">
                  {enabled.map((slug) => (
                    <Badge key={slug} tone="accent">
                      {modalityLabel(slug)}
                    </Badge>
                  ))}
                </div>
              )}
            </div>

            <div>
              <Eyebrow>Disabled modalities</Eyebrow>
              {disabled.length === 0 ? (
                <p className="text-sm text-text-muted mt-2">
                  No modalities explicitly disabled.
                </p>
              ) : (
                <div className="flex flex-wrap gap-2 mt-2">
                  {/* Compliance signal: cannabis-medicine surfaces with a
                      warning tone so the admin can verify the bleed-gate. */}
                  {cannabisDisabled && (
                    <Badge
                      tone="warning"
                      title="Cannabis-medicine is explicitly disabled for this practice (compliance gate)."
                    >
                      {modalityLabel(CANNABIS_MODALITY_SLUG)} · disabled
                    </Badge>
                  )}
                  {otherDisabled.map((slug) => (
                    <Badge key={slug} tone="neutral">
                      {modalityLabel(slug)}
                    </Badge>
                  ))}
                </div>
              )}
            </div>

            <div>
              <Eyebrow>Applied template versions</Eyebrow>
              <dl className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-3 mt-2">
                <TemplateRow
                  label="Workflow templates"
                  values={config.workflowTemplateIds ?? []}
                />
                <TemplateRow
                  label="Charting templates"
                  values={config.chartingTemplateIds ?? []}
                />
                <TemplateRow
                  label="Role / permission templates"
                  values={config.rolePermissionTemplateIds ?? []}
                />
                <TemplateRow
                  label="Patient shell"
                  values={
                    config.patientShellTemplateId
                      ? [config.patientShellTemplateId]
                      : []
                  }
                />
                <TemplateRow
                  label="Physician shell"
                  values={
                    config.physicianShellTemplateId
                      ? [config.physicianShellTemplateId]
                      : []
                  }
                />
              </dl>
              <p className="text-[11px] text-text-subtle mt-3">
                Versioning UI lands in EMR-471 / EMR-431. v1 surfaces template
                slugs only.
              </p>
            </div>
          </CardContent>
        </Card>

        {/* 3. Practice-level admin actions (forward links, no functional buttons) */}
        <div>
          <h2 className="font-display text-lg font-medium text-text tracking-tight mb-3">
            Practice admin actions
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {adminActions.map((action) => (
              <Link
                key={action.href}
                href={action.href}
                className="group rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
              >
                <Card
                  tone="outlined"
                  className="h-full transition-all duration-200 group-hover:border-border-strong group-hover:shadow-md"
                >
                  <CardHeader>
                    <CardTitle>{action.title}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-text-muted">
                      {action.description}
                    </p>
                    <UnimplementedNotice />
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        </div>
      </div>
    </PageShell>
  );
}

// --- small private helpers ---------------------------------------------------

function Field({
  label,
  value,
  muted,
}: {
  label: string;
  value: React.ReactNode;
  muted?: boolean;
}) {
  return (
    <div>
      <Eyebrow>{label}</Eyebrow>
      <div
        className={
          "text-sm mt-1.5 " + (muted ? "text-text-subtle" : "text-text")
        }
      >
        {value}
      </div>
    </div>
  );
}

function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[11px] uppercase tracking-wide text-text-subtle font-medium">
      {children}
    </p>
  );
}

function TemplateRow({ label, values }: { label: string; values: string[] }) {
  return (
    <div className="flex flex-col">
      <dt className="text-[11px] uppercase tracking-wide text-text-subtle font-medium">
        {label}
      </dt>
      <dd className="mt-1.5">
        {values.length === 0 ? (
          <span className="text-sm text-text-subtle">None</span>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {values.map((slug) => (
              <code
                key={slug}
                className="text-[11px] text-text bg-surface-muted px-1.5 py-0.5 rounded"
              >
                {slug}
              </code>
            ))}
          </div>
        )}
      </dd>
    </div>
  );
}
