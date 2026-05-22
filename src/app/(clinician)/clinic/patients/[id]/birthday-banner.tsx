"use client";

import { useState } from "react";
import { Celebration } from "@/components/ui/celebration";

interface BirthdayBannerProps {
  isBirthday: boolean;
  firstName: string;
}

/**
 * Fires a confetti celebration overlay once when today is the patient's
 * birthday, then leaves a persistent cake+hat emoji inline in the chart header.
 */
export function BirthdayBanner({ isBirthday, firstName }: BirthdayBannerProps) {
  const [celebrationShown, setCelebrationShown] = useState(isBirthday);

  if (!isBirthday) return null;

  return (
    <>
      <Celebration
        show={celebrationShown}
        emoji="🎂"
        message={`Happy birthday, ${firstName}! 🎉`}
        onDone={() => setCelebrationShown(false)}
      />
      <span
        aria-label={`Today is ${firstName}'s birthday`}
        title={`Today is ${firstName}'s birthday`}
        className="text-base leading-none select-none"
      >
        🎂🎩
      </span>
    </>
  );
}
