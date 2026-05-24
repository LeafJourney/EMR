import { cn } from "@/lib/utils/cn";

/**
 * Monochrome + accent illustration used on the app-wide 404 screen.
 * A compass rose with a single botanical sprig drifting off-axis —
 * "the page wandered off". Pure SVG, no images, no animation cost,
 * scales with the surrounding type.
 */
export function WanderingLeafIllustration({
  size = 168,
  className,
}: {
  size?: number;
  className?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 168 168"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={cn("text-accent", className)}
      aria-hidden="true"
    >
      <defs>
        <radialGradient id="wl-mist" cx="50%" cy="55%" r="55%">
          <stop offset="0%" stopColor="var(--accent-soft)" stopOpacity="0.85" />
          <stop offset="100%" stopColor="var(--accent-soft)" stopOpacity="0" />
        </radialGradient>
      </defs>

      {/* Soft mist halo */}
      <circle cx="84" cy="88" r="64" fill="url(#wl-mist)" />

      {/* Compass ring */}
      <circle
        cx="84"
        cy="84"
        r="48"
        stroke="currentColor"
        strokeWidth="1.1"
        opacity="0.45"
      />
      <circle
        cx="84"
        cy="84"
        r="36"
        stroke="currentColor"
        strokeWidth="0.75"
        strokeDasharray="2 4"
        opacity="0.35"
      />

      {/* Cardinal ticks */}
      <g
        stroke="currentColor"
        strokeWidth="1"
        strokeLinecap="round"
        opacity="0.6"
      >
        <line x1="84" y1="34" x2="84" y2="40" />
        <line x1="84" y1="128" x2="84" y2="134" />
        <line x1="34" y1="84" x2="40" y2="84" />
        <line x1="128" y1="84" x2="134" y2="84" />
      </g>

      {/* Compass needle, slightly off-true */}
      <g transform="rotate(18 84 84)">
        <path
          d="M84 50 L90 84 L84 118 L78 84 Z"
          fill="currentColor"
          opacity="0.18"
        />
        <path
          d="M84 50 L90 84 L84 84 Z"
          fill="currentColor"
          opacity="0.85"
        />
        <circle cx="84" cy="84" r="3" fill="var(--bg)" stroke="currentColor" strokeWidth="1" />
      </g>

      {/* Drifting leaf — the page that wandered off */}
      <g transform="translate(118 36) rotate(28)">
        <path
          d="M0 8 C 4 0, 12 0, 16 8 C 12 16, 4 16, 0 8 Z"
          stroke="currentColor"
          strokeWidth="1.1"
          fill="var(--highlight)"
          fillOpacity="0.18"
          strokeLinejoin="round"
        />
        <path
          d="M2 8 L14 8"
          stroke="currentColor"
          strokeWidth="0.8"
          strokeLinecap="round"
          opacity="0.7"
        />
      </g>

      {/* Trail of small dots from compass center out to drifting leaf */}
      <g fill="currentColor" opacity="0.55">
        <circle cx="98" cy="74" r="1.2" />
        <circle cx="108" cy="62" r="1" />
        <circle cx="116" cy="52" r="0.9" />
      </g>

      {/* Highlight glints */}
      <circle cx="46" cy="50" r="1.5" fill="var(--highlight)" opacity="0.7" />
      <circle cx="132" cy="118" r="1.25" fill="var(--highlight)" opacity="0.55" />
    </svg>
  );
}
