// EMR-747 — JSON diff renderer for the audit-log detail page.
//
// The detail page renders a `before` / `after` Json pair from a
// ControllerAuditLog row. We want a side-by-side, line-by-line diff with
// per-key colouring:
//
//   - red   — key present in `before`, absent in `after`   (removed)
//   - green — key absent in `before`, present in `after`   (added)
//   - amber — key present in both but value differs        (changed)
//   - none  — key present in both with equal values        (unchanged)
//
// The renderer is deliberately simple: we walk the top-level keys of an
// object (deep-equality on nested values), then pretty-print each
// (key, value) pair with `JSON.stringify(_, null, 2)`. The two sides
// always render the same set of keys so rows line up visually — missing
// keys render as an empty placeholder line on their side.
//
// Why "top-level keys only": audit payloads are flat-ish (the controller
// surface emits one change per row). Nested diffs would be nicer but the
// branching gets hairy fast and "the whole sub-object changed" is the
// right call for a forensic surface. Operators can fall back to the raw
// JSON beneath the diff when they need the gory details.
//
// No `server-only` import — this module is shared with the test runner
// and is logically pure. The Next page that consumes it is what enforces
// the server boundary.

/** Per-key classification for the diff. */
export type AuditDiffKind = "added" | "removed" | "changed" | "unchanged";

/** One row of the side-by-side renderer. */
export interface AuditDiffLine {
  key: string;
  kind: AuditDiffKind;
  /** Pretty-printed `key: value` from the BEFORE side. Empty when added. */
  before: string;
  /** Pretty-printed `key: value` from the AFTER  side. Empty when removed. */
  after: string;
}

/** Stable structural equality — used to classify "changed" vs "unchanged". */
function deepEqual(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (a == null || b == null) return false;
  if (typeof a !== typeof b) return false;
  if (typeof a !== "object") return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
      if (!deepEqual(a[i], b[i])) return false;
    }
    return true;
  }
  const aKeys = Object.keys(a as Record<string, unknown>).sort();
  const bKeys = Object.keys(b as Record<string, unknown>).sort();
  if (aKeys.length !== bKeys.length) return false;
  for (let i = 0; i < aKeys.length; i++) {
    if (aKeys[i] !== bKeys[i]) return false;
  }
  for (const k of aKeys) {
    if (
      !deepEqual(
        (a as Record<string, unknown>)[k],
        (b as Record<string, unknown>)[k],
      )
    ) {
      return false;
    }
  }
  return true;
}

/**
 * Stringify a value as `"key": <json>` with 2-space indent (matching the
 * surrounding JSON.stringify aesthetic). Returns empty string when the
 * key isn't present on that side.
 */
function renderField(key: string, value: unknown, present: boolean): string {
  if (!present) return "";
  const body = safeStringify(value);
  // Indent every line of the value by two spaces so multi-line arrays /
  // objects align with the key line.
  const indented = body
    .split("\n")
    .map((line, idx) => (idx === 0 ? line : `  ${line}`))
    .join("\n");
  return `"${key}": ${indented}`;
}

function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2) ?? String(value);
  } catch {
    // Circular or non-serialisable — fall back to a tag instead of
    // crashing the page. Audit rows shouldn't carry these, but the
    // detail page is forensics-grade: degrade gracefully.
    return '"[unserialisable]"';
  }
}

/** Normalise a JSON-or-nullish input into an object for key walking. */
function toObject(input: unknown): Record<string, unknown> {
  if (input == null) return {};
  if (typeof input === "object" && !Array.isArray(input)) {
    return input as Record<string, unknown>;
  }
  // Non-object payload — render under a synthetic "_value" key so the
  // renderer still has something to align on.
  return { _value: input };
}

/**
 * Build the side-by-side diff rows for a (before, after) JSON pair.
 *
 * Key order: union of both sides, sorted lexicographically. We sort so
 * the same row pair always lines up the same way regardless of how the
 * upstream JSON laid the keys out — incidents are easier to read when
 * the layout is stable across re-renders.
 */
export function buildAuditDiff(
  before: unknown,
  after: unknown,
): AuditDiffLine[] {
  const b = toObject(before);
  const a = toObject(after);
  const keys = new Set<string>([...Object.keys(b), ...Object.keys(a)]);
  const sorted = [...keys].sort();

  const lines: AuditDiffLine[] = [];
  for (const key of sorted) {
    const inB = Object.prototype.hasOwnProperty.call(b, key);
    const inA = Object.prototype.hasOwnProperty.call(a, key);
    let kind: AuditDiffKind;
    if (inB && !inA) kind = "removed";
    else if (!inB && inA) kind = "added";
    else if (inB && inA && !deepEqual(b[key], a[key])) kind = "changed";
    else kind = "unchanged";

    lines.push({
      key,
      kind,
      before: renderField(key, b[key], inB),
      after: renderField(key, a[key], inA),
    });
  }
  return lines;
}

/**
 * Tailwind-class lookup keyed by diff kind. Centralised so the page
 * component and any future surface (e.g. a CSV-style export later) agree
 * on the colour vocabulary.
 *
 *   removed  → red    (rose-50 / rose-700)
 *   added    → green  (emerald-50 / emerald-700)
 *   changed  → amber  (amber-50 / amber-800)
 *   unchanged → muted background, default text
 */
export function diffLineClass(kind: AuditDiffKind, side: "before" | "after"): string {
  if (kind === "unchanged") return "bg-transparent text-text-muted";
  if (kind === "removed") {
    return side === "before"
      ? "bg-rose-50 text-rose-800 dark:bg-rose-950/40 dark:text-rose-200"
      : "bg-transparent text-text-muted/60";
  }
  if (kind === "added") {
    return side === "after"
      ? "bg-emerald-50 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200"
      : "bg-transparent text-text-muted/60";
  }
  // changed — both sides highlighted
  return "bg-amber-50 text-amber-900 dark:bg-amber-950/40 dark:text-amber-200";
}

/** Convenience aggregate used by the detail page summary line. */
export function summariseDiff(lines: AuditDiffLine[]): {
  added: number;
  removed: number;
  changed: number;
  unchanged: number;
} {
  const acc = { added: 0, removed: 0, changed: 0, unchanged: 0 };
  for (const l of lines) acc[l.kind]++;
  return acc;
}
