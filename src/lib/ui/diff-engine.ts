// Pure-functional diff helpers for the DiffViewer primitive.
//
// Two flavours are exported:
//
//   - diffText(a, b)  — LCS-based line-by-line diff between two strings.
//   - diffJson(a, b)  — recursive object walk producing flat path-keyed
//                       change records.
//
// Both are dependency-free and synchronous. They're shaped to be cheap to
// reuse from any rendering layer (RSC or client). The audit log,
// PracticeConfiguration history, chart-note versions, and any future
// "before/after" surface should reach for these rather than rolling
// another diff inline. We've already collected three different ad-hoc
// implementations in the codebase (`buildAuditDiff`, the
// /practices/[id]/history/diff `computeDiff`, the workbench's freeform
// comparisons); this file is the consolidation target.
//
// LCS choice: a straightforward dynamic-programming LCS with O(m·n)
// memory. For audit/config payloads that's fine — they're tens to low
// hundreds of lines. We cap input pairs at LCS_MAX_CELLS to keep
// pathological inputs from melting the server; if the budget is
// exceeded we fall back to a coarse "whole side replaced" diff. The
// callers all render through a virtualisation-friendly list so the
// only real cost is the matrix.

/** One slice of a text-level diff. `eq` lines are shared context. */
export interface TextDiffLine {
  kind: "add" | "del" | "eq";
  text: string;
  /** 1-based line number on the left side. Undefined for pure adds. */
  leftLine?: number;
  /** 1-based line number on the right side. Undefined for pure dels. */
  rightLine?: number;
}

/** A single change record from a JSON diff. */
export interface JsonDiffEntry {
  /** Dot/bracket-delimited path from the root, e.g. `users[0].email`. */
  path: string;
  kind: "add" | "del" | "change";
  left?: unknown;
  right?: unknown;
}

/**
 * Pair of strings produced by word-level diffing within a changed line.
 * Consumers render `del` runs on the left side and `add` runs on the
 * right; `eq` runs render plainly on both.
 */
export interface WordDiffSegment {
  kind: "add" | "del" | "eq";
  text: string;
}

// LCS budget. A 1000×1000 matrix is ~1MB of Int32Array, which we'd
// rather not pay for a forensic surface. Anything bigger gets the
// coarse fallback (every left line is `del`, every right line is
// `add`). This is documented in the page-level callers so operators
// know what they're looking at when they see it.
const LCS_MAX_CELLS = 1_000_000;

/**
 * Line-level LCS. Splits on `\n` (no normalisation of \r\n — callers
 * should pre-normalise if needed). Empty trailing newlines produce an
 * empty final line, which keeps round-trips faithful.
 */
export function diffText(a: string, b: string): TextDiffLine[] {
  const aLines = a.split("\n");
  const bLines = b.split("\n");

  // Cheap early outs — keep the common cases free of matrix work.
  if (a === b) {
    return aLines.map((text, i) => ({
      kind: "eq",
      text,
      leftLine: i + 1,
      rightLine: i + 1,
    }));
  }
  if (a.length === 0) {
    return bLines.map((text, i) => ({
      kind: "add",
      text,
      rightLine: i + 1,
    }));
  }
  if (b.length === 0) {
    return aLines.map((text, i) => ({
      kind: "del",
      text,
      leftLine: i + 1,
    }));
  }

  // Coarse fallback if the matrix would be too large. We still return
  // a structurally valid diff so the renderer doesn't need a special
  // case, but it'll look like "everything changed".
  if (aLines.length * bLines.length > LCS_MAX_CELLS) {
    const out: TextDiffLine[] = [];
    aLines.forEach((text, i) => out.push({ kind: "del", text, leftLine: i + 1 }));
    bLines.forEach((text, i) => out.push({ kind: "add", text, rightLine: i + 1 }));
    return out;
  }

  // Build the LCS length table. Row 0 / column 0 are zero by Int32Array
  // initialisation, which lets us index from 1.
  const m = aLines.length;
  const n = bLines.length;
  const width = n + 1;
  const dp = new Int32Array((m + 1) * width);

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const idx = i * width + j;
      if (aLines[i - 1] === bLines[j - 1]) {
        dp[idx] = dp[(i - 1) * width + (j - 1)] + 1;
      } else {
        const up = dp[(i - 1) * width + j];
        const left = dp[i * width + (j - 1)];
        dp[idx] = up >= left ? up : left;
      }
    }
  }

  // Backtrack to recover the script. Push to a buffer reversed at the
  // end so we don't pay for an O(n) shift on every step.
  const reversed: TextDiffLine[] = [];
  let i = m;
  let j = n;
  while (i > 0 && j > 0) {
    if (aLines[i - 1] === bLines[j - 1]) {
      reversed.push({
        kind: "eq",
        text: aLines[i - 1],
        leftLine: i,
        rightLine: j,
      });
      i--;
      j--;
    } else if (dp[(i - 1) * width + j] >= dp[i * width + (j - 1)]) {
      reversed.push({ kind: "del", text: aLines[i - 1], leftLine: i });
      i--;
    } else {
      reversed.push({ kind: "add", text: bLines[j - 1], rightLine: j });
      j--;
    }
  }
  while (i > 0) {
    reversed.push({ kind: "del", text: aLines[i - 1], leftLine: i });
    i--;
  }
  while (j > 0) {
    reversed.push({ kind: "add", text: bLines[j - 1], rightLine: j });
    j--;
  }

  return reversed.reverse();
}

