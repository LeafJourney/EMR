"use client";

import { useRef, useState } from "react";
import { Avatar } from "@/components/ui/avatar";
import { updatePatientPhoto } from "./actions";

interface PatientAvatarProps {
  patientId: string;
  firstName: string;
  lastName: string;
  initialPhotoUrl: string | null;
}

export function PatientAvatar({
  patientId,
  firstName,
  lastName,
  initialPhotoUrl,
}: PatientAvatarProps) {
  const [photoUrl, setPhotoUrl] = useState(initialPhotoUrl);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);

    const reader = new FileReader();
    reader.onload = async () => {
      const base64 = typeof reader.result === "string" ? reader.result : null;
      if (base64) {
        setPhotoUrl(base64);
        try {
          await updatePatientPhoto(patientId, base64);
        } catch (err) {
          console.error("Failed to upload photo", err);
        }
      }
      setUploading(false);
    };
    reader.onerror = () => {
      setUploading(false);
    };
    reader.readAsDataURL(file);
  };

  return (
    <div
      className="relative group cursor-pointer shrink-0"
      onClick={() => fileInputRef.current?.click()}
      title="Click to upload profile photo"
    >
      <Avatar
        firstName={firstName}
        lastName={lastName}
        size="lg"
        src={photoUrl}
        className={uploading ? "opacity-50" : "transition-transform group-hover:scale-105 duration-200"}
      />
      
      {/* Small camera plus symbol overlay at bottom-right */}
      <div className="absolute bottom-0 right-0 bg-accent text-accent-ink p-1 rounded-full border-2 border-surface shadow-md group-hover:scale-110 transition-transform duration-200">
        <svg
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="3.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <line x1="12" y1="5" x2="12" y2="19" />
          <line x1="5" y1="12" x2="19" y2="12" />
        </svg>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={handleUpload}
        className="hidden"
      />
    </div>
  );
}
