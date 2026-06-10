"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { StateComplianceForm } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { requireUser } from "@/lib/auth/session";
import { hasPermission } from "@/lib/rbac/permissions";
import {
  getStateForm,
  type StateFormTemplate,
} from "@/lib/domain/state-compliance";
import { submitToStateRegistry } from "@/lib/integrations/state-registries";

// ─── Shared shapes ──────────────────────────────────────

/**
 * Reserved key inside the `fields` JSON column where the latest registry
 * submission attempt is recorded. Template field keys are plain camelCase
 * identifiers, so the dunder prefix can never collide.
 */
const REGISTRY_ATTEMPT_KEY = "__registrySubmission";

/**
 * EMR-1096 (B3) — the persisted record of a registry submission attempt.
 * `mode: "manual_stub"` means NOTHING was transmitted (no API connected for
 * the state); the UI must surface that as "manual filing required", never as
 * an electronic success, and there is never a fabricated confirmation number.
 */
export interface RegistryAttempt {
  mode: "api" | "manual_stub";
  success: boolean;
  confirmationNumber: string | null;
  registryPatientId: string | null;
  expirationDate: string | null;
  errors: string[] | null;
  attemptedAt: string;
}

export type ComplianceFormStatus = "draft" | "complete" | "submitted";

/** Serialized StateComplianceForm row, safe to hand to the client. */
export interface ComplianceFormDto {
  id: string;
  patientId: string;
  stateCode: string;
  formTemplateId: string;
  formName: string;
  fields: Record<string, string | boolean>;
  status: ComplianceFormStatus;
  signedBy: string | null;
  signedAt: string | null;
  submittedAt: string | null;
  registrySubmission: RegistryAttempt | null;
}

export type FieldErrors = Record<string, string>;

export type ComplianceFormActionResult =
  | { ok: true; form: ComplianceFormDto; missingRequired?: FieldErrors }
  | {
      ok: false;
      error: string;
      fieldErrors?: FieldErrors;
      /** Present when the row was still updated (e.g. a failed registry
       * attempt is persisted so the chart shows what happened). */
      form?: ComplianceFormDto;
    };

// ─── Helpers ────────────────────────────────────────────

function splitFields(fieldsJson: unknown): {
  values: Record<string, string | boolean>;
  registryAttempt: RegistryAttempt | null;
} {
  const values: Record<string, string | boolean> = {};
  let registryAttempt: RegistryAttempt | null = null;
  if (fieldsJson && typeof fieldsJson === "object" && !Array.isArray(fieldsJson)) {
    for (const [key, value] of Object.entries(
      fieldsJson as Record<string, unknown>,
    )) {
      if (key === REGISTRY_ATTEMPT_KEY) {
        if (value && typeof value === "object" && !Array.isArray(value)) {
          registryAttempt = value as unknown as RegistryAttempt;
        }
        continue;
      }
      if (typeof value === "string" || typeof value === "boolean") {
        values[key] = value;
      }
    }
  }
  return { values, registryAttempt };
}

function toDto(row: StateComplianceForm): ComplianceFormDto {
  const { values, registryAttempt } = splitFields(row.fields);
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
    registrySubmission: registryAttempt,
  };
}

/**
 * EMR-1102 (M7) — server-side required-field validation against the state
 * template. Returns a per-field error map the client renders inline. The
 * signature field is satisfied by `signed` (it lives on the row as
 * signedBy/signedAt, not in the fields JSON).
 */
function validateRequiredFields(
  template: StateFormTemplate,
  values: Record<string, string | boolean>,
  signed: boolean,
): FieldErrors {
  const errors: FieldErrors = {};
  for (const field of template.requiredFields) {
    if (!field.required) continue;
    if (field.type === "signature") {
      if (!signed) errors[field.key] = "Signature is required.";
      continue;
    }
    const value = values[field.key];
    if (field.type === "checkbox") {
      if (value !== true) errors[field.key] = `${field.label} must be confirmed.`;
      continue;
    }
    if (value === undefined || value === null || String(value).trim() === "") {
      errors[field.key] = `${field.label} is required.`;
    }
  }
  return errors;
}

async function loadOrgForm(formId: string, organizationId: string) {
  return prisma.stateComplianceForm.findFirst({
    where: { id: formId, organizationId },
  });
}

// ─── Save (draft upsert) ────────────────────────────────

const savePayloadSchema = z.object({
  patientId: z.string().min(1),
  stateCode: z.string().length(2),
  encounterId: z.string().optional(),
  fields: z.record(z.union([z.string(), z.boolean()])),
});