/**
 * Word-level LCS within a single line pair. Used by the renderer to
 * highlight which tokens actually changed inside a `del`/`add` row,
 * so the eye can find the meaningful edit quickly. Splits on word
 * boundaries while preserving the boundary characters as their own
 * tokens (so spaces and punctuation diff correctly).
 */
export function diffWords(a: string, b: string): {
  left: WordDiffSegment[];
  right: WordDiffSegment[];
} {
  const aTokens = tokenize(a);
  const bTokens = tokenize(b);

  if (a === b) {
    return {
      left: aTokens.length ? [{ kind: "eq", text: a }] : [],
      right: bTokens.length ? [{ kind: "eq", text: b }] : [],
    };
  }

  const m = aTokens.length;
  const n = bTokens.length;
  if (m === 0) return { left: [], right: [{ kind: "add", text: b }] };
  if (n === 0) return { left: [{ kind: "del", text: a }], right: [] };

  // Same shape as diffText, but on token arrays. Word counts are tiny
  // (single lines) so we don't bother with the cell-budget guard.
  const width = n + 1;
  const dp = new Int32Array((m + 1) * width);
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const idx = i * width + j;
      if (aTokens[i - 1] === bTokens[j - 1]) {
        dp[idx] = dp[(i - 1) * width + (j - 1)] + 1;
      } else {
        const up = dp[(i - 1) * width + j];
        const lt = dp[i * width + (j - 1)];
        dp[idx] = up >= lt ? up : lt;
      }
    }
  }

  const leftRev: WordDiffSegment[] = [];
  const rightRev: WordDiffSegment[] = [];
  let i = m;
  let j = n;
  while (i > 0 && j > 0) {
    if (aTokens[i - 1] === bTokens[j - 1]) {
      pushMerged(leftRev, "eq", aTokens[i - 1]);
      pushMerged(rightRev, "eq", bTokens[j - 1]);
      i--;
      j--;
    } else if (dp[(i - 1) * width + j] >= dp[i * width + (j - 1)]) {
      pushMerged(leftRev, "del", aTokens[i - 1]);
      i--;
    } else {
      pushMerged(rightRev, "add", bTokens[j - 1]);
      j--;
    }
  }
  while (i > 0) {
    pushMerged(leftRev, "del", aTokens[i - 1]);
    i--;
  }
  while (j > 0) {
    pushMerged(rightRev, "add", bTokens[j - 1]);
    j--;
  }

  return { left: leftRev.reverse(), right: rightRev.reverse() };
}

/** Coalesce same-kind tokens so the renderer makes one span per run. */
function pushMerged(buf: WordDiffSegment[], kind: WordDiffSegment["kind"], text: string) {
  const last = buf[buf.length - 1];
  if (last && last.kind === kind) {
    last.text = text + last.text; // we're filling backwards
  } else {
    buf.push({ kind, text });
  }
}

/**
 * Token splitter for word-level diff. Returns an array including
 * whitespace and punctuation as their own tokens so the reconstruction
 * is lossless (`tokens.join("")` === input).
 */
function tokenize(s: string): string[] {
  // Match: word characters | single whitespace char | any other single char.
  // We use a regex global match — RE2-friendly, no lookbehinds.
  const re = /[A-Za-z0-9_]+|\s|[^\sA-Za-z0-9_]/g;
  return s.match(re) ?? [];
}

/* -------------------------------------------------------------------------- */
/* JSON diff                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Recursive object diff. Walks both trees in lockstep and emits one
 * record per leaf-level change. Arrays compare positionally — two
 * arrays of differing lengths produce add/del records for the trailing
 * positions. Compared values that are deep-equal produce no record.
 *
 * Path syntax: dotted for object keys, bracketed for array indices.
 *   { a: { b: 1 } }      → path "a.b"
 *   { items: [{ x: 1 }]} → path "items[0].x"
 */
export function diffJson(left: unknown, right: unknown): JsonDiffEntry[] {
  const out: JsonDiffEntry[] = [];
  walk("", left, right, out);
  return out;
}

