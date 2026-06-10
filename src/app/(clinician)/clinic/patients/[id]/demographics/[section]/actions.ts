"use server";

/**
 * FO-B3 (EMR-1109) — real persistence for the demographics detail editor.
 *
 * Previously the editor wrote to localStorage only; "Save changes" set a
 * timestamp and the data evaporated on refresh. This action persists the
 * section payload server-side, mirroring the read path the section page
 * already uses:
 *
 *   • Canonical fields keep their canonical home —
 *       contact.phone / contact.email      → Patient.phone / Patient.email
 *       insurance.planName / memberId /
 *       groupNumber                        → intakeAnswers.insurance.*
 *     (the same targets the chart's inline-edit card writes to, so the
 *     two surfaces stay consistent)
 *   • Everything else (ssn, pronouns, emergency contacts, address string,
 *     COB, ad-hoc extra rows) → intakeAnswers.demographicsDetail[section]
 *     — the "stable shape a server store can adopt" the editor was
 *     already buffering locally.
 */

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db/prisma";
import { requireUser } from "@/lib/auth/session";
import {
  ForbiddenError,
  assertChartAccess,
  hasPermission,
} from "@/lib/rbac/permissions";
import { MIRRORED_KEYS, SECTIONS } from "./sections";

export interface DemographicsExtraRow {
  id: string;
  label: string;
  value: string;
}

export type SaveDemographicsSectionResult =
  | { ok: true; savedAt: string }
  | { ok: false; error: string };

const MAX_VALUE_LENGTH = 500;
const MAX_EXTRA_ROWS = 50;

export async function saveDemographicsSection(
  patientId: string,
  section: string,
  fields: Record<string, string>,
  extras: DemographicsExtraRow[] = [],
): Promise<SaveDemographicsSectionResult> {
  const user = await requireUser();

  // Demographics edits gate on the role's namesake permission (FO-B2) —
  // front office, back office, mid-levels, clinicians, owners all pass.
  if (!hasPermission(user, "patient.demographics.edit")) {
    return { ok: false, error: "Read-only access to chart" };
  }

  const sectionDef = SECTIONS[section];
  if (!sectionDef) {
    return { ok: false, error: "Unknown section" };
  }

  // ── Validate payload against the section's field allowlist ──────────
  const allowedKeys = new Set(sectionDef.fields.map((f) => f.key));
  const cleanFields: Record<string, string> = {};
  for (const [key, raw] of Object.entries(fields ?? {})) {
    if (!allowedKeys.has(key)) {
      return { ok: false, error: `Unsupported field "${key}"` };
    }
    if (typeof raw !== "string") {
      return { ok: false, error: `Invalid value for "${key}"` };
    }
    const trimmed = raw.trim();
    if (trimmed.length > MAX_VALUE_LENGTH) {
      return { ok: false, error: `"${key}" is too long` };
    }
    cleanFields[key] = trimmed;
  }

  // Field-level validation for the mirrored canonical fields, matching
  // the inline-edit actions in ../../actions.ts.
  if (section === "contact") {
    const email = cleanFields.email;
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return { ok: false, error: "Invalid email" };
    }
    const phone = cleanFields.phone;
    if (phone && !/^[0-9 +()\-.]{7,20}$/.test(phone)) {
      return { ok: false, error: "Invalid phone" };
    }
  }

  if (!Array.isArray(extras) || extras.length > MAX_EXTRA_ROWS) {
    return { ok: false, error: "Too many additional fields" };
  }
  const cleanExtras: DemographicsExtraRow[] = [];
  for (const row of extras) {
    const id = typeof row?.id === "string" ? row.id.slice(0, 64) : "";
    const label = typeof row?.label === "string" ? row.label.trim() : "";
    const value = typeof row?.value === "string" ? row.value.trim() : "";
    if (!id || !label) continue; // drop empty scaffolding rows
    if (label.length > 200 || value.length > MAX_VALUE_LENGTH) {
      return { ok: false, error: "Additional field is too long" };
    }
    cleanExtras.push({ id, label, value });
  }

  // ── Org-scoped patient lookup ────────────────────────────────────────
  const patient = await prisma.patient.findFirst({
    where: {
      id: patientId,
      organizationId: user.organizationId!,
      deletedAt: null,
    },
    select: { id: true, organizationId: true, intakeAnswers: true },
  });
  if (!patient) return { ok: false, error: "Patient not found" };

  try {
    await assertChartAccess(user, patientId);
  } catch (err) {
    if (err instanceof ForbiddenError) {
      return { ok: false, error: "Chart is restricted" };
    }
    throw err;
  }

  // ── Build the write ──────────────────────────────────────────────────
  const savedAtDate = new Date();
  const savedAt = savedAtDate.toISOString();

  const intake = (patient.intakeAnswers as Record<string, any>) ?? {};
  const detail = (intake.demographicsDetail as Record<string, any>) ?? {};
  detail[section] = {
    fields: cleanFields,
    extras: cleanExtras,
    savedAt,
    savedByUserId: user.id,
  };
  intake.demographicsDetail = detail;

  const data: Record<string, unknown> = {};

  // Mirror canonical fields through to their canonical home so the chart
  // header / inline-edit card / roster all see the same values.
  const mirrored = MIRRORED_KEYS[section] ?? [];
  if (section === "contact") {
    if (mirrored.includes("phone") && "phone" in cleanFields) {
      data.phone = cleanFields.phone || null;
    }
    if (mirrored.includes("email") && "email" in cleanFields) {
      data.email = cleanFields.email || null;
    }
  }
  if (section === "insurance") {
    const insurance =
      typeof intake.insurance === "object" && intake.insurance !== null
        ? (intake.insurance as Record<string, any>)
        : {};
    if ("planName" in cleanFields) {
      insurance.providerName = cleanFields.planName || null;
    }
    if ("memberId" in cleanFields) {
      insurance.memberId = cleanFields.memberId || null;
    }
    if ("groupNumber" in cleanFields) {
      insurance.groupNumber = cleanFields.groupNumber || null;
    }
    intake.insurance = insurance;
  }

  data.intakeAnswers = intake;

  await prisma.patient.update({
    where: { id: patient.id },
    data: data as any,
  });

  await prisma.auditLog.create({
    data: {
      organizationId: patient.organizationId,
      actorUserId: user.id,
      action: "patient.demographics.updated",
      subjectType: "Patient",
      subjectId: patient.id,
      metadata: {
        section,
        fields: Object.keys(cleanFields),
        extraCount: cleanExtras.length,
      } as any,
    },
  });

  revalidatePath(`/clinic/patients/${patientId}`);
  revalidatePath(`/clinic/patients/${patientId}/demographics/${section}`);
  return { ok: true, savedAt };
}
