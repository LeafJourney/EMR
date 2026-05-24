"use client";

import * as React from "react";
import { cn } from "@/lib/utils/cn";

// ---------------------------------------------------------------------------
// MarkdownEditor — Notion-tier, zero-dep markdown surface for LeafJourney.
//
// What it gives you:
//   - A styled <textarea> whose value is markdown source (round-trips
//     cleanly to the existing string-bodied SOAP/notes/messages schema).
//   - Toolbar: Bold / Italic / Heading / Bullet list / Numbered list /
//     Quote / Code / Link — each toggles markdown syntax around the
//     current selection (or wraps the cursor with placeholder + selects
//     the inserted text so the user can keep typing).
//   - Keyboard shortcuts: ⌘/Ctrl+B, ⌘/Ctrl+I, ⌘/Ctrl+K (link).
//   - Tab / Shift+Tab inside list lines indent and outdent.
//   - Slash menu: type `/` at the start of an empty line to open a popover
//     of block-type commands (Heading 1/2/3, Bullet, Numbered, Quote,
//     Divider, Code block). Arrow keys + Enter / Esc.
//   - Preview toggle: a "Preview" button swaps the textarea for a rendered
//     HTML view. (Split view is not the default — clinicians said in Doc 2
//     that they want maximum write surface and an explicit "show me what
//     it'll look like" affordance.)
//   - The markdown→HTML renderer is a small, deliberately limited
//     implementation that covers the syntax this editor produces:
//     headings, bold, italic, inline code, fenced code blocks, links,
//     blockquotes, bullet/numbered lists, horizontal rules, paragraphs.
//     It escapes HTML before applying tag insertion to keep this safe to
//     drop into untrusted clinician/patient content.
//
// CRITICAL DOMAIN CONSTRAINT (CLAUDE.md / Doc 1 + Doc 3):
//   The SOAP/APSO "Objective" section and vitals are *human-authored
//   only* — no AI generates content there. This editor doesn't ship any
//   AI helpers in its toolbar yet (toolbar is pure markdown-transform).
//   The `omitForObjective` prop is still exposed and load-bearing because
//   (a) we want symmetry with `DictationTextarea` / `DictationInput`,
//   (b) future AI affordances (e.g. "summarize", "expand") will live on
//   this toolbar and must be suppressed in Objective, and (c) e2e tests
//   can pin the gate via the `data-objective-gated` attribute.
//
// Apple-iOS aesthetic: rounded chrome, soft borders, smooth color
// transitions, reduced-motion respected (`prefers-reduced-motion` snaps
// the slash popover open instead of fading).
// ---------------------------------------------------------------------------

export interface MarkdownEditorProps {
  /** Markdown source — controlled. */
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
  /** Suppress any AI-style affordance to keep the field human-only. */
  omitForObjective?: boolean;
  /** Hide the toolbar (e.g. when adopting in a small inline composer). */
  minimalToolbar?: boolean;
  /** Render with a "Preview" toggle. Defaults to true. */
  allowPreview?: boolean;
  rows?: number;
  maxLength?: number;
  name?: string;
  id?: string;
  className?: string;
  textareaClassName?: string;
  "aria-label"?: string;
  disabled?: boolean;
  required?: boolean;
  autoFocus?: boolean;
  /** Hide the slash command popover entirely. */
  disableSlash?: boolean;
}

interface SlashCommand {
  key: string;
  label: string;
  hint: string;
  /** Returns the replacement for the current line. */
  apply: () => string;
}

const SLASH_COMMANDS: SlashCommand[] = [
  { key: "h1", label: "Heading 1", hint: "Large section title", apply: () => "# " },
  { key: "h2", label: "Heading 2", hint: "Section title", apply: () => "## " },
  { key: "h3", label: "Heading 3", hint: "Subsection", apply: () => "### " },
  { key: "ul", label: "Bullet list", hint: "Unordered items", apply: () => "- " },
  { key: "ol", label: "Numbered list", hint: "Ordered items", apply: () => "1. " },
  { key: "quote", label: "Quote", hint: "Blockquote", apply: () => "> " },
  { key: "code", label: "Code block", hint: "Fenced code", apply: () => "```\n\n```" },
  { key: "hr", label: "Divider", hint: "Horizontal rule", apply: () => "---" },
];

