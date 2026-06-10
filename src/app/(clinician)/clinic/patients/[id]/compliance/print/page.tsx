// /clinic/patients/[id]/compliance/print — print-ready state compliance form.
//
// WS-C task 5 (EMR-1096 follow-on). The manual-filing path tells the physician
// to "print the packet for manual filing"; this is that packet. It mirrors the
// note print pattern (notes/[noteId]/print/page.tsx): a server-rendered,
// letterhead-styled view of the signed `StateComplianceForm` that auto-opens
// the browser print dialog.
//
// Targeted by `?formId=` (preferred — set by the compliance form's amber
// notices) or `?state=` (latest row for that state). Falls back to the latest
// form on file for the patient.

import { notFound } from "next/navigation";
import { prisma } from "@/lib/db/prisma";
import { requireUser } from "@/lib/auth/session";
import { formatDate } from "@/lib/utils/format";
import { getStateForm } from "@/lib/domain/state-compliance";
import { getRegistryForState } from "@/lib/domain/state-registry";
import {
  PrintDocument,
  PrintSection,
  PrintField,
} from "@/components/print/PrintDocument";

// Reserved key inside the `fields` JSON that holds the registry submission
// attempt (mirrors compliance/actions.ts). Never rendered as a form field.
const REGISTRY_ATTEMPT_KEY = "__registrySubmission";

interface PageProps {
  params: { id: string };
  searchParams?: { formId?: string; state?: string };
}

export const metadata = { title: "State compliance form — print" };

const STATUS_LABEL: Record<string, string> = {
  draft: "Draft — not signed",
  complete: "Signed",
  submitted: "Submitted to registry",
};

function renderValue(value: string | boolean, type?: string): string {
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (type === "checkbox") return value === "true" ? "Yes" : "No";
  return value;
}

export default async function CompliancePrintPage({
  params,
  searchParams,
}: PageProps) {
  const user = await requireUser();

  // Org-scoped lookup — by id when provided, otherwise the latest row for the
  // patient (optionally filtered to a state).
  const form = searchParams?.formId
    ? await prisma.stateComplianceForm.findFirst({
        where: {
          id: searchParams.formId,
          patientId: params.id,
          organizationId: user.organizationId!,
        },
      })
    : await prisma.stateComplianceForm.findFirst({
        where: {
          patientId: params.id,
          organizationId: user.organizationId!,
          ...(searchParams?.state
            ? { stateCode: searchParams.state.toUpperCase() }
            : {}),
        },
        orderBy: { updatedAt: "desc" },
      });

  if (!form) notFound();

  const patient = await prisma.patient.findFirst({
    where: {
      id: params.id,
      organizationId: user.organizationId!,
      deletedAt: null,
    },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      dateOfBirth: true,
    },
  });
  if (!patient) notFound();

  const template = getStateForm(form.stateCode);
  const registry = getRegistryForState(form.stateCode);
  const practiceName = user.organizationName ?? "Leafjourney";

  // Split the persisted field values from the reserved registry-attempt key.
  const rawFields =
    form.fields && typeof form.fields === "object" && !Array.isArray(form.fields)
      ? (form.fields as Record<string, unknown>)
      : {};
  const values: Record<string, string | boolean> = {};
  for (const [key, value] of Object.entries(rawFields)) {
    if (key === REGISTRY_ATTEMPT_KEY) continue;
    if (typeof value === "string" || typeof value === "boolean") {
      values[key] = value;
    }
  }

  const dob = patient.dateOfBirth ? new Date(patient.dateOfBirth) : null;
  const age = dob
    ? Math.floor((Date.now() - dob.getTime()) / (365.25 * 24 * 60 * 60 * 1000))
    : null;
  const dobLabel = dob
    ? `${formatDate(dob)}${age !== null ? ` (${age} y/o)` : ""}`
    : null;

  // Template-ordered fields (signature handled separately in its own section).
  const fieldRows = (template?.requiredFields ?? [])
    .filter((f) => f.type !== "signature")
    .map((f) => ({
      key: f.key,
      label: f.label,
      value:
        values[f.key] !== undefined
          ? renderValue(values[f.key], f.type)
          : "—",
    }));

  const providerName = form.signedBy ?? `${user.firstName} ${user.lastName}`.trim();
  const electronic = registry?.supportsElectronicSubmission ?? false;

  return (
    <PrintDocument
      eyebrow="State compliance"
      title={form.formName}
      practiceName={practiceName}
      patientName={`${patient.firstName} ${patient.lastName}`}
      patientDob={dobLabel}
      patientMrn={patient.id.slice(0, 12).toUpperCase()}
      providerName={providerName}
    >
      <PrintSection heading="Certification">
        <div className="doc-grid">
          <PrintField label="State" value={form.stateCode} />
          <PrintField label="Form" value={`${form.formName} (${form.formTemplateId})`} />
          <PrintField
            label="Status"
            value={STATUS_LABEL[form.status] ?? form.status}
          />
          <PrintField
            label="Signed"
            value={
              form.signedAt
                ? `${form.signedBy ?? "—"} · ${formatDate(form.signedAt)}`
                : "Not signed"
            }
          />
        </div>
      </PrintSection>

      <PrintSection heading="Form fields">
        {fieldRows.length === 0 ? (
          <p style={{ margin: 0, color: "#6e6e73" }}>No fields recorded.</p>
        ) : (
          <div className="doc-grid">
            {fieldRows.map((f) => (
              <PrintField key={f.key} label={f.label} value={f.value} />
            ))}
          </div>
        )}
      </PrintSection>

      <PrintSection heading="Filing instructions">
        {electronic ? (
          <p style={{ margin: 0, fontSize: "11pt", lineHeight: 1.55 }}>
            {registry?.stateName ?? form.stateCode} supports electronic
            submission via {registry?.registryName ?? "the state registry"}.
            {form.status === "submitted"
              ? " This certification has been submitted electronically."
              : " Submit electronically from the compliance screen, or file this printed copy if submitting by mail."}
          </p>
        ) : (
          <p style={{ margin: 0, fontSize: "11pt", lineHeight: 1.55 }}>
            {registry?.stateName ?? form.stateCode} does not support electronic
            submission. Print this packet and file it with{" "}
            {registry?.registryName ?? "the state registry"} per state
            instructions. No electronic submission was made and no confirmation
            number exists.
          </p>
        )}
      </PrintSection>
    </PrintDocument>
  );
}
