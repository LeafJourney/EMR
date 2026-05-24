"use client";

import { AvatarUpload } from "@/components/ui/avatar-upload";
import { savePatientPortalPhoto } from "./actions";

interface PortalAvatarUploadProps {
  initials: string;
  initialSrc: string | null;
}

/**
 * Patient-portal profile avatar. Hands the cropped JPEG dataURL to
 * `savePatientPortalPhoto`. Errors propagate so the AvatarUpload toast
 * shows an "Upload failed" message instead of silently swallowing.
 */
export function PortalAvatarUpload({ initials, initialSrc }: PortalAvatarUploadProps) {
  const handleUpload = async (dataUrl: string) => {
    await savePatientPortalPhoto(dataUrl);
  };

  return (
    <AvatarUpload
      initials={initials}
      initialSrc={initialSrc}
      onUpload={handleUpload}
    />
  );
}
