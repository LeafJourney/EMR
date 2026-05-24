"use client";

/**
 * Patient portal — Upload records form.
 *
 * Adopts the shared `FileUpload` primitive so patients can drop multiple
 * scans or lab PDFs in one shot. Each file is dispatched independently
 * against `uploadDocumentAction`, so a single bad upload no longer
 * aborts the rest.
 */

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import {
  FileUpload,
  type FileUploadHandler,
  type UploadedFile,
} from "@/components/ui/file-upload";
import { uploadDocumentAction } from "./actions";
import { Button } from "@/components/ui/button";

export function UploadForm({ onClose }: { onClose?: () => void }) {
  const router = useRouter();
  const [completedCount, setCompletedCount] = useState(0);

  const handler: FileUploadHandler = useCallback(async (file): Promise<UploadedFile> => {
    const fd = new FormData();
    fd.append("file", file);
    const result = await uploadDocumentAction(null, fd);
    if (!result.ok) {
      throw new Error(result.error);
    }
    return { id: result.documentId, name: file.name };
  }, []);

  if (completedCount > 0 && !onClose) {
    // Page-mounted variant — refresh in place so the records list picks
    // up the new entries.
    router.refresh();
  }

  return (
    <div className="space-y-4">
      <FileUpload
        accept=".pdf,.png,.jpg,.jpeg,.heic,.heif,.gif,.webp,.doc,.docx,.xls,.xlsx,.csv,.txt"
        maxFiles={15}
        maxSizeMB={25}
        concurrency={2}
        label="Drop files here or click to browse"
        hint="PDF, images, or scanned documents — up to 25 MB"
        onUpload={handler}
        onComplete={(items) => {
          const ok = items.filter((i) => i.status === "uploaded").length;
          setCompletedCount(ok);
          if (ok > 0) router.refresh();
        }}
      />
      {onClose && (
        <div className="flex justify-end">
          <Button type="button" variant="ghost" size="sm" onClick={onClose}>
            Done
          </Button>
        </div>
      )}
    </div>
  );
}
