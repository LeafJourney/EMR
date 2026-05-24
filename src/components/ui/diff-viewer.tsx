"use client";

// DiffViewer — single primitive for every before/after surface in EMR.
//
// We had three local diff renderers (audit log detail, practice
// configuration history, the workbench ad-hoc compares) that all looked
// "close, but not the same." This component is the one truth: pass it
// two values plus a format and it does the rest.
//
// API contract:
//
//   <DiffViewer
//     left=...
//     right=...
//     format="text" | "json"
//     view="inline" | "split"   // optional; defaults split on wide screens
//     leftLabel="Before"
//     rightLabel="After"
//     context={3}               // unchanged lines shown around each change
//     showLineNumbers
//     allowCopy
//   />
//
// Rendering rules (text mode):
//   - additions: green background, "+" gutter
//   - deletions: red background, "−" gutter
//   - context:   neutral text, " " gutter, line numbers from both sides
//   - inside changed adjacent del/add pairs, word-level highlights mark
//     the actual edited tokens via diffWords()
//   - long stretches of unchanged context collapse behind a "Show N more
//     lines" affordance (3 lines before/after by default)
//
// Rendering rules (JSON mode):
//   - one row per change record from diffJson()
//   - kind shown as a coloured pill (add / del / change), path in mono,
//     before/after values pretty-printed on the right
//   - split layout puts before / after side by side, inline stacks them
//   - unchanged keys are omitted (we already know they didn't change)
//
// Style: monospace for code regions, hairline borders, neutral chrome,
// Apple-iOS feel (rounded-xl, subtle blur, tight type). Tokens come from
// the existing design system (text-text, text-text-muted, border, etc.)
// so light/dark mode comes for free.

import * as React from "react";
import { Copy, Check, ChevronDown, Columns2, AlignJustify } from "lucide-react";

import { cn } from "@/lib/utils/cn";
import {
  diffJson,
  diffText,
  diffWords,
  hunksForTextDiff,
  summarizeJsonDiff,
  summarizeTextDiff,
  type JsonDiffEntry,
  type TextDiffLine,
} from "@/lib/ui/diff-engine";

type ViewMode = "inline" | "split";

export interface DiffViewerProps {
  /** Left-hand value. For text mode pass a string; for JSON mode pass any
   *  JSON-serialisable value (an object, array, primitive, or null). */
  left: unknown;
  right: unknown;
  format: "text" | "json";
  /** Force a layout. Without this we default to split on wide screens. */
  view?: ViewMode;
  leftLabel?: string;
  rightLabel?: string;
  /** Show line-number gutters in text mode. Defaults true. */
  showLineNumbers?: boolean;
  /** Lines of context shown around each change before folding. Default 3. */
  context?: number;
  /** Show the Copy left / Copy right buttons. Default true. */
  allowCopy?: boolean;
  /** Extra classes on the outer container. */
  className?: string;
  /** Caption rendered above the diff grid (e.g. headline / summary). */
  caption?: React.ReactNode;
}

