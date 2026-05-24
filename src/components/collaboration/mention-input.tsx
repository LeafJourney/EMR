"use client";

/**
 * `MentionInput` — reusable mention-aware textarea.
 *
 * Behaviour:
 *   - Typing `@` opens a popover anchored under the caret.
 *   - The popover lists org members whose first/last name or email handle
 *     prefix-matches the query after `@`.
 *   - ↑/↓ moves the selection, Enter / Tab inserts, Esc closes.
 *   - Inserting a member writes `@firstname` (lowercased) and a trailing
 *     space so the next keystroke is normal typing.
 *
 * The component is fully controlled (`value` / `onChange`) so callers can
 * persist or echo the body however they like. The roster is supplied as a
 * prop — the parent decides whether to fetch from a server action or
 * preload statically.
 */

import * as React from "react";
import { cn } from "@/lib/utils/cn";
import { Avatar } from "@/components/ui/avatar";
import type { CommentAuthor } from "@/lib/collaboration/comments";

interface MentionInputProps {
  value: string;
  onChange: (next: string) => void;
  roster: CommentAuthor[];
  placeholder?: string;
  /** Number of rows for the underlying textarea. */
  rows?: number;
  /** When provided, Cmd/Ctrl+Enter fires this (submit shortcut). */
  onSubmit?: () => void;
  /** Disable the input entirely (e.g. while submitting). */
  disabled?: boolean;
  className?: string;
  /** ARIA label for screen readers. */
  ariaLabel?: string;
  /** Render at a smaller scale (used for reply boxes nested under threads). */
  size?: "sm" | "md";
}

interface MatchState {
  /** True when the popover should be visible. */
  open: boolean;
  /** Char offset of the `@` that started the query. */
  triggerAt: number;
  /** Lowercase query string after the `@` (no leading sigil). */
  query: string;
  /** Highlighted index within the filtered roster. */
  index: number;
}

const INITIAL_MATCH: MatchState = {
  open: false,
  triggerAt: -1,
  query: "",
  index: 0,
};

/** Walk backward from `caret` to find an `@` that anchors a mention query. */
function detectTrigger(value: string, caret: number): MatchState | null {
  // Cap the scan at 50 chars so a giant body doesn't iterate the whole thing.
  const start = Math.max(0, caret - 50);
  for (let i = caret - 1; i >= start; i--) {
    const ch = value[i];
    if (ch === "@") {
      // Mention must be at start-of-string or after whitespace / newline.
      const prev = i === 0 ? " " : value[i - 1];
      if (!/\s/.test(prev) && i !== 0) return null;
      const query = value.slice(i + 1, caret);
      // A space or newline inside the query terminates it.
      if (/\s/.test(query)) return null;
      return { open: true, triggerAt: i, query: query.toLowerCase(), index: 0 };
    }
    if (/\s/.test(ch)) return null;
  }
  return null;
}

function filterRoster(
  roster: CommentAuthor[],
  query: string,
): CommentAuthor[] {
  if (!query) return roster.slice(0, 8);
  const q = query.toLowerCase();
  return roster
    .filter((u) => {
      const first = u.firstName.toLowerCase();
      const last = u.lastName.toLowerCase();
      const handle = u.email?.toLowerCase().split("@")[0] ?? "";
      return (
        first.startsWith(q) ||
        last.startsWith(q) ||
        handle.startsWith(q) ||
        `${first} ${last}`.includes(q)
      );
    })
    .slice(0, 8);
}

