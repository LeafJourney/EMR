/**
 * Medical Imaging Upload Route — EMR-166
 *
 * Thin REST layer over `handleImagingUpload`. Responsibilities:
 *   • Auth: only `clinician` or `operator` users may upload (HIPAA gate).
 *   • Form parsing: validates metadata via zod, collects File parts.
 *   • Tenant scoping: passes the user's organizationId into the pipeline
 *     so storage paths inherit it (the pipeline refuses cross-tenant writes
 *     by namespacing keys to `organizationId/patientId/studyId/...`).
 *
 * Form fields (multipart/form-data):
 *   patientId   — required string (chart patientId)
 *   modality    — optional CT|MR|XR|US|PT|MG|NM (defaults to DICOM tag)
 *   description — optional study description
 *   bodyPart    — optional body part
 *   studyDate   — optional yyyy-mm-dd
 *   indication  — optional clinical indication
 *   files[]     — one or more File parts
 *
 * GET returns the upload constraints so a UI can render its own
 * dropzone hints without hardcoding limits.
 */

import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/observability/log";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/session";
import {
  ACCEPTED_IMAGING_MIME,
  MAX_UPLOAD_BYTES,
} from "@/lib/domain/medical-imaging";
import {
  ImagingUploadError,
  handleImagingUpload,
  imagingStorageConfigured,
} from "@/lib/imaging/upload";

const MetadataSchema = z.object({
  patientId: z.string().min(1).max(200),
  modality: z
    .enum(["CT", "MR", "XR", "US", "PT", "MG", "NM"])
    .optional(),
  description: z.string().min(1).max(200).optional(),
  bodyPart: z.string().min(1).max(120).optional(),
  studyDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Expected yyyy-mm-dd")
    .optional(),
  indication: z.string().max(2000).optional(),
});

const ALLOWED_ROLES = new Set(["clinician", "operator", "system"]);

export async function POST(req: NextRequest) {
  // HIPAA gate: only authenticated, authorized roles may upload imaging.
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const allowed = user.roles.some((r) => ALLOWED_ROLES.has(r));
  if (!allowed) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const contentType = req.headers.get("content-type") ?? "";
  if (!contentType.startsWith("multipart/form-data")) {
    return NextResponse.json(
      { error: "expected_multipart" },
      { status: 415 },
    );
  }

  const form = await req.formData();
  const metadata = MetadataSchema.safeParse({
    patientId: form.get("patientId"),
    modality: form.get("modality") ?? undefined,
    description: form.get("description") ?? undefined,
    bodyPart: form.get("bodyPart") ?? undefined,
    studyDate: form.get("studyDate") ?? undefined,
    indication: form.get("indication") ?? undefined,
  });

  if (!metadata.success) {
    return NextResponse.json(
      { error: "invalid_metadata", issues: metadata.error.issues },
      { status: 400 },
    );
  }

  const fileEntries = form.getAll("files");
  const files = fileEntries.filter(
    (f): f is File => typeof f === "object" && f !== null && "size" in f,
  );

  if (files.length === 0) {
    return NextResponse.json(
      { error: "no_files", message: "At least one file is required" },
      { status: 400 },
    );
  }

  try {
    const outcome = await handleImagingUpload({
      patientId: metadata.data.patientId,
      organizationId: user.organizationId ?? undefined,
      modality: metadata.data.modality,
      description: metadata.data.description,
      bodyPart: metadata.data.bodyPart,
      studyDate: metadata.data.studyDate,
      indication: metadata.data.indication,
      files,
      actor: {
        userId: user.id,
        role:
          (user.roles.find((r) => r === "clinician" || r === "operator") as
            | "clinician"
            | "operator"
            | undefined) ?? "system",
      },
    });

    return NextResponse.json(
      {
        ok: true,
        study: outcome.study,
        result: outcome.result,
        storageKeys: outcome.storageKeys,
        dicom: outcome.dicomMetadata,
      },
      { status: 201 },
    );
  } catch (err) {
    if (err instanceof ImagingUploadError) {
      const status =
        err.code === "all_files_rejected"
          ? 422
          : err.code === "patient_mismatch"
            ? 409
            : 400;
      return NextResponse.json(
        { error: err.code, message: err.message, details: err.details },
        { status },
      );
    }
    logger.error({ event: "imaging.upload_failed", err });
    return NextResponse.json(
      { error: "internal_error" },
      { status: 500 },
    );
  }
}

export async function GET() {
  return NextResponse.json({
    accept: Array.from(ACCEPTED_IMAGING_MIME),
    maxBytes: MAX_UPLOAD_BYTES,
    modalities: ["CT", "MR", "XR", "US", "PT", "MG", "NM"],
    storageConfigured: imagingStorageConfigured(),
  });
}