export function DiffViewer({
  left,
  right,
  format,
  view,
  leftLabel = "Before",
  rightLabel = "After",
  showLineNumbers = true,
  context = 3,
  allowCopy = true,
  className,
  caption,
}: DiffViewerProps) {
  // Default view follows viewport width. We do this in JS rather than
  // pure CSS because the inline/split modes have meaningfully different
  // DOM shapes; resizing through media-only would require two renders.
  const [autoView, setAutoView] = React.useState<ViewMode>("split");
  React.useEffect(() => {
    if (view) return;
    const mq = window.matchMedia("(min-width: 900px)");
    const sync = () => setAutoView(mq.matches ? "split" : "inline");
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, [view]);
  const [overrideView, setOverrideView] = React.useState<ViewMode | null>(null);
  const effectiveView: ViewMode = overrideView ?? view ?? autoView;

  return (
    <div
      className={cn(
        "rounded-xl border border-border bg-surface/80 backdrop-blur-md overflow-hidden",
        className,
      )}
    >
      <DiffHeader
        leftLabel={leftLabel}
        rightLabel={rightLabel}
        view={effectiveView}
        onToggleView={() =>
          setOverrideView(effectiveView === "split" ? "inline" : "split")
        }
        leftCopy={allowCopy ? stringifyForCopy(left, format) : null}
        rightCopy={allowCopy ? stringifyForCopy(right, format) : null}
        caption={caption}
        format={format}
      />
      {format === "text" ? (
        <TextDiff
          left={String(left ?? "")}
          right={String(right ?? "")}
          view={effectiveView}
          showLineNumbers={showLineNumbers}
          context={context}
          leftLabel={leftLabel}
          rightLabel={rightLabel}
        />
      ) : (
        <JsonDiff
          left={left}
          right={right}
          view={effectiveView}
          leftLabel={leftLabel}
          rightLabel={rightLabel}
        />
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Header — labels, layout toggle, copy buttons, summary counts.              */
/* -------------------------------------------------------------------------- */

interface DiffHeaderProps {
  leftLabel: string;
  rightLabel: string;
  view: ViewMode;
  onToggleView: () => void;
  leftCopy: string | null;
  rightCopy: string | null;
  caption?: React.ReactNode;
  format: "text" | "json";
}

function DiffHeader({
  leftLabel,
  rightLabel,
  view,
  onToggleView,
  leftCopy,
  rightCopy,
  caption,
  format,
}: DiffHeaderProps) {
  return (
    <div className="flex items-center justify-between gap-3 px-3 py-2 border-b border-border bg-surface-muted/40">
      <div className="flex items-center gap-2 text-[11px] uppercase tracking-wider text-text-muted">
        {caption ? (
          <span className="normal-case tracking-normal text-text text-[12px]">{caption}</span>
        ) : (
          <>
            <span>{leftLabel}</span>
            <span aria-hidden="true">→</span>
            <span>{rightLabel}</span>
            <span className="lowercase tracking-normal opacity-60">· {format}</span>
          </>
        )}
      </div>
      <div className="flex items-center gap-1">
        {leftCopy !== null && (
          <CopyButton text={leftCopy} label={`Copy ${leftLabel.toLowerCase()}`} />
        )}
        {rightCopy !== null && (
          <CopyButton text={rightCopy} label={`Copy ${rightLabel.toLowerCase()}`} />
        )}
        <button
          type="button"
          onClick={onToggleView}
          className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] text-text-muted hover:text-text hover:bg-surface-muted transition-colors"
          aria-label={`Switch to ${view === "split" ? "inline" : "split"} view`}
          title={`Switch to ${view === "split" ? "inline" : "split"} view`}
        >
          {view === "split" ? (
            <Columns2 className="h-3.5 w-3.5" />
          ) : (
            <AlignJustify className="h-3.5 w-3.5" />
          )}
          <span className="hidden sm:inline">{view === "split" ? "Split" : "Inline"}</span>
        </button>
      </div>
    </div>
  );
}

function CopyButton({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = React.useState(false);
  const timer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  React.useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  const onClick = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard can fail (insecure context, permissions). We silently
      // ignore — the affordance is non-critical and the alternative is
      // a console error operators don't care about.
    }
  };

  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] text-text-muted hover:text-text hover:bg-surface-muted transition-colors"
      aria-label={label}
      title={label}
    >
      {copied ? (
        <Check className="h-3.5 w-3.5 text-success" />
      ) : (
        <Copy className="h-3.5 w-3.5" />
      )}
    </button>
  );
}

/* -------------------------------------------------------------------------- */
/* Text diff renderer                                                         */
/* -------------------------------------------------------------------------- */

interface TextDiffProps {
  left: string;
  right: string;
  view: ViewMode;
  showLineNumbers: boolean;
  context: number;
  leftLabel: string;
  rightLabel: string;
}

function TextDiff({
  left,
  right,
  view,
  showLineNumbers,
  context,
}: TextDiffProps) {
  // Memoise — the diff engine is pure and the inputs are large strings.
  const lines = React.useMemo(() => diffText(left, right), [left, right]);
  const hunks = React.useMemo(
    () => hunksForTextDiff(lines, context),
    [lines, context],
  );
  const summary = React.useMemo(() => summarizeTextDiff(lines), [lines]);

  // Pre-compute word-level segments for each adjacent del/add pair so the
  // renderer doesn't recompute on every keystroke of a parent input.
  // Map keyed by `${leftLine}|${rightLine}` so we can look up at render.
  const wordHighlights = React.useMemo(() => {
    const map = new Map<string, ReturnType<typeof diffWords>>();
    for (let i = 0; i < lines.length - 1; i++) {
      const cur = lines[i];
      const next = lines[i + 1];
      if (cur.kind === "del" && next.kind === "add") {
        const segs = diffWords(cur.text, next.text);
        map.set(`L${cur.leftLine}`, segs);
        map.set(`R${next.rightLine}`, segs);
      }
    }
    return map;
  }, [lines]);

  if (left === right) {
    return (
      <div className="px-4 py-8 text-center text-[12px] text-text-muted">
        No textual differences.
      </div>
    );
  }

  return (
    <div>
      <div className="px-3 py-1.5 text-[11px] text-text-muted border-b border-border bg-surface-muted/20 font-mono flex items-center gap-3">
        <span className="text-emerald-700 dark:text-emerald-300">+{summary.added}</span>
        <span className="text-rose-700 dark:text-rose-300">−{summary.removed}</span>
        <span className="opacity-70">{summary.unchanged} unchanged</span>
      </div>
      <div className="font-mono text-[12px] leading-relaxed">
        {view === "split" ? (
          <SplitText
            hunks={hunks}
            showLineNumbers={showLineNumbers}
            wordHighlights={wordHighlights}
          />
        ) : (
          <InlineText
            hunks={hunks}
            showLineNumbers={showLineNumbers}
            wordHighlights={wordHighlights}
          />
        )}
      </div>
    </div>
  );
}

/* ----- Inline text view --------------------------------------------------- */

interface InlineTextProps {
  hunks: ReturnType<typeof hunksForTextDiff>;
  showLineNumbers: boolean;
  wordHighlights: Map<string, ReturnType<typeof diffWords>>;
}

function InlineText({ hunks, showLineNumbers, wordHighlights }: InlineTextProps) {
  const [expanded, setExpanded] = React.useState<Set<number>>(new Set());

  return (
    <div>
      {hunks.map((hunk, hIdx) => {
        if (hunk.kind === "fold" && !expanded.has(hIdx)) {
          return (
            <FoldRow
              key={`f-${hIdx}`}
              count={hunk.hiddenCount ?? hunk.lines.length}
              onExpand={() =>
                setExpanded((s) => {
                  const next = new Set(s);
                  next.add(hIdx);
                  return next;
                })
              }
            />
          );
        }
        return (
          <div key={`h-${hIdx}`}>
            {hunk.lines.map((line, lIdx) => (
              <InlineLine
                key={`${hIdx}-${lIdx}`}
                line={line}
                showLineNumbers={showLineNumbers}
                wordSegments={
                  line.kind === "del"
                    ? wordHighlights.get(`L${line.leftLine}`)?.left
                    : line.kind === "add"
                      ? wordHighlights.get(`R${line.rightLine}`)?.right
                      : undefined
                }
              />
            ))}
          </div>
        );
      })}
    </div>
  );
}

function InlineLine({
  line,
  showLineNumbers,
  wordSegments,
}: {
  line: TextDiffLine;
  showLineNumbers: boolean;
  wordSegments?: ReturnType<typeof diffWords>["left"];
}) {
  const gutter = line.kind === "add" ? "+" : line.kind === "del" ? "−" : " ";
  const rowClass =
    line.kind === "add"
      ? "bg-emerald-50/70 dark:bg-emerald-950/30"
      : line.kind === "del"
        ? "bg-rose-50/70 dark:bg-rose-950/30"
        : "";
  const textClass =
    line.kind === "add"
      ? "text-emerald-900 dark:text-emerald-200"
      : line.kind === "del"
        ? "text-rose-900 dark:text-rose-200"
        : "text-text-muted";

  return (
    <div className={cn("flex items-stretch border-b border-border/30", rowClass)}>
      {showLineNumbers && (
        <>
          <LineNumber n={line.leftLine} />
          <LineNumber n={line.rightLine} />
        </>
      )}
      <div className="w-5 shrink-0 select-none text-center text-text-muted/70">
        {gutter}
      </div>
      <pre
        className={cn(
          "flex-1 whitespace-pre-wrap break-all px-2 py-0.5",
          textClass,
        )}
      >
        {wordSegments ? renderWordSegments(wordSegments, line.kind) : line.text || " "}
      </pre>
    </div>
  );
}

/* ----- Split text view ---------------------------------------------------- */

interface SplitTextProps {
  hunks: ReturnType<typeof hunksForTextDiff>;
  showLineNumbers: boolean;
  wordHighlights: Map<string, ReturnType<typeof diffWords>>;
}

interface SplitRow {
  left?: TextDiffLine;
  right?: TextDiffLine;
}

/** Pair del/add runs into rows for the split layout. */
function pairForSplit(lines: TextDiffLine[]): SplitRow[] {
  const rows: SplitRow[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (line.kind === "eq") {
      rows.push({ left: line, right: line });
      i++;
      continue;
    }
    // Collect a contiguous run of del/add and zip them positionally.
    const dels: TextDiffLine[] = [];
    const adds: TextDiffLine[] = [];
    while (i < lines.length && lines[i].kind !== "eq") {
      if (lines[i].kind === "del") dels.push(lines[i]);
      else adds.push(lines[i]);
      i++;
    }
    const max = Math.max(dels.length, adds.length);
    for (let k = 0; k < max; k++) {
      rows.push({ left: dels[k], right: adds[k] });
    }
  }
  return rows;
}

function SplitText({ hunks, showLineNumbers, wordHighlights }: SplitTextProps) {
  const [expanded, setExpanded] = React.useState<Set<number>>(new Set());

  return (
    <div>
      {hunks.map((hunk, hIdx) => {
        if (hunk.kind === "fold" && !expanded.has(hIdx)) {
          return (
            <FoldRow
              key={`f-${hIdx}`}
              count={hunk.hiddenCount ?? hunk.lines.length}
              onExpand={() =>
                setExpanded((s) => {
                  const next = new Set(s);
                  next.add(hIdx);
                  return next;
                })
              }
              split
            />
          );
        }
        const rows = pairForSplit(hunk.lines);
        return (
          <div key={`h-${hIdx}`}>
            {rows.map((row, rIdx) => (
              <SplitLine
                key={`${hIdx}-${rIdx}`}
                row={row}
                showLineNumbers={showLineNumbers}
                wordHighlights={wordHighlights}
              />
            ))}
          </div>
        );
      })}
    </div>
  );
}

function SplitLine({
  row,
  showLineNumbers,
  wordHighlights,
}: {
  row: SplitRow;
  showLineNumbers: boolean;
  wordHighlights: Map<string, ReturnType<typeof diffWords>>;
}) {
  return (
    <div className="grid grid-cols-2 divide-x divide-border/40 border-b border-border/30">
      <HalfLine
        line={row.left}
        side="left"
        showLineNumbers={showLineNumbers}
        wordSegments={
          row.left?.kind === "del"
            ? wordHighlights.get(`L${row.left.leftLine}`)?.left
            : undefined
        }
      />
      <HalfLine
        line={row.right}
        side="right"
        showLineNumbers={showLineNumbers}
        wordSegments={
          row.right?.kind === "add"
            ? wordHighlights.get(`R${row.right.rightLine}`)?.right
            : undefined
        }
      />
    </div>
  );
}

function HalfLine({
  line,
  side,
  showLineNumbers,
  wordSegments,
}: {
  line: TextDiffLine | undefined;
  side: "left" | "right";
  showLineNumbers: boolean;
  wordSegments?: ReturnType<typeof diffWords>["left"];
}) {
  if (!line) {
    // Empty placeholder so paired rows still line up.
    return <div className="bg-surface-muted/20 min-h-[1.5em]" aria-hidden="true" />;
  }
  const isAdd = line.kind === "add";
  const isDel = line.kind === "del";
  const bg = isAdd
    ? "bg-emerald-50/70 dark:bg-emerald-950/30"
    : isDel
      ? "bg-rose-50/70 dark:bg-rose-950/30"
      : "";
  const text = isAdd
    ? "text-emerald-900 dark:text-emerald-200"
    : isDel
      ? "text-rose-900 dark:text-rose-200"
      : "text-text-muted";
  const gutter = isAdd ? "+" : isDel ? "−" : " ";

  return (
    <div className={cn("flex items-stretch", bg)}>
      {showLineNumbers && (
        <LineNumber n={side === "left" ? line.leftLine : line.rightLine} />
      )}
      <div className="w-5 shrink-0 select-none text-center text-text-muted/70">
        {gutter}
      </div>
      <pre className={cn("flex-1 whitespace-pre-wrap break-all px-2 py-0.5", text)}>
        {wordSegments ? renderWordSegments(wordSegments, line.kind) : line.text || " "}
      </pre>
    </div>
  );
}

function LineNumber({ n }: { n: number | undefined }) {
  return (
    <span className="w-10 shrink-0 select-none text-right pr-2 text-[11px] text-text-muted/60 tabular-nums">
      {n ?? ""}
    </span>
  );
}

function FoldRow({
  count,
  onExpand,
  split = false,
}: {
  count: number;
  onExpand: () => void;
  split?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex items-center justify-center gap-2 px-3 py-1.5 text-[11px] text-text-muted bg-surface-muted/30 border-b border-border/30",
        split && "border-x border-border/40",
      )}
    >
      <button
        type="button"
        onClick={onExpand}
        className="inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 hover:text-text hover:bg-surface-muted transition-colors"
      >
        <ChevronDown className="h-3 w-3" />
        Show {count} unchanged line{count === 1 ? "" : "s"}
      </button>
    </div>
  );
}

