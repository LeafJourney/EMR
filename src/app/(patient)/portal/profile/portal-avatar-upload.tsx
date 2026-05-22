"use client";

import { AvatarUpload } from "@/components/ui/avatar-upload";
import { savePatientPortalPhoto } from "./actions";

interface PortalAvatarUploadProps {
  initials: string;
  initialSrc: string | null;
}

export function PortalAvatarUpload({ initials, initialSrc }: PortalAvatarUploadProps) {
  const handleUpload = async (base64: string) => {
    try {
      await savePatientPortalPhoto(base64);
    } catch (err) {
      console.error("Failed to save portal photo", err);
    }
  };

  return (
    <AvatarUpload
      initials={initials}
      initialSrc={initialSrc}
      onUpload={handleUpload}
    />
  );
}