export function MentionInput({
  value,
  onChange,
  roster,
  placeholder = "Write a comment… use @ to mention",
  rows = 3,
  onSubmit,
  disabled = false,
  className,
  ariaLabel,
  size = "md",
}: MentionInputProps) {
  const textareaRef = React.useRef<HTMLTextAreaElement | null>(null);
  const [match, setMatch] = React.useState<MatchState>(INITIAL_MATCH);

  const filtered = React.useMemo(
    () => (match.open ? filterRoster(roster, match.query) : []),
    [match.open, match.query, roster],
  );

  // Clamp the highlight index whenever the filtered list shrinks (e.g. user
  // keeps typing past the last match).
  React.useEffect(() => {
    if (!match.open) return;
    if (match.index >= filtered.length && filtered.length > 0) {
      setMatch((m) => ({ ...m, index: filtered.length - 1 }));
    }
  }, [filtered.length, match.open, match.index]);

  function handleChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const next = e.target.value;
    onChange(next);
    const caret = e.target.selectionStart ?? next.length;
    const detected = detectTrigger(next, caret);
    setMatch(detected ?? INITIAL_MATCH);
  }

  function insertMention(member: CommentAuthor) {
    const ta = textareaRef.current;
    if (!ta) return;
    if (!match.open || match.triggerAt < 0) return;
    const caret = ta.selectionStart ?? value.length;
    const before = value.slice(0, match.triggerAt);
    const after = value.slice(caret);
    const token = `@${member.firstName.toLowerCase()}`;
    const next = `${before}${token} ${after}`;
    onChange(next);
    setMatch(INITIAL_MATCH);
    // Restore the caret after the inserted token + space.
    requestAnimationFrame(() => {
      if (!textareaRef.current) return;
      const pos = before.length + token.length + 1;
      textareaRef.current.setSelectionRange(pos, pos);
      textareaRef.current.focus();
    });
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    // Submit shortcut works regardless of popover state.
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter" && onSubmit) {
      e.preventDefault();
      onSubmit();
      return;
    }
    if (!match.open || filtered.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setMatch((m) => ({ ...m, index: (m.index + 1) % filtered.length }));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setMatch((m) => ({
        ...m,
        index: (m.index - 1 + filtered.length) % filtered.length,
      }));
    } else if (e.key === "Enter" || e.key === "Tab") {
      e.preventDefault();
      insertMention(filtered[match.index]);
    } else if (e.key === "Escape") {
      e.preventDefault();
      setMatch(INITIAL_MATCH);
    }
  }

  const padded = size === "sm" ? "px-3 py-2 text-sm" : "px-4 py-3 text-sm";

  return (
    <div className={cn("relative", className)}>
      <textarea
        ref={textareaRef}
        value={value}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        rows={rows}
        disabled={disabled}
        aria-label={ariaLabel ?? "Comment editor with mention support"}
        className={cn(
          "w-full rounded-xl border border-border bg-surface text-text",
          "placeholder:text-text-muted",
          "focus:outline-none focus:ring-2 focus:ring-accent-soft focus:border-accent",
          "transition-shadow duration-150 resize-y",
          padded,
          disabled && "opacity-60 cursor-not-allowed",
        )}
      />

      {match.open && filtered.length > 0 && (
        <div
          role="listbox"
          aria-label="Mention suggestions"
          className={cn(
            "absolute left-0 right-0 z-30 mt-1",
            "rounded-xl border border-border bg-surface-raised shadow-lg",
            "max-h-64 overflow-y-auto p-1",
          )}
        >
          {filtered.map((member, i) => (
            <button
              key={member.id}
              type="button"
              role="option"
              aria-selected={i === match.index}
              onMouseDown={(e) => {
                // Prevent textarea blur — we need the caret intact to splice.
                e.preventDefault();
                insertMention(member);
              }}
              onMouseEnter={() => setMatch((m) => ({ ...m, index: i }))}
              className={cn(
                "w-full flex items-center gap-3 px-3 py-2 rounded-lg",
                "text-left text-sm transition-colors duration-150",
                i === match.index
                  ? "bg-accent-soft text-text"
                  : "text-text hover:bg-surface",
              )}
            >
              <Avatar
                firstName={member.firstName}
                lastName={member.lastName}
                size="sm"
              />
              <span className="flex-1">
                <span className="font-medium">
                  {member.firstName} {member.lastName}
                </span>
                {member.email && (
                  <span className="ml-2 text-xs text-text-muted">
                    @{member.firstName.toLowerCase()}
                  </span>
                )}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