function renderWordSegments(
  segments: ReturnType<typeof diffWords>["left"],
  lineKind: "add" | "del" | "eq",
): React.ReactNode {
  if (!segments || segments.length === 0) return " ";
  return segments.map((seg, i) => {
    if (seg.kind === "eq") return <span key={i}>{seg.text}</span>;
    // Highlight the actual changed tokens with a darker, semi-opaque
    // backplate so they pop within the already-tinted line.
    const cls =
      lineKind === "del" || seg.kind === "del"
        ? "bg-rose-300/40 dark:bg-rose-700/40 rounded-sm px-px"
        : "bg-emerald-300/40 dark:bg-emerald-700/40 rounded-sm px-px";
    return (
      <span key={i} className={cls}>
        {seg.text}
      </span>
    );
  });
}

/* -------------------------------------------------------------------------- */
/* JSON diff renderer                                                         */
/* -------------------------------------------------------------------------- */

function JsonDiff({
  left,
  right,
  view,
  leftLabel,
  rightLabel,
}: {
  left: unknown;
  right: unknown;
  view: ViewMode;
  leftLabel: string;
  rightLabel: string;
}) {
  const entries = React.useMemo(() => diffJson(left, right), [left, right]);
  const summary = React.useMemo(() => summarizeJsonDiff(entries), [entries]);

  if (entries.length === 0) {
    return (
      <div className="px-4 py-8 text-center text-[12px] text-text-muted">
        Structurally identical.
      </div>
    );
  }

  return (
    <div>
      <div className="px-3 py-1.5 text-[11px] text-text-muted border-b border-border bg-surface-muted/20 font-mono flex items-center gap-3">
        <span className="text-emerald-700 dark:text-emerald-300">+{summary.added}</span>
        <span className="text-rose-700 dark:text-rose-300">−{summary.removed}</span>
        <span className="text-amber-700 dark:text-amber-300">~{summary.changed}</span>
      </div>
      <ul className="divide-y divide-border/40">
        {entries.map((entry, i) => (
          <JsonDiffRow
            key={`${entry.path}-${i}`}
            entry={entry}
            view={view}
            leftLabel={leftLabel}
            rightLabel={rightLabel}
          />
        ))}
      </ul>
    </div>
  );
}

