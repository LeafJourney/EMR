/**
 * Patient portal customization — EMR-073
 *
 * Each patient can rearrange and toggle the home-page widgets that show
 * up in their portal. The customization is intentionally narrow: a list
 * of widget IDs in display order plus a set of hidden ones. We persist
 * to localStorage today; promoting to Prisma is one column.
 *
 * No DB. No React. Just types + tiny pure functions.
 */

export type PortalWidgetId =
  | "plant-health"
  | "four-pillars"
  | "mindfulness-checkin"
  | "wearables"
  | "achievements"
  | "spiritual"
  | "tip-of-the-day"
  | "quote"
  | "ai-coach"
  | "philanthropy"
  | "recipes"
  | "next-visit"
  | "regimen"
  | "messages";

export interface PortalWidgetDef {
  id: PortalWidgetId;
  label: string;
  description: string;
  emoji: string;
  /** Whether the widget is visible by default for a fresh patient. */
  defaultVisible: boolean;
  /** Whether the patient can hide the widget. Some are essential. */
  required?: boolean;
}

export const PORTAL_WIDGETS: PortalWidgetDef[] = [
  {
    id: "plant-health",
    label: "Plant health",
    description: "Your living cannabis plant — the daily snapshot.",
    emoji: "\u{1F33F}",
    defaultVisible: true,
    required: true,
  },
  {
    id: "four-pillars",
    label: "Four Pillars",
    description: "Physical / mental / emotional / spiritual bar graph.",
    emoji: "\u{1F4CA}",
    defaultVisible: true,
  },
  {
    id: "mindfulness-checkin",
    label: "Mindfulness check-in",
    description: "How are you feeling, in two taps.",
    emoji: "\u{1F60C}",
    defaultVisible: true,
  },
  {
    id: "wearables",
    label: "Wearables",
    description: "Steps, sleep, heart rate snapshot.",
    emoji: "\u{231A}",
    defaultVisible: true,
  },
  {
    id: "achievements",
    label: "Achievements",
    description: "Streaks, unlocks, and badges.",
    emoji: "\u{1F3C6}",
    defaultVisible: true,
  },
  {
    id: "spiritual",
    label: "Spiritual check-in",
    description: "Weekly faith / charity / family / nature score.",
    emoji: "\u{1F54A}\u{FE0F}",
    defaultVisible: false,
  },
  {
    id: "tip-of-the-day",
    label: "Tip of the day",
    description: "One small lifestyle tip from your toolkit.",
    emoji: "\u{1F4A1}",
    defaultVisible: true,
  },
  {
    id: "quote",
    label: "Daily quote",
    description: "A small lift to start the day.",
    emoji: "\u{1F4DD}",
    defaultVisible: false,
  },
  {
    id: "ai-coach",
    label: "AI coach",
    description: "Pick gentle / moderate / tough — get a nudge.",
    emoji: "\u{1F3AF}",
    defaultVisible: false,
  },
  {
    id: "philanthropy",
    label: "Philanthropy",
    description: "Volunteer hours and donations to your causes.",
    emoji: "\u{1F49D}",
    defaultVisible: false,
  },
  {
    id: "recipes",
    label: "Cannabis kitchen",
    description: "A pinned recipe of the week.",
    emoji: "\u{1F374}",
    defaultVisible: false,
  },
  {
    id: "next-visit",
    label: "Next visit",
    description: "Upcoming appointments.",
    emoji: "\u{1F4C5}",
    defaultVisible: true,
    required: true,
  },
  {
    id: "regimen",
    label: "Active regimen",
    description: "Current cannabis dosing plan.",
    emoji: "\u{1F33F}",
    defaultVisible: true,
  },
  {
    id: "messages",
    label: "Messages",
    description: "Your most recent care-team thread.",
    emoji: "\u{1F4AC}",
    defaultVisible: true,
  },
];

export interface PortalLayout {
  /** Ordered list of widget IDs to render top-to-bottom. */
  order: PortalWidgetId[];
  /** Widget IDs the patient has explicitly hidden. */
  hidden: PortalWidgetId[];
  /** Optional accent palette override. */
  accent?: "default" | "indigo" | "rose" | "amber" | "teal";
  /** Visual theme. */
  theme?: "system" | "light" | "dark";
  /** Typography scale. */
  textScale?: "normal" | "large";
  /** Whether to reduce animations. */
  reduceMotion?: boolean;
  /** ISO timestamp of last update. */
  updatedAt?: string;
}

const ACCENT_OPTIONS = ["default", "indigo", "rose", "amber", "teal"] as const;
const THEME_OPTIONS = ["system", "light", "dark"] as const;
const TEXT_SCALE_OPTIONS = ["normal", "large"] as const;

