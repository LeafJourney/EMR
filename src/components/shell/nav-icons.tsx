/**
 * Lightweight stroke-icon set for the pillar rail. Each icon is a plain
 * function component over `SVGProps<SVGSVGElement>` so it slots into `NavIcon`.
 */
import * as React from "react";

type SvgProps = React.SVGProps<SVGSVGElement>;

function base(props: SvgProps): SvgProps {
  const { width, height, strokeWidth, ...rest } = props;
  return {
    width: width ?? 20,
    height: height ?? 20,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: (strokeWidth as number | undefined) ?? 1.75,
    strokeLinecap: "round",
    strokeLinejoin: "round",
    "aria-hidden": true,
    ...rest,
  };
}

export const IconHome: React.FC<SvgProps> = (props) => (
  <svg {...base(props)}>
    <path d="M3 11 12 3l9 8" />
    <path d="M5 10v10h14V10" />
    <path d="M10 20v-6h4v6" />
  </svg>
);

export const IconStethoscope: React.FC<SvgProps> = (props) => (
  <svg {...base(props)}>
    <path d="M6 3v6a4 4 0 0 0 8 0V3" />
    <path d="M6 3H4" />
    <path d="M14 3h2" />
    <path d="M10 13v4a5 5 0 0 0 10 0v-2" />
    <circle cx="20" cy="13" r="2" />
  </svg>
);

export const IconClipboardCheck: React.FC<SvgProps> = (props) => (
  <svg {...base(props)}>
    <rect x="5" y="4" width="14" height="17" rx="2" />
    <path d="M9 4V3a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v1" />
    <path d="m9 13 2 2 4-4" />
  </svg>
);

export const IconBookOpen: React.FC<SvgProps> = (props) => (
  <svg {...base(props)}>
    <path d="M3 5h7a3 3 0 0 1 3 3v12" />
    <path d="M21 5h-7a3 3 0 0 0-3 3v12" />
    <path d="M3 5v14h7" />
    <path d="M21 5v14h-7" />
  </svg>
);

export const IconSettings: React.FC<SvgProps> = (props) => (
  <svg {...base(props)}>
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z" />
  </svg>
);

export const IconLayoutGrid: React.FC<SvgProps> = (props) => (
  <svg {...base(props)}>
    <rect x="3" y="3" width="7" height="7" rx="1" />
    <rect x="14" y="3" width="7" height="7" rx="1" />
    <rect x="3" y="14" width="7" height="7" rx="1" />
    <rect x="14" y="14" width="7" height="7" rx="1" />
  </svg>
);

export const IconDollar: React.FC<SvgProps> = (props) => (
  <svg {...base(props)}>
    <line x1="12" y1="2" x2="12" y2="22" />
    <path d="M17 6H10a3 3 0 0 0 0 6h4a3 3 0 0 1 0 6H7" />
  </svg>
);

export const IconUsers: React.FC<SvgProps> = (props) => (
  <svg {...base(props)}>
    <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
    <circle cx="9" cy="7" r="4" />
    <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
    <path d="M16 3.13a4 4 0 0 1 0 7.75" />
  </svg>
);

export const IconBuilding: React.FC<SvgProps> = (props) => (
  <svg {...base(props)}>
    <rect x="4" y="3" width="16" height="18" rx="1" />
    <line x1="9" y1="7" x2="9" y2="7" />
    <line x1="15" y1="7" x2="15" y2="7" />
    <line x1="9" y1="11" x2="9" y2="11" />
    <line x1="15" y1="11" x2="15" y2="11" />
    <line x1="9" y1="15" x2="9" y2="15" />
    <line x1="15" y1="15" x2="15" y2="15" />
    <path d="M10 21v-4h4v4" />
  </svg>
);

export const IconChart: React.FC<SvgProps> = (props) => (
  <svg {...base(props)}>
    <path d="M3 3v18h18" />
    <path d="M7 15l4-4 3 3 5-6" />
  </svg>
);

export const IconServer: React.FC<SvgProps> = (props) => (
  <svg {...base(props)}>
    <rect x="3" y="4" width="18" height="7" rx="1" />
    <rect x="3" y="13" width="18" height="7" rx="1" />
    <line x1="7" y1="7.5" x2="7.01" y2="7.5" />
    <line x1="7" y1="16.5" x2="7.01" y2="16.5" />
  </svg>
);

export const IconPill: React.FC<SvgProps> = (props) => (
  <svg {...base(props)}>
    <rect x="2" y="9" width="20" height="6" rx="3" transform="rotate(-45 12 12)" />
    <line x1="8.5" y1="8.5" x2="15.5" y2="15.5" />
  </svg>
);

export const IconHeart: React.FC<SvgProps> = (props) => (
  <svg {...base(props)}>
    <path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 0 0-7.8 7.8l1 1L12 21l7.8-7.6 1-1a5.5 5.5 0 0 0 0-7.8Z" />
  </svg>
);

export const IconCalendar: React.FC<SvgProps> = (props) => (
  <svg {...base(props)}>
    <rect x="3" y="5" width="18" height="16" rx="2" />
    <line x1="3" y1="10" x2="21" y2="10" />
    <line x1="8" y1="3" x2="8" y2="7" />
    <line x1="16" y1="3" x2="16" y2="7" />
  </svg>
);

export const IconMessage: React.FC<SvgProps> = (props) => (
  <svg {...base(props)}>
    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2Z" />
  </svg>
);

export const IconUser: React.FC<SvgProps> = (props) => (
  <svg {...base(props)}>
    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
    <circle cx="12" cy="7" r="4" />
  </svg>
);

export const IconInbox: React.FC<SvgProps> = (props) => (
  <svg {...base(props)}>
    <path d="M22 12h-6l-2 3h-4l-2-3H2" />
    <path d="M5 3h14l3 9v7a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-7Z" />
  </svg>
);