function walk(path: string, l: unknown, r: unknown, out: JsonDiffEntry[]): void {
  // Same reference or primitive value match → nothing to do.
  if (Object.is(l, r)) return;

  const lUndef = typeof l === "undefined";
  const rUndef = typeof r === "undefined";
  if (lUndef && !rUndef) {
    out.push({ path, kind: "add", right: r });
    return;
  }
  if (rUndef && !lUndef) {
    out.push({ path, kind: "del", left: l });
    return;
  }

  // Both defined but structurally different (e.g. object vs array, or
  // either is a primitive) — emit a single change record at this path.
  const lIsArr = Array.isArray(l);
  const rIsArr = Array.isArray(r);
  const lIsObj = isPlainObject(l);
  const rIsObj = isPlainObject(r);
  const bothObjects = lIsObj && rIsObj;
  const bothArrays = lIsArr && rIsArr;
  if (!bothObjects && !bothArrays) {
    if (!deepEqual(l, r)) {
      out.push({ path, kind: "change", left: l, right: r });
    }
    return;
  }

  if (bothArrays) {
    const la = l as unknown[];
    const ra = r as unknown[];
    const max = Math.max(la.length, ra.length);
    for (let i = 0; i < max; i++) {
      const childPath = path ? `${path}[${i}]` : `[${i}]`;
      if (i >= la.length) {
        out.push({ path: childPath, kind: "add", right: ra[i] });
      } else if (i >= ra.length) {
        out.push({ path: childPath, kind: "del", left: la[i] });
      } else {
        walk(childPath, la[i], ra[i], out);
      }
    }
    return;
  }

  // bothObjects — walk the union of keys, sorted for stable output.
  const lo = l as Record<string, unknown>;
  const ro = r as Record<string, unknown>;
  const keys = new Set<string>([...Object.keys(lo), ...Object.keys(ro)]);
  for (const k of [...keys].sort()) {
    const childPath = path ? `${path}.${k}` : k;
    const inL = Object.prototype.hasOwnProperty.call(lo, k);
    const inR = Object.prototype.hasOwnProperty.call(ro, k);
    if (inL && !inR) {
      out.push({ path: childPath, kind: "del", left: lo[k] });
    } else if (!inL && inR) {
      out.push({ path: childPath, kind: "add", right: ro[k] });
    } else {
      walk(childPath, lo[k], ro[k], out);
    }
  }
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return (
    typeof v === "object" &&
    v !== null &&
    !Array.isArray(v) &&
    (Object.getPrototypeOf(v) === Object.prototype ||
      Object.getPrototypeOf(v) === null)
  );
}

/**
 * Deep equality for the primitive-vs-primitive fast path inside walk().
 * Mirrors the semantics of the recursive walker without recording.
 */
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
  const ak = Object.keys(a as Record<string, unknown>).sort();
  const bk = Object.keys(b as Record<string, unknown>).sort();
  if (ak.length !== bk.length) return false;
  for (let i = 0; i < ak.length; i++) {
    if (ak[i] !== bk[i]) return false;
  }
  for (const k of ak) {
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
 * Summary counts — convenience for headers/badges. Mirrors the shape
 * the audit-diff summariser exposed so adoption sites can swap with
 * minimal churn.
 */
export function summarizeJsonDiff(entries: JsonDiffEntry[]): {
  added: number;
  removed: number;
  changed: number;
} {
  let added = 0;
  let removed = 0;
  let changed = 0;
  for (const e of entries) {
    if (e.kind === "add") added++;
    else if (e.kind === "del") removed++;
    else changed++;
  }
  return { added, removed, changed };
}

export function summarizeTextDiff(lines: TextDiffLine[]): {
  added: number;
  removed: number;
  unchanged: number;
} {
  let added = 0;
  let removed = 0;
  let unchanged = 0;
  for (const l of lines) {
    if (l.kind === "add") added++;
    else if (l.kind === "del") removed++;
    else unchanged++;
  }
  return { added, removed, unchanged };
}

/**
 * Group consecutive `eq` runs into collapsible hunks. Returns an array
 * of segments where each segment is either a run of non-eq lines or a
 * run of eq lines that's longer than `context * 2`. Renderers use this
 * to fold long unchanged regions behind an "expand" affordance.
 *
 * The boundary `context` lines on each side of an eq run stay visible;
 * only the middle is foldable. So an eq run of 20 with context=3
 * surfaces 3 + (collapsed 14) + 3 = visible 6 + 1 fold marker.
 */
export interface DiffHunk {
  kind: "lines" | "fold";
  lines: TextDiffLine[];
  /** For folds: number of lines hidden behind the affordance. */
  hiddenCount?: number;
}

export function hunksForTextDiff(
  lines: TextDiffLine[],
  context = 3,
): DiffHunk[] {
  if (lines.length === 0) return [];

  // Mark each index as "interesting" (within `context` of a change) or
  // "foldable". A boolean array is the cheapest way to do this.
  const interesting = new Array<boolean>(lines.length).fill(false);
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].kind !== "eq") {
      for (
        let k = Math.max(0, i - context);
        k <= Math.min(lines.length - 1, i + context);
        k++
      ) {
        interesting[k] = true;
      }
    }
  }

  const hunks: DiffHunk[] = [];
  let buffer: TextDiffLine[] = [];
  let bufferInteresting = interesting[0];

  const flush = () => {
    if (buffer.length === 0) return;
    if (bufferInteresting) {
      hunks.push({ kind: "lines", lines: buffer });
    } else {
      hunks.push({ kind: "fold", lines: buffer, hiddenCount: buffer.length });
    }
    buffer = [];
  };

  for (let i = 0; i < lines.length; i++) {
    if (interesting[i] !== bufferInteresting) {
      flush();
      bufferInteresting = interesting[i];
    }
    buffer.push(lines[i]);
  }
  flush();

  return hunks;
}
