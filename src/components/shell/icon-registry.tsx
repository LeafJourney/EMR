"use client";

// Client-side lookup from a serializable NavIconKey to the actual SVG
// component. NavSection carries only the string key across the RSC
// boundary (see nav-sections.ts); the component is resolved here.

import * as React from "react";
import {
  IconHome,
  IconPill,
  IconCalendar,
  IconMessage,
  IconUser,
  IconStethoscope,
  IconClipboardCheck,
  IconBookOpen,
  IconSettings,
  IconLayoutGrid,
  IconDollar,
  IconUsers,
  IconBuilding,
  IconChart,
  IconServer,
  IconHeart,
  IconInbox,
} from "./nav-icons";
import type { NavIconKey } from "./nav-sections";

type NavIconComponent = React.ComponentType<React.SVGProps<SVGSVGElement>>;

const REGISTRY: Record<NavIconKey, NavIconComponent> = {
  home: IconHome,
  pill: IconPill,
  calendar: IconCalendar,
  message: IconMessage,
  user: IconUser,
  stethoscope: IconStethoscope,
  "clipboard-check": IconClipboardCheck,
  "book-open": IconBookOpen,
  settings: IconSettings,
  "layout-grid": IconLayoutGrid,
  dollar: IconDollar,
  users: IconUsers,
  building: IconBuilding,
  chart: IconChart,
  server: IconServer,
  heart: IconHeart,
  inbox: IconInbox,
};

export function resolveNavIcon(
  key: NavIconKey | undefined,
): NavIconComponent | null {
  if (!key) return null;
  return REGISTRY[key] ?? null;
}
