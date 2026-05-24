"use client";

import { AvatarUpload } from "@/components/ui/avatar-upload";
import { updatePatientPhoto } from "./actions";

interface PatientAvatarProps {
  patientId: string;
  firstName: string;
  lastName: string;
  initialPhotoUrl: string | null;
}

/**
 * Clinic-chart header avatar. Wraps the shared {@link AvatarUpload}
 * primitive — drag-drop, in-browser square crop, optimistic preview,
 * toast on save — and binds the cropped JPEG dataURL to
 * `updatePatientPhoto` so the chart picks up the new photo on revalidate.
 */
export function PatientAvatar({
  patientId,
  firstName,
  lastName,
  initialPhotoUrl,
}: PatientAvatarProps) {
  const handleUpload = async (dataUrl: string) => {
    await updatePatientPhoto(patientId, dataUrl);
  };

  const initials = `${firstName?.[0] ?? ""}${lastName?.[0] ?? ""}`.toUpperCase();

  return (
    <AvatarUpload
      initialSrc={initialPhotoUrl}
      initials={initials}
      onUpload={handleUpload}
      size={88}
    />
  );
}