export type SaveCompliancePayload = z.infer<typeof savePayloadSchema>;

/**
 * EMR-1095 (B2) — persist the compliance form as a draft. Upserts the
 * latest StateComplianceForm row for the patient+state (the model has no
 * unique constraint, so we find-then-update). Drafts are allowed to be
 * incomplete; any still-missing required fields are returned as
 * `missingRequired` so the client can hint inline. Hard required-field
 * enforcement happens at sign/submit time (M7).
 */
export async function saveComplianceForm(
  payload: SaveCompliancePayload,
): Promise<ComplianceFormActionResult> {
  const user = await requireUser();
  if (!hasPermission(user, "notes.edit")) {
    return { ok: false, error: "Forbidden: read-only access to compliance forms." };
  }

  const parsed = savePayloadSchema.safeParse(payload);
  if (!parsed.success) return { ok: false, error: "Invalid input." };

  const stateCode = parsed.data.stateCode.toUpperCase();
  const template = getStateForm(stateCode);
  if (!template) {
    return { ok: false, error: `No compliance form template for state: ${stateCode}` };
  }

  // Org-scoped patient lookup — never trust a bare patient id.
  const patient = await prisma.patient.findFirst({
    where: {
      id: parsed.data.patientId,
      organizationId: user.organizationId!,
      deletedAt: null,
    },
  });
  if (!patient) return { ok: false, error: "Patient not found." };

  // Server-side allowlist: only persist keys the template defines.
  const templateKeys = new Set(template.requiredFields.map((f) => f.key));
  const values: Record<string, string | boolean> = {};
  for (const [key, value] of Object.entries(parsed.data.fields)) {
    if (templateKeys.has(key)) values[key] = value;
  }

  const existing = await prisma.stateComplianceForm.findFirst({
    where: {
      patientId: patient.id,
      organizationId: user.organizationId!,
      stateCode,
    },
    orderBy: { updatedAt: "desc" },
  });

  // A signed/submitted certification is a locked record — editing it would
  // invalidate the signature. Mirrors the signed-note guard.
  if (existing && existing.status !== "draft") {
    return {
      ok: false,
      error: "This form is signed and can no longer be edited.",
      form: toDto(existing),
    };
  }

  const row = existing
    ? await prisma.stateComplianceForm.update({
        where: { id: existing.id },
        data: {
          fields: values as any,
          formTemplateId: template.formId,
          formName: template.formName,
          encounterId: parsed.data.encounterId ?? existing.encounterId,
        },
      })
    : await prisma.stateComplianceForm.create({
        data: {
          organizationId: user.organizationId!,
          patientId: patient.id,
          encounterId: parsed.data.encounterId ?? null,
          stateCode,
          formTemplateId: template.formId,
          formName: template.formName,
          fields: values as any,
          status: "draft",
        },
      });

  revalidatePath(`/clinic/patients/${patient.id}/compliance`);

  const missing = validateRequiredFields(template, values, false);
  return {
    ok: true,
    form: toDto(row),
    missingRequired: Object.keys(missing).length > 0 ? missing : undefined,
  };
}

// ─── Sign ───────────────────────────────────────────────

/**
 * EMR-1095 (B2) + EMR-1102 (M7) — electronically sign a compliance form.
 * Re-validates required fields server-side (the signature itself is being
 * supplied by this call), then records signer + server timestamp and moves
 * the row to "complete". Audit-logged: a physician certification signature
 * is a legal act.
 */
export async function signComplianceForm(
  formId: string,
): Promise<ComplianceFormActionResult> {
  const user = await requireUser();
  if (!hasPermission(user, "notes.edit")) {
    return { ok: false, error: "Forbidden: you cannot sign compliance forms." };
  }
  if (!formId || typeof formId !== "string") {
    return { ok: false, error: "Invalid input." };
  }

  const form = await loadOrgForm(formId, user.organizationId!);
  if (!form) return { ok: false, error: "Form not found." };
  if (form.status === "submitted") {
    return { ok: false, error: "This form has already been submitted." };
  }
  if (form.signedAt) {
    return { ok: false, error: "This form is already signed.", form: toDto(form) };
  }

  const template = getStateForm(form.stateCode);
  if (!template) {
    return { ok: false, error: `No compliance form template for state: ${form.stateCode}` };
  }

  // M7 — required fields must be present before a signature can attach.
  const { values } = splitFields(form.fields);
  const fieldErrors = validateRequiredFields(template, values, true);
  if (Object.keys(fieldErrors).length > 0) {
    return {
      ok: false,
      error: "Complete the required fields before signing.",
      fieldErrors,
    };
  }

  const signerName =
    [user.firstName, user.lastName].filter(Boolean).join(" ") || user.email;

  const updated = await prisma.stateComplianceForm.update({
    where: { id: form.id },
    data: {
      status: "complete",
      signedBy: signerName,
      signedAt: new Date(),
    },
  });

  await prisma.auditLog.create({
    data: {
      organizationId: user.organizationId!,
      actorUserId: user.id,
      action: "compliance.form.signed",
      subjectType: "StateComplianceForm",
      subjectId: form.id,
      metadata: {
        patientId: form.patientId,
        stateCode: form.stateCode,
        formTemplateId: form.formTemplateId,
      } as any,
    },
  });

  revalidatePath(`/clinic/patients/${form.patientId}/compliance`);
  return { ok: true, form: toDto(updated) };
}

