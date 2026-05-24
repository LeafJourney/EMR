// SAFE: dead-export-allowed reason="Lab slash-pull helper for EMR-702"

/**
 * EMR-702 — Lab slash-pull + trending.
 *
 * Renders chart lab values inline in a note. Two flavors of slash command:
 *
 *   - `/labs`                — render every panel + standalone marker found
 *                              for this patient.
 *   - `/<marker-or-panel>`   — render just one (e.g. `/HbA1c`, `/BMP`,
 *                              `/lipid`, `/creatinine`).
 *
 * Trending: for any marker with a previous reading, the format is
 *   "Marker Name: current_value unit (current_date). Previous: prev_value unit (prev_date)."
 * Otherwise just `"Marker Name: value unit (date)."`.
 *
 * Pure functions over plain data — no I/O, no database. The caller hydrates
 * the `LabValue[]` from Prisma and hands it to `renderSlashLabPull`.
 */

export interface LabValue {
  /** Canonical marker name as displayed in the note. */
  marker: string;
  /** Numeric value. Strings allowed for ratio-style markers (e.g. "7.4%"). */
  value: number | string;
  /** Unit suffix appended after the value with a space (e.g. "mg/dL"). Pass
   *  empty string for ratio-style markers whose value already carries `%`. */
  unit: string;
  /** Capture date — used for sorting, trending, and short-form display. */
  capturedAt: Date;
}

export interface LabPanel {
  /** Slash-command name without the leading slash, lower-cased. */
  slug: string;
  /** Display name rendered above the panel children. */
  displayName: string;
  /** Member markers, in canonical render order. */
  markers: string[];
}

export const LAB_PANELS: readonly LabPanel[] = [
  {
    slug: "hba1c",
    displayName: "Hemoglobin A1c",
    markers: ["Hemoglobin A1c"],
  },
  {
    slug: "bmp",
    displayName: "BMP",
    markers: [
      "Sodium",
      "Potassium",
      "Creatinine",
      "eGFR",
      "Fasting Glucose",
    ],
  },
  {
    slug: "lipid",
    displayName: "Lipid panel",
    markers: ["Total Cholesterol", "HDL", "VLDL", "LDL", "ApoB", "LpA"],
  },
];

const PANEL_BY_SLUG = new Map<string, LabPanel>();
for (const p of LAB_PANELS) PANEL_BY_SLUG.set(p.slug, p);

function shortDate(d: Date): string {
  return `${d.getUTCMonth() + 1}/${d.getUTCDate()}`;
}

function formatValue(v: LabValue): string {
  const value = typeof v.value === "number" ? String(v.value) : v.value;
  const unit = v.unit ? ` ${v.unit}` : "";
  return `${value}${unit}`;
}

/**
 * Pick (current, previous) for a given marker from a flat list of values.
 * Most-recent wins for current; second-most-recent wins for previous.
 */
function trendedPair(
  values: LabValue[],
  marker: string,
): { current: LabValue; previous: LabValue | null } | null {
  const matched = values
    .filter((v) => v.marker.toLowerCase() === marker.toLowerCase())
    .sort((a, b) => b.capturedAt.getTime() - a.capturedAt.getTime());
  if (matched.length === 0) return null;
  return { current: matched[0], previous: matched[1] ?? null };
}

/**
 * Render a single marker as a one-line trended sentence. Returns null when
 * the marker has no values on file.
 */
export function renderMarkerLine(
  values: LabValue[],
  marker: string,
): string | null {
  const pair = trendedPair(values, marker);
  if (!pair) return null;
  const { current, previous } = pair;
  const head = `${marker}: ${formatValue(current)} (${shortDate(current.capturedAt)}).`;
  if (!previous) return head;
  return `${head} Previous: ${formatValue(previous)} (${shortDate(previous.capturedAt)}).`;
}

/**
 * Render a whole panel. Heading uses `displayName`; member markers render
 * inline, semicolon-separated, with units, for the EMR-702 acceptance shape.
 * Returns null when no member has a value on file.
 */
export function renderPanel(values: LabValue[], slug: string): string | null {
  const panel = PANEL_BY_SLUG.get(slug.toLowerCase());
  if (!panel) return null;

  // single-marker "panels" (HbA1c) render the long trended sentence.
  if (panel.markers.length === 1) {
    return renderMarkerLine(values, panel.markers[0]);
  }

  const inline: string[] = [];
  for (const m of panel.markers) {
    const pair = trendedPair(values, m);
    if (!pair) continue;
    inline.push(`${m}: ${formatValue(pair.current)}`);
  }
  if (inline.length === 0) return null;
  return `${panel.displayName} — ${inline.join("; ")}.`;
}

/**
 * Top-level slash command dispatcher. Handles:
 *   /labs           -> every panel that has data, plus standalone trended A1c
 *   /<panel-slug>   -> just that panel
 *   /<marker-name>  -> just that marker (full trended sentence)
 */
export function renderSlashLabPull(
  values: LabValue[],
  slashCommand: string,
): string {
  const phrase = slashCommand.trim().replace(/^\//, "").toLowerCase();

  if (phrase === "labs") {
    const blocks: string[] = [];
    for (const panel of LAB_PANELS) {
      const out = renderPanel(values, panel.slug);
      if (out) blocks.push(out);
    }
    return blocks.join("\n");
  }

  // Try panel first.
  const panelOut = renderPanel(values, phrase);
  if (panelOut) return panelOut;

  // Fall back to individual marker. The slash uses display-name spelling.
  const marker = values.find(
    (v) => v.marker.toLowerCase() === phrase,
  )?.marker;
  if (marker) {
    return renderMarkerLine(values, marker) ?? "";
  }

  return "";
}