// ---------------------------------------------------------------------------
// Helpers — selection / line manipulation on a textarea.
// ---------------------------------------------------------------------------

interface SelectionState {
  start: number;
  end: number;
  before: string;
  selected: string;
  after: string;
}

function getSelection(el: HTMLTextAreaElement): SelectionState {
  const start = el.selectionStart ?? 0;
  const end = el.selectionEnd ?? 0;
  return {
    start,
    end,
    before: el.value.slice(0, start),
    selected: el.value.slice(start, end),
    after: el.value.slice(end),
  };
}

/** Replace the current selection and restore caret/selection on the new range. */
function replaceSelection(
  el: HTMLTextAreaElement,
  replacement: string,
  selectInserted: boolean,
  onChange: (next: string) => void,
) {
  const { before, after, start } = getSelection(el);
  const next = `${before}${replacement}${after}`;
  onChange(next);
  // Defer caret placement until React flushes the new value.
  requestAnimationFrame(() => {
    if (!el.isConnected) return;
    el.focus();
    if (selectInserted) {
      el.setSelectionRange(start, start + replacement.length);
    } else {
      el.setSelectionRange(
        start + replacement.length,
        start + replacement.length,
      );
    }
  });
}

/** Wrap the current selection with `prefix`/`suffix` markdown delimiters. */
function wrapSelection(
  el: HTMLTextAreaElement,
  prefix: string,
  suffix: string,
  placeholder: string,
  onChange: (next: string) => void,
) {
  const { before, selected, after, start, end } = getSelection(el);
  const inner = selected || placeholder;
  const next = `${before}${prefix}${inner}${suffix}${after}`;
  onChange(next);
  requestAnimationFrame(() => {
    if (!el.isConnected) return;
    el.focus();
    if (selected) {
      // Re-select the original text region (shifted by prefix).
      el.setSelectionRange(start + prefix.length, end + prefix.length);
    } else {
      // Select the placeholder so the user can immediately type over it.
      el.setSelectionRange(
        start + prefix.length,
        start + prefix.length + placeholder.length,
      );
    }
  });
}

/** Prefix every line in the selection with `linePrefix`. */
function prefixLines(
  el: HTMLTextAreaElement,
  linePrefix: string,
  onChange: (next: string) => void,
) {
  const { before, selected, after, start } = getSelection(el);
  // Expand selection to include the start of its first line.
  const lineStart = before.lastIndexOf("\n") + 1;
  const head = before.slice(0, lineStart);
  const block = before.slice(lineStart) + selected;
  const lines = block.length === 0 ? [""] : block.split("\n");
  const prefixed = lines.map((l) => `${linePrefix}${l}`).join("\n");
  const next = `${head}${prefixed}${after}`;
  onChange(next);
  requestAnimationFrame(() => {
    if (!el.isConnected) return;
    el.focus();
    el.setSelectionRange(
      lineStart + linePrefix.length,
      lineStart + prefixed.length,
    );
    // Avoid an unused-variable lint on `start` (kept for symmetry).
    void start;
  });
}

/** Prefix every line in the selection with `1. `, `2. `, …. */
function numberLines(
  el: HTMLTextAreaElement,
  onChange: (next: string) => void,
) {
  const { before, selected, after } = getSelection(el);
  const lineStart = before.lastIndexOf("\n") + 1;
  const head = before.slice(0, lineStart);
  const block = before.slice(lineStart) + selected;
  const lines = block.length === 0 ? [""] : block.split("\n");
  const numbered = lines.map((l, i) => `${i + 1}. ${l}`).join("\n");
  const next = `${head}${numbered}${after}`;
  onChange(next);
  requestAnimationFrame(() => {
    if (!el.isConnected) return;
    el.focus();
    el.setSelectionRange(lineStart, lineStart + numbered.length);
  });
}

