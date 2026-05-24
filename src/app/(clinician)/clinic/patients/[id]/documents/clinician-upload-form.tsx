"use client";

/**
 * ClinicianUploadForm — patient document upload.
 *
 * Adopts the shared `FileUpload` primitive (EMR-???/UX run) so clinicians
 * can drop multiple lab PDFs, scans, COAs, etc. into a chart in one
 * action. Each file is uploaded independently against the existing
 * `uploadClinicianDocumentAction` server action; per-file failures stay
 * inline and don't blow up the rest of the queue.
 */

import { useRouter } from "next/navigation";
import { useCallback } from "react";
import {
  FileUpload,
  type FileUploadHandler,
  type UploadedFile,
} from "@/components/ui/file-upload";
import {
  ALLOWED_MIME_TYPES,
  MAX_FILE_SIZE_BYTES,
} from "@/lib/storage/document-types";
import { uploadClinicianDocumentAction } from "./actions";

const MAX_SIZE_MB = Math.round(MAX_FILE_SIZE_BYTES / (1024 * 1024));
// Express the server's MIME allowlist as an `accept` token list — matches
// what the picker offered before, plus image/heic, plus a few extensions
// for browsers that drop MIME on drag-drop (e.g. Safari for .heic).
const ACCEPT = [
  ...Array.from(ALLOWED_MIME_TYPES),
  ".pdf",
  ".png",
  ".jpg",
  ".jpeg",
  ".heic",
  ".heif",
  ".gif",
  ".webp",
  ".doc",
  ".docx",
  ".xls",
  ".xlsx",
  ".csv",
  ".txt",
].join(",");

export function ClinicianUploadForm({
  patientId,
  onDone,
}: {
  patientId: string;
  onDone?: () => void;
}) {
  const router = useRouter();

  const handler: FileUploadHandler = useCallback(
    async (file): Promise<UploadedFile> => {
      const fd = new FormData();
      fd.append("patientId", patientId);
      fd.append("file", file);
      const result = await uploadClinicianDocumentAction(fd);
      if (!result.ok) {
        throw new Error(result.error);
      }
      // The server action doesn't currently return the document id; that
      // is fine — FileUpload uses the local file name when no URL is
      // available, and a chart refresh surfaces the new row.
      router.refresh();
      return { id: file.name, name: file.name };
    },
    [patientId, router],
  );

  return (
    <FileUpload
      accept={ACCEPT}
      maxFiles={20}
      maxSizeMB={MAX_SIZE_MB}
      concurrency={3}
      label="Drop chart documents here or click to browse"
      hint={`PDF · images · Word · Excel · CSV — up to ${MAX_SIZE_MB} MB per file`}
      onUpload={handler}
      onComplete={(items) => {
        const anyOk = items.some((i) => i.status === "uploaded");
        if (anyOk) onDone?.();
      }}
    />
  );
}