function JsonDiffRow({
  entry,
  view,
  leftLabel,
  rightLabel,
}: {
  entry: JsonDiffEntry;
  view: ViewMode;
  leftLabel: string;
  rightLabel: string;
}) {
  const pill =
    entry.kind === "add"
      ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200"
      : entry.kind === "del"
        ? "bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-200"
        : "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200";
  const pillText = entry.kind === "add" ? "added" : entry.kind === "del" ? "removed" : "changed";

  return (
    <li className="px-3 py-2.5">
      <div className="flex items-center gap-2 mb-1.5">
        <span
          className={cn(
            "inline-flex items-center px-1.5 py-px rounded text-[10px] uppercase tracking-wider font-medium",
            pill,
          )}
        >
          {pillText}
        </span>
        <code className="font-mono text-[12px] text-text-muted break-all">
          {entry.path || "<root>"}
        </code>
      </div>
      {view === "split" ? (
        <div className="grid grid-cols-2 gap-2">
          <JsonSide
            label={leftLabel}
            value={entry.kind === "add" ? undefined : entry.left}
            tone={entry.kind === "add" ? "muted" : "del"}
          />
          <JsonSide
            label={rightLabel}
            value={entry.kind === "del" ? undefined : entry.right}
            tone={entry.kind === "del" ? "muted" : "add"}
          />
        </div>
      ) : (
        <div className="grid gap-1.5">
          {entry.kind !== "add" && (
            <JsonSide label={leftLabel} value={entry.left} tone="del" prefix="−" />
          )}
          {entry.kind !== "del" && (
            <JsonSide label={rightLabel} value={entry.right} tone="add" prefix="+" />
          )}
        </div>
      )}
    </li>
  );
}