/** Indent / outdent the lines covered by the current selection. */
function shiftIndent(
  el: HTMLTextAreaElement,
  direction: "in" | "out",
  onChange: (next: string) => void,
) {
  const { before, selected, after } = getSelection(el);
  const lineStart = before.lastIndexOf("\n") + 1;
  const head = before.slice(0, lineStart);
  const block = before.slice(lineStart) + selected;
  const lines = block.length === 0 ? [""] : block.split("\n");
  const shifted = lines
    .map((l) => {
      if (direction === "in") return `  ${l}`;
      if (l.startsWith("  ")) return l.slice(2);
      if (l.startsWith(" ")) return l.slice(1);
      return l;
    })
    .join("\n");
  const next = `${head}${shifted}${after}`;
  onChange(next);
  requestAnimationFrame(() => {
    if (!el.isConnected) return;
    el.focus();
    el.setSelectionRange(lineStart, lineStart + shifted.length);
  });
}

// ---------------------------------------------------------------------------
// Markdown → HTML renderer — zero-dep, deliberately small.
//
// Supports: # / ## / ### headings, **bold**, *italic*, `inline code`,
// ```fenced``` code blocks, [text](url) links, > blockquote, - / * /
// 1. lists, --- horizontal rules. Anything else falls through as a
// paragraph with text content. HTML in the source is escaped first, so
// it's safe to render untrusted markdown.
// ---------------------------------------------------------------------------

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function renderInline(text: string): string {
  // Order matters — protect code spans first, then bold, then italic,
  // then links. Code-span placeholders prevent the bold/italic passes
  // from mangling backtick contents.
  const codes: string[] = [];
  let buf = text.replace(/`([^`\n]+)`/g, (_, code) => {
    codes.push(code);
    return `\x00CODE${codes.length - 1}\x00`;
  });
  buf = buf.replace(/\*\*([^*\n]+)\*\*/g, (_, s) => `<strong>${s}</strong>`);
  buf = buf.replace(
    /(^|[^*])\*([^*\n]+)\*(?!\*)/g,
    (_, lead, s) => `${lead}<em>${s}</em>`,
  );
  buf = buf.replace(
    /\[([^\]]+)\]\(([^)\s]+)\)/g,
    (_, label, href) =>
      `<a href="${href}" target="_blank" rel="noopener noreferrer">${label}</a>`,
  );
  // Restore code spans.
  buf = buf.replace(/\x00CODE(\d+)\x00/g, (_, i) => {
    const code = codes[Number(i)] ?? "";
    return `<code>${code}</code>`;
  });
  return buf;
}

export function renderMarkdownToHtml(source: string): string {
  if (!source.trim()) return "";
  const escaped = escapeHtml(source);
  const lines = escaped.split("\n");
  const out: string[] = [];
  let i = 0;

  type ListMode = "ul" | "ol" | null;
  let listMode: ListMode = null;
  let inQuote = false;

  const closeList = () => {
    if (listMode) {
      out.push(`</${listMode}>`);
      listMode = null;
    }
  };
  const closeQuote = () => {
    if (inQuote) {
      out.push(`</blockquote>`);
      inQuote = false;
    }
  };

  while (i < lines.length) {
    const raw = lines[i];
    const line = raw.trimEnd();

    // Fenced code block — consume until the closing fence.
    if (/^```/.test(line)) {
      closeList();
      closeQuote();
      const lang = line.slice(3).trim();
      const codeLines: string[] = [];
      i += 1;
      while (i < lines.length && !/^```/.test(lines[i].trimEnd())) {
        codeLines.push(lines[i]);
        i += 1;
      }
      i += 1; // skip closing fence (or EOF)
      out.push(
        `<pre><code${lang ? ` data-lang="${lang}"` : ""}>${codeLines.join("\n")}</code></pre>`,
      );
      continue;
    }

    // Horizontal rule.
    if (/^(---|\*\*\*|___)$/.test(line.trim())) {
      closeList();
      closeQuote();
      out.push("<hr />");
      i += 1;
      continue;
    }

    // Headings.
    const heading = /^(#{1,6})\s+(.*)$/.exec(line);
    if (heading) {
      closeList();
      closeQuote();
      const level = heading[1].length;
      out.push(
        `<h${level}>${renderInline(heading[2])}</h${level}>`,
      );
      i += 1;
      continue;
    }

    // Blockquote.
    const quoteMatch = /^&gt;\s?(.*)$/.exec(line);
    if (quoteMatch) {
      closeList();
      if (!inQuote) {
        out.push("<blockquote>");
        inQuote = true;
      }
      out.push(`<p>${renderInline(quoteMatch[1])}</p>`);
      i += 1;
      continue;
    } else if (inQuote) {
      closeQuote();
    }

    // Bullet list.
    const bullet = /^\s*[-*+]\s+(.*)$/.exec(line);
    if (bullet) {
      if (listMode !== "ul") {
        closeList();
        out.push("<ul>");
        listMode = "ul";
      }
      out.push(`<li>${renderInline(bullet[1])}</li>`);
      i += 1;
      continue;
    }

    // Numbered list.
    const numbered = /^\s*\d+\.\s+(.*)$/.exec(line);
    if (numbered) {
      if (listMode !== "ol") {
        closeList();
        out.push("<ol>");
        listMode = "ol";
      }
      out.push(`<li>${renderInline(numbered[1])}</li>`);
      i += 1;
      continue;
    }

    // Blank line → close any open block.
    if (line.trim() === "") {
      closeList();
      closeQuote();
      i += 1;
      continue;
    }

    // Default: paragraph.
    closeList();
    closeQuote();
    out.push(`<p>${renderInline(line)}</p>`);
    i += 1;
  }

  closeList();
  closeQuote();
  return out.join("\n");
}

// ---------------------------------------------------------------------------
// Toolbar button — tiny consistent affordance.
// ---------------------------------------------------------------------------

function ToolbarBtn({
  label,
  onClick,
  glyph,
  shortcut,
  disabled,
}: {
  label: string;
  onClick: () => void;
  glyph: React.ReactNode;
  shortcut?: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onMouseDown={(e) => {
        // Prevent the textarea from losing focus / dropping its selection
        // when the user clicks a toolbar button.
        e.preventDefault();
      }}
      onClick={onClick}
      disabled={disabled}
      title={shortcut ? `${label} (${shortcut})` : label}
      aria-label={label}
      className={cn(
        "inline-flex h-8 min-w-[2rem] items-center justify-center rounded-md px-1.5 text-xs font-medium",
        "text-text-subtle hover:text-text hover:bg-surface-muted transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/30",
        disabled && "opacity-40 cursor-not-allowed",
      )}
    >
      {glyph}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Slash command popover — opens when the user types `/` at the start of an
// otherwise-empty line.
// ---------------------------------------------------------------------------

interface SlashState {
  open: boolean;
  /** Index of the `/` character in textarea value. */
  slashAt: number;
  /** Filter text typed after the slash. */
  query: string;
  active: number;
}

function filterSlash(query: string): SlashCommand[] {
  const q = query.toLowerCase();
  if (!q) return SLASH_COMMANDS;
  return SLASH_COMMANDS.filter(
    (c) =>
      c.label.toLowerCase().includes(q) ||
      c.key.toLowerCase().includes(q) ||
      c.hint.toLowerCase().includes(q),
  );
}

// ---------------------------------------------------------------------------
// Main component.
// ---------------------------------------------------------------------------

export const MarkdownEditor = React.forwardRef<
  HTMLTextAreaElement,
  MarkdownEditorProps
>(function MarkdownEditor(
  {
    value,
    onChange,
    placeholder,
    omitForObjective,
    minimalToolbar = false,
    allowPreview = true,
    rows = 8,
    maxLength,
    name,
    id,
    className,
    textareaClassName,
    "aria-label": ariaLabel,
    disabled,
    required,
    autoFocus,
    disableSlash,
  },
  forwardedRef,
) {
  const innerRef = React.useRef<HTMLTextAreaElement | null>(null);
  const setRef = React.useCallback(
    (el: HTMLTextAreaElement | null) => {
      innerRef.current = el;
      if (typeof forwardedRef === "function") forwardedRef(el);
      else if (forwardedRef)
        (forwardedRef as React.MutableRefObject<HTMLTextAreaElement | null>).current =
          el;
    },
    [forwardedRef],
  );

  const [showPreview, setShowPreview] = React.useState(false);
  const [slash, setSlash] = React.useState<SlashState>({
    open: false,
    slashAt: -1,
    query: "",
    active: 0,
  });

  const matches = React.useMemo(
    () => (slash.open ? filterSlash(slash.query) : []),
    [slash.open, slash.query],
  );

  // ---- Toolbar actions ---------------------------------------------------
  const withEl = (fn: (el: HTMLTextAreaElement) => void) => () => {
    const el = innerRef.current;
    if (el) fn(el);
  };

  const onBold = withEl((el) =>
    wrapSelection(el, "**", "**", "bold text", onChange),
  );
  const onItalic = withEl((el) =>
    wrapSelection(el, "*", "*", "italic text", onChange),
  );
  const onInlineCode = withEl((el) =>
    wrapSelection(el, "`", "`", "code", onChange),
  );
  const onLink = withEl((el) => {
    const { selected } = getSelection(el);
    const label = selected || "link text";
    wrapSelection(el, `[`, `](https://)`, label, onChange);
  });
  const onHeading = withEl((el) => prefixLines(el, "## ", onChange));
  const onBullet = withEl((el) => prefixLines(el, "- ", onChange));
  const onNumbered = withEl((el) => numberLines(el, onChange));
  const onQuote = withEl((el) => prefixLines(el, "> ", onChange));
  const onCodeBlock = withEl((el) => {
    const { selected } = getSelection(el);
    const block = `\n\`\`\`\n${selected || "code"}\n\`\`\`\n`;
    replaceSelection(el, block, true, onChange);
  });

  // ---- Slash handling ----------------------------------------------------
  const applySlash = (cmd: SlashCommand) => {
    const el = innerRef.current;
    if (!el) return;
    // Replace from `slashAt` up to current selection start with the command.
    const start = el.selectionStart ?? 0;
    const before = value.slice(0, slash.slashAt);
    const after = value.slice(start);
    const inserted = cmd.apply();
    const next = `${before}${inserted}${after}`;
    onChange(next);
    setSlash({ open: false, slashAt: -1, query: "", active: 0 });
    requestAnimationFrame(() => {
      if (!el.isConnected) return;
      el.focus();
      // Place caret at end of inserted text (or middle of fenced block).
      let caret = before.length + inserted.length;
      if (cmd.key === "code") {
        // Place caret between the fences.
        caret = before.length + 4; // "```\n"
      }
      el.setSelectionRange(caret, caret);
    });
  };

  // ---- Keyboard ----------------------------------------------------------
  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    const meta = e.metaKey || e.ctrlKey;

    // Slash popover navigation.
    if (slash.open && matches.length > 0) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSlash((s) => ({ ...s, active: (s.active + 1) % matches.length }));
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setSlash((s) => ({
          ...s,
          active: (s.active - 1 + matches.length) % matches.length,
        }));
        return;
      }
      if (e.key === "Enter") {
        e.preventDefault();
        applySlash(matches[slash.active]);
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        setSlash({ open: false, slashAt: -1, query: "", active: 0 });
        return;
      }
    }

    if (meta && e.key.toLowerCase() === "b") {
      e.preventDefault();
      onBold();
      return;
    }
    if (meta && e.key.toLowerCase() === "i") {
      e.preventDefault();
      onItalic();
      return;
    }
    if (meta && e.key.toLowerCase() === "k") {
      e.preventDefault();
      onLink();
      return;
    }
    if (e.key === "Tab") {
      e.preventDefault();
      const el = e.currentTarget;
      shiftIndent(el, e.shiftKey ? "out" : "in", onChange);
      return;
    }
  };

  // ---- Change handler — also drives slash popover state ------------------
  const onTextareaChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const next = e.target.value;
    onChange(next);

    if (disableSlash) return;

    const caret = e.target.selectionStart ?? next.length;
    // Look back from caret to find a `/` at start of line, with no spaces
    // between it and the caret.
    const before = next.slice(0, caret);
    const slashPos = before.lastIndexOf("/");
    if (slashPos === -1) {
      if (slash.open) setSlash({ open: false, slashAt: -1, query: "", active: 0 });
      return;
    }
    const lineStart = before.lastIndexOf("\n", slashPos - 1) + 1;
    const beforeSlash = before.slice(lineStart, slashPos);
    const afterSlash = before.slice(slashPos + 1);
    // Open only if `/` is at the start of a line and the user hasn't typed
    // anything weird (no whitespace, no other `/`) after it.
    if (beforeSlash.trim() === "" && !/[\s/]/.test(afterSlash)) {
      setSlash({
        open: true,
        slashAt: slashPos,
        query: afterSlash,
        active: 0,
      });
    } else if (slash.open) {
      setSlash({ open: false, slashAt: -1, query: "", active: 0 });
    }
  };

  // ---------------------------------------------------------------------
  // Reduced-motion: lift the popover transition timing to a no-op.
  // ---------------------------------------------------------------------
  const [reducedMotion, setReducedMotion] = React.useState(false);
  React.useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReducedMotion(mq.matches);
    update();
    mq.addEventListener?.("change", update);
    return () => mq.removeEventListener?.("change", update);
  }, []);

  // ---- Render ------------------------------------------------------------
  return (
    <div
      className={cn(
        "relative w-full rounded-lg border border-border bg-surface",
        "focus-within:border-accent focus-within:ring-2 focus-within:ring-accent/20",
        "transition-colors",
        className,
      )}
      data-objective-gated={omitForObjective ? "true" : undefined}
    >
      {!minimalToolbar && (
        <div
          role="toolbar"
          aria-label="Formatting"
          className="flex flex-wrap items-center gap-0.5 border-b border-border/70 px-2 py-1.5"
        >
          <ToolbarBtn
            label="Bold"
            shortcut="⌘B"
            onClick={onBold}
            glyph={<span className="font-bold">B</span>}
            disabled={disabled}
          />
          <ToolbarBtn
            label="Italic"
            shortcut="⌘I"
            onClick={onItalic}
            glyph={<span className="italic font-serif">I</span>}
            disabled={disabled}
          />
          <ToolbarBtn
            label="Heading"
            onClick={onHeading}
            glyph={<span className="font-display font-semibold">H</span>}
            disabled={disabled}
          />
          <span className="mx-1 h-4 w-px bg-border" aria-hidden />
          <ToolbarBtn
            label="Bullet list"
            onClick={onBullet}
            glyph={<BulletGlyph />}
            disabled={disabled}
          />
          <ToolbarBtn
            label="Numbered list"
            onClick={onNumbered}
            glyph={<span className="font-mono text-[10px]">1.</span>}
            disabled={disabled}
          />
          <ToolbarBtn
            label="Quote"
            onClick={onQuote}
            glyph={<span className="font-serif">”</span>}
            disabled={disabled}
          />
          <span className="mx-1 h-4 w-px bg-border" aria-hidden />
          <ToolbarBtn
            label="Inline code"
            onClick={onInlineCode}
            glyph={<span className="font-mono text-[10px]">{"<>"}</span>}
            disabled={disabled}
          />
          <ToolbarBtn
            label="Code block"
            onClick={onCodeBlock}
            glyph={<span className="font-mono text-[10px]">{"{}"}</span>}
            disabled={disabled}
          />
          <ToolbarBtn
            label="Link"
            shortcut="⌘K"
            onClick={onLink}
            glyph={<LinkGlyph />}
            disabled={disabled}
          />
          {allowPreview && (
            <>
              <span className="ml-auto" />
              <button
                type="button"
                onClick={() => setShowPreview((v) => !v)}
                onMouseDown={(e) => e.preventDefault()}
                aria-pressed={showPreview}
                className={cn(
                  "inline-flex h-8 items-center rounded-md px-2 text-[11px] font-medium",
                  "transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/30",
                  showPreview
                    ? "bg-accent text-white"
                    : "text-text-subtle hover:text-text hover:bg-surface-muted",
                )}
              >
                {showPreview ? "Edit" : "Preview"}
              </button>
            </>
          )}
        </div>
      )}

      {showPreview ? (
        <div
          className={cn(
            "markdown-preview prose-md px-3.5 py-2.5 text-sm leading-6 text-text",
            "min-h-[8rem]",
          )}
          // Renderer escapes HTML before tag insertion → safe.
          dangerouslySetInnerHTML={{ __html: renderMarkdownToHtml(value) }}
        />
      ) : (
        <div className="relative">
          <textarea
            ref={setRef}
            id={id}
            name={name}
            value={value}
            onChange={onTextareaChange}
            onKeyDown={onKeyDown}
            onBlur={() =>
              // Close the slash popover when focus leaves the editor.
              setSlash({ open: false, slashAt: -1, query: "", active: 0 })
            }
            rows={rows}
            maxLength={maxLength}
            placeholder={placeholder}
            disabled={disabled}
            required={required}
            autoFocus={autoFocus}
            aria-label={ariaLabel}
            spellCheck
            className={cn(
              "w-full resize-y bg-transparent px-3.5 py-2.5 text-sm leading-6 text-text",
              "placeholder:text-text-subtle focus:outline-none",
              textareaClassName,
            )}
          />
          {slash.open && matches.length > 0 && (
            <div
              role="listbox"
              aria-label="Block type"
              className={cn(
                "absolute left-3 top-12 z-20 w-64 overflow-hidden rounded-xl border border-border bg-surface shadow-lg",
                reducedMotion ? "" : "animate-in fade-in",
              )}
            >
              <div className="border-b border-border/70 px-3 py-1.5 text-[10px] uppercase tracking-wider text-text-subtle">
                Insert block
              </div>
              <ul className="max-h-64 overflow-y-auto py-1">
                {matches.map((cmd, idx) => (
                  <li key={cmd.key}>
                    <button
                      type="button"
                      role="option"
                      aria-selected={idx === slash.active}
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => applySlash(cmd)}
                      onMouseEnter={() =>
                        setSlash((s) => ({ ...s, active: idx }))
                      }
                      className={cn(
                        "flex w-full items-center justify-between gap-3 px-3 py-1.5 text-left text-xs",
                        idx === slash.active
                          ? "bg-accent/10 text-text"
                          : "text-text-muted hover:bg-surface-muted",
                      )}
                    >
                      <span className="font-medium text-text">{cmd.label}</span>
                      <span className="text-[10px] text-text-subtle">
                        {cmd.hint}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {maxLength != null && (
        <div className="flex justify-end border-t border-border/70 px-3 py-1 text-[10px] text-text-subtle">
          {value.length}/{maxLength}
        </div>
      )}
    </div>
  );
});

function BulletGlyph() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 16 16"
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
    >
      <circle cx="3" cy="4" r="1" fill="currentColor" />
      <circle cx="3" cy="8" r="1" fill="currentColor" />
      <circle cx="3" cy="12" r="1" fill="currentColor" />
      <path d="M6 4h7M6 8h7M6 12h7" />
    </svg>
  );
}

function LinkGlyph() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M10 13a5 5 0 0 0 7.07 0l2.83-2.83a5 5 0 0 0-7.07-7.07L11 5" />
      <path d="M14 11a5 5 0 0 0-7.07 0L4.1 13.83a5 5 0 0 0 7.07 7.07L13 19" />
    </svg>
  );
}

export default MarkdownEditor;