// ─── Submit to state registry ───────────────────────────

/**
 * EMR-1095/1096 — submit a signed form to the state registry, server-side.
 * The attempt (mode + outcome) is always persisted into the fields JSON
 * under a reserved key, but the row only moves to "submitted" when a real
 * registry API accepted it (`mode: "api"` + success). A manual_stub result
 * (no API connected) keeps the row at "complete" so nobody mistakes a
 * stubbed call for an actual electronic filing.
 */
export async function submitComplianceForm(
  formId: string,
): Promise<ComplianceFormActionResult> {
  const user = await requireUser();
  if (!hasPermission(user, "notes.edit")) {
    return { ok: false, error: "Forbidden: you cannot submit compliance forms." };
  }
  if (!formId || typeof formId !== "string") {
    return { ok: false, error: "Invalid input." };
  }

  const form = await loadOrgForm(formId, user.organizationId!);
  if (!form) return { ok: false, error: "Form not found." };
  if (form.status === "submitted") {
    return { ok: false, error: "This form has already been submitted.", form: toDto(form) };
  }
  if (form.status !== "complete" || !form.signedAt) {
    return { ok: false, error: "Sign the form before submitting it." };
  }

  const template = getStateForm(form.stateCode);
  if (!template) {
    return { ok: false, error: `No compliance form template for state: ${form.stateCode}` };
  }

  // M7 — re-validate at the submission boundary too; a row mutated outside
  // this flow must not reach the registry incomplete.
  const { values } = splitFields(form.fields);
  const fieldErrors = validateRequiredFields(template, values, Boolean(form.signedAt));
  if (Object.keys(fieldErrors).length > 0) {
    return {
      ok: false,
      error: "Complete the required fields before submitting.",
      fieldErrors,
    };
  }

  const result = await submitToStateRegistry({
    stateCode: form.stateCode,
    formData: values,
    providerCredentials: {},
  });

  const attempt: RegistryAttempt = {
    mode: result.mode,
    success: result.success,
    confirmationNumber: result.confirmationNumber ?? null,
    registryPatientId: result.registryPatientId ?? null,
    expirationDate: result.expirationDate ?? null,
    errors: result.errors ?? null,
    attemptedAt: result.submittedAt,
  };

  // Only a real API acceptance marks the form submitted. Stub/manual modes
  // and failures keep the row at "complete" — but the attempt is persisted
  // regardless so the chart shows exactly what happened.
  const electronicallySubmitted = result.success && result.mode === "api";

  const updated = await prisma.stateComplianceForm.update({
    where: { id: form.id },
    data: {
      fields: { ...values, [REGISTRY_ATTEMPT_KEY]: attempt } as any,
      ...(electronicallySubmitted
        ? { status: "submitted", submittedAt: new Date() }
        : {}),
    },
  });

  await prisma.auditLog.create({
    data: {
      organizationId: user.organizationId!,
      actorUserId: user.id,
      action: electronicallySubmitted
        ? "compliance.form.submitted"
        : result.success
          ? "compliance.form.manual_submission_required"
          : "compliance.form.submission_failed",
      subjectType: "StateComplianceForm",
      subjectId: form.id,
      metadata: {
        patientId: form.patientId,
        stateCode: form.stateCode,
        formTemplateId: form.formTemplateId,
        mode: result.mode,
        success: result.success,
        confirmationNumber: result.confirmationNumber ?? null,
        errors: result.errors ?? null,
      } as any,
    },
  });

  revalidatePath(`/clinic/patients/${form.patientId}/compliance`);

  if (!result.success) {
    return {
      ok: false,
      error: (result.errors ?? ["Registry submission failed."]).join(" "),
      form: toDto(updated),
    };
  }

  return { ok: true, form: toDto(updated) };
}
