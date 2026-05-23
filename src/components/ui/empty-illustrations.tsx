import * as React from "react";
import { cn } from "@/lib/utils/cn";

/**
 * Library of small (~80×80) SVG illustrations for empty states.
 *
 * Style rules: monochrome line work in `currentColor` with a single
 * accent fill, soft rounded corners, ~1.4px stroke weights. Each
 * illustration is purely decorative — `aria-hidden` and never relied on
 * for meaning. The accent color picks up `var(--accent)` via Tailwind's
 * `text-accent` utility on the wrapper.
 */

type IllustrationProps = {
  size?: number;
  className?: string;
};

function Frame({
  size = 80,
  className,
  children,
}: IllustrationProps & { children: React.ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 80 80"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={cn("text-text-muted", className)}
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

/** Envelope with a soft check — for inbox-zero / no messages. */
export function InboxZeroIllustration(props: IllustrationProps) {
  return (
    <Frame {...props}>
      <rect
        x="14"
        y="22"
        width="52"
        height="36"
        rx="6"
        stroke="currentColor"
        strokeWidth="1.4"
        fill="var(--surface)"
      />
      <path
        d="M14 26 L40 44 L66 26"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
      <circle cx="56" cy="22" r="9" fill="var(--accent)" opacity="0.18" />
      <path
        d="M52 22.5 L55 25.5 L60.5 19.5"
        stroke="var(--accent)"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Frame>
  );
}

/** Person silhouette + plus — for empty patient roster. */
export function PatientsEmptyIllustration(props: IllustrationProps) {
  return (
    <Frame {...props}>
      <circle
        cx="34"
        cy="30"
        r="9"
        stroke="currentColor"
        strokeWidth="1.4"
        fill="var(--surface)"
      />
      <path
        d="M18 60 C 20 49, 28 45, 34 45 C 40 45, 48 49, 50 60"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        fill="var(--surface)"
      />
      <circle cx="58" cy="54" r="10" fill="var(--accent)" opacity="0.18" />
      <path
        d="M58 49 L58 59 M53 54 L63 54"
        stroke="var(--accent)"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </Frame>
  );
}

/** Calendar with a single checkmark — for "today's queue is clear". */
export function QueueEmptyIllustration(props: IllustrationProps) {
  return (
    <Frame {...props}>
      <rect
        x="14"
        y="20"
        width="52"
        height="44"
        rx="6"
        stroke="currentColor"
        strokeWidth="1.4"
        fill="var(--surface)"
      />
      <path
        d="M14 32 L66 32"
        stroke="currentColor"
        strokeWidth="1.4"
      />
      <path
        d="M24 16 L24 24 M40 16 L40 24 M56 16 L56 24"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
      <rect x="28" y="42" width="24" height="14" rx="4" fill="var(--accent)" opacity="0.18" />
      <path
        d="M32 49 L38 54 L48 44"
        stroke="var(--accent)"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Frame>
  );
}

/** Book/library — for saved articles. */
export function LibraryEmptyIllustration(props: IllustrationProps) {
  return (
    <Frame {...props}>
      <rect
        x="18"
        y="18"
        width="44"
        height="50"
        rx="4"
        stroke="currentColor"
        strokeWidth="1.4"
        fill="var(--surface)"
      />
      <path
        d="M18 26 L62 26 M18 38 L62 38 M18 50 L52 50 M18 60 L46 60"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
        opacity="0.7"
      />
      <path
        d="M50 14 L62 18 L62 30 L50 26 Z"
        fill="var(--accent)"
        opacity="0.7"
        stroke="var(--accent)"
        strokeWidth="1.2"
        strokeLinejoin="round"
      />
    </Frame>
  );
}

/** Magnifying glass over a soft hex — for empty research. */
export function ResearchEmptyIllustration(props: IllustrationProps) {
  return (
    <Frame {...props}>
      <circle
        cx="36"
        cy="36"
        r="18"
        stroke="currentColor"
        strokeWidth="1.4"
        fill="var(--surface)"
      />
      <path
        d="M49 49 L62 62"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
      />
      <circle cx="36" cy="36" r="10" fill="var(--accent)" opacity="0.15" />
      <path
        d="M30 36 L34 40 L42 32"
        stroke="var(--accent)"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Frame>
  );
}

/** Speech-to-text waveform card — for transcripts. */
export function TranscriptsEmptyIllustration(props: IllustrationProps) {
  return (
    <Frame {...props}>
      <rect
        x="14"
        y="20"
        width="52"
        height="40"
        rx="6"
        stroke="currentColor"
        strokeWidth="1.4"
        fill="var(--surface)"
      />
      <path
        d="M22 40 L22 40 M28 34 L28 46 M34 30 L34 50 M40 36 L40 44 M46 28 L46 52 M52 34 L52 46 M58 38 L58 42"
        stroke="var(--accent)"
        strokeWidth="2.2"
        strokeLinecap="round"
      />
    </Frame>
  );
}

/** Voicemail — phone receiver with a tape circle. */
export function VoicemailEmptyIllustration(props: IllustrationProps) {
  return (
    <Frame {...props}>
      <rect
        x="14"
        y="30"
        width="52"
        height="22"
        rx="11"
        stroke="currentColor"
        strokeWidth="1.4"
        fill="var(--surface)"
      />
      <circle cx="26" cy="41" r="6" fill="var(--accent)" opacity="0.5" />
      <circle cx="54" cy="41" r="6" fill="var(--accent)" opacity="0.5" />
      <path
        d="M30 41 L50 41"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeDasharray="2 3"
      />
    </Frame>
  );
}

/** Fax — sheet sliding out of a machine. */
export function FaxEmptyIllustration(props: IllustrationProps) {
  return (
    <Frame {...props}>
      <rect
        x="14"
        y="34"
        width="52"
        height="26"
        rx="4"
        stroke="currentColor"
        strokeWidth="1.4"
        fill="var(--surface)"
      />
      <rect
        x="24"
        y="18"
        width="32"
        height="22"
        rx="2"
        stroke="currentColor"
        strokeWidth="1.4"
        fill="var(--accent)"
        fillOpacity="0.18"
      />
      <path
        d="M30 26 L50 26 M30 32 L46 32"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
        opacity="0.7"
      />
      <circle cx="56" cy="48" r="1.8" fill="var(--accent)" />
      <circle cx="50" cy="48" r="1.8" fill="currentColor" opacity="0.4" />
      <path
        d="M20 56 L36 56"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
        opacity="0.6"
      />
    </Frame>
  );
}

/** Lifestyle — heart + sparkles. */
export function LifestyleEmptyIllustration(props: IllustrationProps) {
  return (
    <Frame {...props}>
      <path
        d="M40 60 C 28 52, 18 44, 18 33 C 18 26, 24 22, 30 22 C 34 22, 38 24, 40 28 C 42 24, 46 22, 50 22 C 56 22, 62 26, 62 33 C 62 44, 52 52, 40 60 Z"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinejoin="round"
        fill="var(--accent)"
        fillOpacity="0.2"
      />
      <path
        d="M16 16 L18 20 L22 22 L18 24 L16 28 L14 24 L10 22 L14 20 Z"
        fill="var(--accent)"
        opacity="0.75"
      />
      <path
        d="M64 60 L65.5 63 L68.5 64.5 L65.5 66 L64 69 L62.5 66 L59.5 64.5 L62.5 63 Z"
        fill="var(--accent)"
        opacity="0.55"
      />
    </Frame>
  );
}

/** Coach / chat — friendly chat bubble + sparkle. */
export function CoachEmptyIllustration(props: IllustrationProps) {
  return (
    <Frame {...props}>
      <path
        d="M16 22 C 16 18, 19 16, 23 16 L 53 16 C 57 16, 60 18, 60 22 L 60 42 C 60 46, 57 48, 53 48 L 32 48 L 22 58 L 22 48 C 19 48, 16 46, 16 42 Z"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinejoin="round"
        fill="var(--surface)"
      />
      <circle cx="27" cy="32" r="2" fill="currentColor" opacity="0.7" />
      <circle cx="38" cy="32" r="2" fill="currentColor" opacity="0.7" />
      <circle cx="49" cy="32" r="2" fill="currentColor" opacity="0.7" />
      <path
        d="M64 50 L66 54 L70 56 L66 58 L64 62 L62 58 L58 56 L62 54 Z"
        fill="var(--accent)"
        opacity="0.8"
      />
    </Frame>
  );
}