function JsonSide({
  label,
  value,
  tone,
  prefix,
}: {
  label: string;
  value: unknown;
  tone: "add" | "del" | "muted";
  prefix?: string;
}) {
  const cls =
    tone === "add"
      ? "bg-emerald-50/60 dark:bg-emerald-950/30 text-emerald-900 dark:text-emerald-200 border-emerald-200/60 dark:border-emerald-900/50"
      : tone === "del"
        ? "bg-rose-50/60 dark:bg-rose-950/30 text-rose-900 dark:text-rose-200 border-rose-200/60 dark:border-rose-900/50"
        : "bg-surface-muted/30 text-text-muted/60 border-border/40";
  return (
    <div className={cn("rounded-md border px-2.5 py-1.5", cls)}>
      <div className="text-[9px] uppercase tracking-wider opacity-70 mb-1">{label}</div>
      <pre className="font-mono text-[12px] whitespace-pre-wrap break-all">
        {prefix ? `${prefix} ` : ""}
        {formatJsonValue(value)}
      </pre>
    </div>
  );
}

function formatJsonValue(v: unknown): string {
  if (typeof v === "undefined") return "—";
  try {
    return JSON.stringify(v, null, 2) ?? String(v);
  } catch {
    return "[unserialisable]";
  }
}

/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */

function stringifyForCopy(v: unknown, format: "text" | "json"): string {
  if (format === "text") return String(v ?? "");
  try {
    return JSON.stringify(v, null, 2) ?? String(v);
  } catch {
    return String(v);
  }
}