export function defaultLayout(): PortalLayout {
  return {
    order: PORTAL_WIDGETS.filter((w) => w.defaultVisible).map((w) => w.id),
    hidden: PORTAL_WIDGETS.filter((w) => !w.defaultVisible && !w.required).map(
      (w) => w.id,
    ),
    accent: "default",
    theme: "system",
    textScale: "normal",
    reduceMotion: false,
    updatedAt: new Date().toISOString(),
  };
}

export const PORTAL_STORAGE_KEY = (patientId: string) =>
  `portal-layout-${patientId}`;

/** Validate / clean a stored layout — drops unknown ids, restores required widgets. */
export function normalizeLayout(input: unknown): PortalLayout {
  const known = new Set(PORTAL_WIDGETS.map((w) => w.id));
  const required = PORTAL_WIDGETS.filter((w) => w.required).map((w) => w.id);

  const obj = (input as Partial<PortalLayout>) ?? {};
  const order = Array.isArray(obj.order)
    ? (obj.order.filter((id) =>
        known.has(id as PortalWidgetId),
      ) as PortalWidgetId[])
    : [];
  const hidden = Array.isArray(obj.hidden)
    ? (obj.hidden.filter((id) =>
        known.has(id as PortalWidgetId),
      ) as PortalWidgetId[])
    : [];

  // Required widgets cannot be hidden, and they must appear in the order.
  const filteredHidden = hidden.filter(
    (id) => !required.includes(id as PortalWidgetId),
  );
  const orderWithRequired = [...order];
  for (const id of required) {
    if (!orderWithRequired.includes(id as PortalWidgetId)) {
      orderWithRequired.push(id as PortalWidgetId);
    }
  }

  const accent = (
    ACCENT_OPTIONS as readonly string[]
  ).includes(obj.accent ?? "default")
    ? (obj.accent ?? "default")
    : "default";
    
  const theme = (
    THEME_OPTIONS as readonly string[]
  ).includes(obj.theme ?? "system")
    ? (obj.theme ?? "system")
    : "system";
    
  const textScale = (
    TEXT_SCALE_OPTIONS as readonly string[]
  ).includes(obj.textScale ?? "normal")
    ? (obj.textScale ?? "normal")
    : "normal";

  return {
    order: orderWithRequired,
    hidden: filteredHidden,
    accent: accent as PortalLayout["accent"],
    theme: theme as PortalLayout["theme"],
    textScale: textScale as PortalLayout["textScale"],
    reduceMotion: Boolean(obj.reduceMotion),
    updatedAt: typeof obj.updatedAt === "string" ? obj.updatedAt : new Date().toISOString(),
  };
}

/** Move a widget up or down in the layout order. */
export function reorderWidget(
  layout: PortalLayout,
  id: PortalWidgetId,
  direction: "up" | "down",
): PortalLayout {
  const idx = layout.order.indexOf(id);
  if (idx < 0) return layout;
  const next = [...layout.order];
  const swapWith = direction === "up" ? idx - 1 : idx + 1;
  if (swapWith < 0 || swapWith >= next.length) return layout;
  [next[idx], next[swapWith]] = [next[swapWith], next[idx]];
  return { ...layout, order: next, updatedAt: new Date().toISOString() };
}

/** Hide a widget. No-ops on required widgets. */
export function hideWidget(
  layout: PortalLayout,
  id: PortalWidgetId,
): PortalLayout {
  const def = PORTAL_WIDGETS.find((w) => w.id === id);
  if (!def || def.required) return layout;
  if (layout.hidden.includes(id)) return layout;
  return {
    ...layout,
    hidden: [...layout.hidden, id],
    order: layout.order.filter((x) => x !== id),
    updatedAt: new Date().toISOString(),
  };
}

/** Show a previously hidden widget. Inserts at the bottom of the order. */
export function showWidget(
  layout: PortalLayout,
  id: PortalWidgetId,
): PortalLayout {
  if (!layout.hidden.includes(id)) return layout;
  return {
    ...layout,
    hidden: layout.hidden.filter((x) => x !== id),
    order: layout.order.includes(id) ? layout.order : [...layout.order, id],
    updatedAt: new Date().toISOString(),
  };
}

/** Reset to the platform default layout. */
export function resetLayout(): PortalLayout {
  return defaultLayout();
}

/** Resolve the visible widget defs in display order. */
export function visibleWidgets(layout: PortalLayout): PortalWidgetDef[] {
  return layout.order
    .map((id) => PORTAL_WIDGETS.find((w) => w.id === id))
    .filter((w): w is PortalWidgetDef => Boolean(w));
}
