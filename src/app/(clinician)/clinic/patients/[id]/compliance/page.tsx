import { notFound } from "next/navigation";
import { prisma } from "@/lib/db/prisma";
import { requireUser } from "@/lib/auth/session";
import { PageShell } from "@/components/shell/PageHeader";
import {
  getAvailableStates,
  getStateForm,
  autoPopulateForm,
} from "@/lib/domain/state-compliance";
import { ComplianceFormView } from "./compliance-form";
import type {
  ComplianceFormDto,
  ComplianceFormStatus,
  RegistryAttempt,
} from "./actions";

interface PageProps {
  params: { id: string };
}

// Mirrors the (non-exportable) serializer in ./actions.ts — "use server"
// modules may only export async functions, so the row→DTO mapping for the
// initial page load lives here.
const REGISTRY_ATTEMPT_KEY = "__registrySubmission";

function rowToDto(row: {
  id: string;
  patientId: string;
  stateCode: string;
  formTemplateId: string;
  formName: string;
  fields: unknown;
  status: string;
  signedBy: string | null;
  signedAt: Date | null;
  submittedAt: Date | null;
}): ComplianceFormDto {
  const values: Record<string, string | boolean> = {};
  let registrySubmission: RegistryAttempt | null = null;
  if (row.fields && typeof row.fields === "object" && !Array.isArray(row.fields)) {
    for (const [key, value] of Object.entries(
      row.fields as Record<string, unknown>,
    )) {
      if (key === REGISTRY_ATTEMPT_KEY) {
        if (value && typeof value === "object" && !Array.isArray(value)) {
          registrySubmission = value as unknown as RegistryAttempt;
        }
        continue;
      }
      if (typeof value === "string" || typeof value === "boolean") {
        values[key] = value;
      }
    }
  }
  return {
    id: row.id,
    patientId: row.patientId,
    stateCode: row.stateCode,
    formTemplateId: row.formTemplateId,
    formName: row.formName,
    fields: values,
    status: row.status as ComplianceFormStatus,
    signedBy: row.signedBy,
    signedAt: row.signedAt?.toISOString() ?? null,
    submittedAt: row.submittedAt?.toISOString() ?? null,
    registrySubmission,
  };
}

export const metadata = { title: "State Compliance" };

export default async function CompliancePage({ params }: PageProps) {
  const user = await requireUser();

  const patient = await prisma.patient.findFirst({
    where: {
      id: params.id,
      organizationId: user.organizationId!,
      deletedAt: null,
    },
  });

  if (!patient) notFound();

  // Load provider data for auto-population
  const provider = user.organizationId
    ? await prisma.provider.findFirst({
        where: { organizationId: user.organizationId },
        include: { user: true },
      })
    : null;

  // Load the latest encounter for service date context
  const latestEncounter = await prisma.encounter.findFirst({
    where: { patientId: params.id },
    orderBy: { scheduledFor: "desc" },
  });

  // EMR-1095 — load persisted compliance forms so a reload no longer loses
  // drafts/signatures. One (latest) row per state hydrates the client form.
  const existingRows = await prisma.stateComplianceForm.findMany({
    where: { patientId: params.id, organizationId: user.organizationId! },
    orderBy: { updatedAt: "desc" },
  });
  const existingForms: Record<string, ComplianceFormDto> = {};
  for (const row of existingRows) {
    if (!existingForms[row.stateCode]) existingForms[row.stateCode] = rowToDto(row);
  }

  // Determine default state from patient address
  const defaultStateCode = patient.state ?? "CA";
  const availableStates = getAvailableStates();
  const defaultTemplate = getStateForm(defaultStateCode);

  // Auto-populate form fields from patient/encounter/provider data
  const prePopulated = defaultTemplate
    ? autoPopulateForm(
        defaultTemplate,
        {
          firstName: patient.firstName,
          lastName: patient.lastName,
          dateOfBirth: patient.dateOfBirth,
          addressLine1: patient.addressLine1,
          city: patient.city,
          state: patient.state,
          postalCode: patient.postalCode,
          id: patient.id,
        },
        provider
          ? {
              firstName: provider.user.firstName,
              lastName: provider.user.lastName,
              title: provider.title,
            }
          : undefined,
        latestEncounter
          ? { scheduledFor: latestEncounter.scheduledFor }
          : undefined,
      )
    : {};

  return (
    <PageShell maxWidth="max-w-[1200px]">
      <ComplianceFormView
        patient={{
          id: patient.id,
          firstName: patient.firstName,
          lastName: patient.lastName,
          dateOfBirth: patient.dateOfBirth?.toISOString() ?? null,
          addressLine1: patient.addressLine1 ?? null,
          city: patient.city ?? null,
          state: patient.state ?? null,
          postalCode: patient.postalCode ?? null,
        }}
        availableStates={availableStates}
        defaultStateCode={defaultStateCode}
        prePopulatedFields={prePopulated}
        existingForms={existingForms}
      />
    </PageShell>
  );
}
