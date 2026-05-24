"use client";

/**
 * InlineEdit — Notion / Linear-style click-to-edit primitive.
 *
 * Behavior:
 *  - Display mode: text with optional pencil affordance on hover.
 *  - Click display → enter edit mode + autofocus + select all.
 *  - Enter (or blur) → save (optimistic: show next value immediately +
 *    spinner; revert on error and toast).
 *  - Esc → cancel (revert to original).
 *  - Validation: optional `validator(value) => string | null`. Invalid
 *    value paints a red border + tooltip and refuses to save.
 *  - While save in flight: input disabled + spinner shown.
 *
 * a11y:
 *  - Display is a real <button> so keyboard nav (Tab → Enter) works.
 *  - aria-invalid mirrors the validator state; the error message is
 *    rendered with role="alert".
 *
 * Toast: uses the project-wide ToastProvider (`useToast`). If a save
 * throws, the value reverts and an error toast surfaces.
 *
 * Sibling exports:
 *  - <InlineEditTextarea> — multiline variant (Shift+Enter for newline,
 *    Enter to save, blur to save, Esc to cancel).
 *  - <InlineEditSelect>   — dropdown variant for enum fields.
 *
 * No new dependencies — only React + the existing toast system + cn.
 */

import {
  forwardRef,
  useCallback,
  useEffect,
  useId,
  useImperativeHandle,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { cn } from "@/lib/utils/cn";
import { useToast } from "@/components/ui/toast";

// ── Types ──────────────────────────────────────────────────────────────────

type InlineInputType = "text" | "number" | "email" | "date" | "tel" | "url";

export interface InlineEditProps {
  /** Current persisted value. */
  value: string;
  /** Save handler — return a resolved promise on success, reject on failure. */
  onSave: (next: string) => Promise<void>;
  /** Optional synchronous validator. Return an error string or null. */
  validator?: (value: string) => string | null;
  /** HTML input type. */
  type?: InlineInputType;
  /** Placeholder shown when the value is empty. */
  placeholder?: string;
  /** Custom display renderer (formatted date, masked phone, etc). */
  renderDisplay?: (value: string) => ReactNode;
  /** ARIA label for both the trigger and the input. */
  ariaLabel?: string;
  /** Visual size tweak; default "md". */
  size?: "sm" | "md" | "lg";
  /** Hide the hover pencil affordance. */
  hidePencil?: boolean;
  /** Disable editing entirely (renders as plain text). */
  disabled?: boolean;
  /** Optional className for the outer wrapper. */
  className?: string;
  /** Optional className for the display-mode element. */
  displayClassName?: string;
  /** Optional className for the input. */
  inputClassName?: string;
}

export interface InlineEditHandle {
  /** Programmatically enter edit mode. */
  edit: () => void;
}

// ── Shared styling ─────────────────────────────────────────────────────────

const SIZE_TEXT: Record<NonNullable<InlineEditProps["size"]>, string> = {
  sm: "text-xs",
  md: "text-sm",
  lg: "text-base",
};
const SIZE_INPUT_H: Record<NonNullable<InlineEditProps["size"]>, string> = {
  sm: "h-7",
  md: "h-8",
  lg: "h-10",
};

const DISPLAY_BASE =
  // Apple-iOS feel: subtle, generous tap target, rounded corners, hover tint.
  "group inline-flex items-center gap-1.5 rounded-md px-1.5 py-1 -mx-1.5 -my-1 " +
  "text-left transition-colors duration-150 ease-smooth " +
  "hover:bg-surface-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 " +
  "cursor-text min-h-[1.75rem] max-w-full";

const INPUT_BASE =
  "block w-full rounded-md border border-border-strong bg-surface px-2 py-1 text-text " +
  "transition-colors duration-150 ease-smooth " +
  "focus:outline-none focus-visible:border-accent focus-visible:ring-2 focus-visible:ring-accent/30 " +
  "aria-[invalid=true]:border-danger aria-[invalid=true]:focus-visible:ring-danger/30 " +
  "disabled:opacity-50 disabled:cursor-not-allowed";

// ── Icons (inline SVG — no new deps, no lucide version risk) ───────────────

function PencilIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden="true"
      className={className}
    >
      <path
        d="M10.5 2.5l3 3M2.5 13.5l3-.5L13 6l-2.5-2.5L3 10.5l-.5 3z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function Spinner({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden="true"
      className={cn("animate-spin", className)}
    >
      <circle
        cx="8"
        cy="8"
        r="6"
        stroke="currentColor"
        strokeOpacity="0.25"
        strokeWidth="2"
      />
      <path
        d="M14 8a6 6 0 0 0-6-6"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

// ── Hook: shared editing state machine ─────────────────────────────────────

interface UseInlineEditingArgs {
  value: string;
  onSave: (next: string) => Promise<void>;
  validator?: (value: string) => string | null;
  toastTitle: string;
}

function useInlineEditing({
  value,
  onSave,
  validator,
  toastTitle,
}: UseInlineEditingArgs) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  // Optimistic display value — what the user sees while a save is in flight.
  const [optimistic, setOptimistic] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();

  // Whenever the canonical value prop changes from above (e.g. parent
  // refresh after revalidation), clear any optimistic shadow so the
  // display reflects the new truth.
  useEffect(() => {
    setOptimistic(null);
  }, [value]);

  const begin = useCallback(() => {
    setDraft(value);
    setError(null);
    setEditing(true);
  }, [value]);

  const cancel = useCallback(() => {
    setEditing(false);
    setError(null);
    setDraft(value);
  }, [value]);

  const commit = useCallback(async () => {
    const next = draft;
    // No-op if unchanged.
    if (next === value) {
      setEditing(false);
      setError(null);
      return;
    }
    if (validator) {
      const v = validator(next);
      if (v) {
        setError(v);
        return;
      }
    }
    // Optimistic: show next immediately, exit edit mode, spinner overlay.
    setOptimistic(next);
    setEditing(false);
    setSaving(true);
    setError(null);
    try {
      await onSave(next);
      // Success — let the next render from props clear `optimistic`. If
      // the parent doesn't refresh, we still want to converge, so clear
      // here too.
      setOptimistic(null);
    } catch (err) {
      // Revert + toast.
      setOptimistic(null);
      const message =
        err instanceof Error && err.message ? err.message : "Please try again.";
      toast({
        title: toastTitle,
        description: message,
        variant: "error",
      });
    } finally {
      setSaving(false);
    }
  }, [draft, value, validator, onSave, toast, toastTitle]);

  return {
    editing,
    draft,
    setDraft,
    optimistic,
    saving,
    error,
    setError,
    begin,
    cancel,
    commit,
  };
}

// ── InlineEdit (single-line) ───────────────────────────────────────────────

export const InlineEdit = forwardRef<InlineEditHandle, InlineEditProps>(
  function InlineEdit(
    {
      value,
      onSave,
      validator,
      type = "text",
      placeholder = "Empty",
      renderDisplay,
      ariaLabel,
      size = "md",
      hidePencil = false,
      disabled = false,
      className,
      displayClassName,
      inputClassName,
    },
    ref,
  ) {
    const inputRef = useRef<HTMLInputElement>(null);
    const errorId = useId();

    const {
      editing,
      draft,
      setDraft,
      optimistic,
      saving,
      error,
      setError,
      begin,
      cancel,
      commit,
    } = useInlineEditing({
      value,
      onSave,
      validator,
      toastTitle: ariaLabel ? `Couldn't save ${ariaLabel}` : "Couldn't save",
    });

    useImperativeHandle(ref, () => ({ edit: begin }), [begin]);

    // Focus + select-all on entering edit mode.
    useEffect(() => {
      if (editing && inputRef.current) {
        const el = inputRef.current;
        el.focus();
        // type="date" doesn't support .select(); guard it.
        if (typeof el.select === "function" && type !== "date") {
          try {
            el.select();
          } catch {
            // ignore — browsers can throw on hidden inputs
          }
        }
      }
    }, [editing, type]);

    const displayed = optimistic ?? value;

    // Disabled / read-only path — render plain text, no hover affordance.
    if (disabled) {
      return (
        <span className={cn(SIZE_TEXT[size], "text-text", className)}>
          {renderDisplay ? renderDisplay(displayed) : displayed || (
            <span className="text-text-subtle italic">{placeholder}</span>
          )}
        </span>
      );
    }

    if (!editing) {
      const isEmpty = !displayed;
      return (
        <span
          className={cn("inline-flex items-center gap-1.5 max-w-full", className)}
        >
          <button
            type="button"
            onClick={begin}
            aria-label={ariaLabel ? `Edit ${ariaLabel}` : "Edit field"}
            className={cn(
              DISPLAY_BASE,
              SIZE_TEXT[size],
              isEmpty ? "text-text-subtle italic" : "text-text",
              displayClassName,
            )}
          >
            <span className="truncate min-w-0">
              {isEmpty
                ? placeholder
                : renderDisplay
                  ? renderDisplay(displayed)
                  : displayed}
            </span>
            {!hidePencil && !saving && (
              <PencilIcon
                className={cn(
                  "shrink-0 size-3 text-text-subtle/70",
                  "opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100 transition-opacity duration-150",
                )}
              />
            )}
            {saving && (
              <Spinner className="shrink-0 size-3 text-text-subtle" />
            )}
          </button>
        </span>
      );
    }

    // Edit mode.
    return (
      <span className={cn("inline-flex flex-col gap-1 max-w-full", className)}>
        <span className="relative inline-flex items-center">
          <input
            ref={inputRef}
            type={type}
            value={draft}
            onChange={(e) => {
              setDraft(e.target.value);
              if (error) setError(null);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void commit();
              } else if (e.key === "Escape") {
                e.preventDefault();
                cancel();
              }
            }}
            onBlur={() => {
              // If validation fails, keep edit mode open so the user can
              // fix the value (instead of dropping their input).
              if (validator && validator(draft) !== null) return;
              void commit();
            }}
            disabled={saving}
            aria-invalid={error ? true : undefined}
            aria-label={ariaLabel}
            aria-describedby={error ? errorId : undefined}
            placeholder={placeholder}
            className={cn(
              INPUT_BASE,
              SIZE_INPUT_H[size],
              SIZE_TEXT[size],
              "pr-7",
              inputClassName,
            )}
          />
          {saving && (
            <Spinner className="absolute right-2 size-3 text-text-subtle" />
          )}
        </span>
        {error && (
          <span
            id={errorId}
            role="alert"
            className="text-xs text-danger leading-tight"
          >
            {error}
          </span>
        )}
      </span>
    );
  },
);

// ── InlineEditTextarea (multiline) ─────────────────────────────────────────

export interface InlineEditTextareaProps
  extends Omit<InlineEditProps, "type" | "renderDisplay"> {
  /** Visible rows for the textarea. Defaults to 3. */
  rows?: number;
  /** Renderer for the display mode (e.g. to render markdown). */
  renderDisplay?: (value: string) => ReactNode;
}

export const InlineEditTextarea = forwardRef<
  InlineEditHandle,
  InlineEditTextareaProps
>(function InlineEditTextarea(
  {
    value,
    onSave,
    validator,
    placeholder = "Empty",
    renderDisplay,
    ariaLabel,
    size = "md",
    hidePencil = false,
    disabled = false,
    className,
    displayClassName,
    inputClassName,
    rows = 3,
  },
  ref,
) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const errorId = useId();

  const {
    editing,
    draft,
    setDraft,
    optimistic,
    saving,
    error,
    setError,
    begin,
    cancel,
    commit,
  } = useInlineEditing({
    value,
    onSave,
    validator,
    toastTitle: ariaLabel ? `Couldn't save ${ariaLabel}` : "Couldn't save",
  });

  useImperativeHandle(ref, () => ({ edit: begin }), [begin]);

  useEffect(() => {
    if (editing && textareaRef.current) {
      const el = textareaRef.current;
      el.focus();
      try {
        el.select();
      } catch {
        // ignore
      }
    }
  }, [editing]);

  const displayed = optimistic ?? value;

  if (disabled) {
    return (
      <span className={cn(SIZE_TEXT[size], "text-text whitespace-pre-wrap", className)}>
        {renderDisplay ? renderDisplay(displayed) : displayed || (
          <span className="text-text-subtle italic">{placeholder}</span>
        )}
      </span>
    );
  }

  if (!editing) {
    const isEmpty = !displayed;
    return (
      <span className={cn("flex flex-col gap-1 max-w-full", className)}>
        <button
          type="button"
          onClick={begin}
          aria-label={ariaLabel ? `Edit ${ariaLabel}` : "Edit field"}
          className={cn(
            DISPLAY_BASE,
            "items-start whitespace-pre-wrap text-left block w-full",
            SIZE_TEXT[size],
            isEmpty ? "text-text-subtle italic" : "text-text",
            displayClassName,
          )}
        >
          <span className="flex-1 min-w-0">
            {isEmpty
              ? placeholder
              : renderDisplay
                ? renderDisplay(displayed)
                : displayed}
          </span>
          {!hidePencil && !saving && (
            <PencilIcon
              className={cn(
                "shrink-0 size-3 text-text-subtle/70 mt-1",
                "opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100 transition-opacity duration-150",
              )}
            />
          )}
          {saving && (
            <Spinner className="shrink-0 size-3 text-text-subtle mt-1" />
          )}
        </button>
      </span>
    );
  }

  return (
    <span className={cn("flex flex-col gap-1 max-w-full", className)}>
      <span className="relative block">
        <textarea
          ref={textareaRef}
          rows={rows}
          value={draft}
          onChange={(e) => {
            setDraft(e.target.value);
            if (error) setError(null);
          }}
          onKeyDown={(e) => {
            // Enter saves; Shift+Enter inserts a newline. Esc cancels.
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void commit();
            } else if (e.key === "Escape") {
              e.preventDefault();
              cancel();
            }
          }}
          onBlur={() => {
            if (validator && validator(draft) !== null) return;
            void commit();
          }}
          disabled={saving}
          aria-invalid={error ? true : undefined}
          aria-label={ariaLabel}
          aria-describedby={error ? errorId : undefined}
          placeholder={placeholder}
          className={cn(
            INPUT_BASE,
            SIZE_TEXT[size],
            "py-1.5 leading-6 resize-y pr-7",
            inputClassName,
          )}
        />
        {saving && (
          <Spinner className="absolute right-2 top-2 size-3 text-text-subtle" />
        )}
      </span>
      {error && (
        <span
          id={errorId}
          role="alert"
          className="text-xs text-danger leading-tight"
        >
          {error}
        </span>
      )}
    </span>
  );
});

// ── InlineEditSelect (enum dropdown) ───────────────────────────────────────

export interface InlineEditSelectOption {
  value: string;
  label: string;
}

export interface InlineEditSelectProps
  extends Omit<InlineEditProps, "type" | "validator"> {
  options: InlineEditSelectOption[];
  /** Optional validator. */
  validator?: (value: string) => string | null;
}

export const InlineEditSelect = forwardRef<
  InlineEditHandle,
  InlineEditSelectProps
>(function InlineEditSelect(
  {
    value,
    onSave,
    validator,
    options,
    placeholder = "Choose…",
    renderDisplay,
    ariaLabel,
    size = "md",
    hidePencil = false,
    disabled = false,
    className,
    displayClassName,
    inputClassName,
  },
  ref,
) {
  const selectRef = useRef<HTMLSelectElement>(null);

  const {
    editing,
    draft,
    setDraft,
    optimistic,
    saving,
    error,
    setError,
    begin,
    cancel,
    commit,
  } = useInlineEditing({
    value,
    onSave,
    validator,
    toastTitle: ariaLabel ? `Couldn't save ${ariaLabel}` : "Couldn't save",
  });

  useImperativeHandle(ref, () => ({ edit: begin }), [begin]);

  useEffect(() => {
    if (editing && selectRef.current) {
      selectRef.current.focus();
    }
  }, [editing]);

  const displayed = optimistic ?? value;
  const displayLabel =
    options.find((o) => o.value === displayed)?.label ?? displayed;

  if (disabled) {
    return (
      <span className={cn(SIZE_TEXT[size], "text-text", className)}>
        {renderDisplay ? renderDisplay(displayed) : displayLabel || (
          <span className="text-text-subtle italic">{placeholder}</span>
        )}
      </span>
    );
  }

  if (!editing) {
    const isEmpty = !displayed;
    return (
      <span
        className={cn("inline-flex items-center gap-1.5 max-w-full", className)}
      >
        <button
          type="button"
          onClick={begin}
          aria-label={ariaLabel ? `Edit ${ariaLabel}` : "Edit field"}
          className={cn(
            DISPLAY_BASE,
            SIZE_TEXT[size],
            isEmpty ? "text-text-subtle italic" : "text-text",
            displayClassName,
          )}
        >
          <span className="truncate min-w-0">
            {isEmpty
              ? placeholder
              : renderDisplay
                ? renderDisplay(displayed)
                : displayLabel}
          </span>
          {!hidePencil && !saving && (
            <PencilIcon
              className={cn(
                "shrink-0 size-3 text-text-subtle/70",
                "opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100 transition-opacity duration-150",
              )}
            />
          )}
          {saving && (
            <Spinner className="shrink-0 size-3 text-text-subtle" />
          )}
        </button>
      </span>
    );
  }

  return (
    <span className={cn("inline-flex flex-col gap-1 max-w-full", className)}>
      <span className="relative inline-flex items-center">
        <select
          ref={selectRef}
          value={draft}
          onChange={(e) => {
            setDraft(e.target.value);
            if (error) setError(null);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              void commit();
            } else if (e.key === "Escape") {
              e.preventDefault();
              cancel();
            }
          }}
          onBlur={() => {
            if (validator && validator(draft) !== null) return;
            void commit();
          }}
          disabled={saving}
          aria-invalid={error ? true : undefined}
          aria-label={ariaLabel}
          className={cn(
            INPUT_BASE,
            SIZE_INPUT_H[size],
            SIZE_TEXT[size],
            "pr-7",
            inputClassName,
          )}
        >
          {options.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
        {saving && (
          <Spinner className="absolute right-2 size-3 text-text-subtle" />
        )}
      </span>
      {error && (
        <span role="alert" className="text-xs text-danger leading-tight">
          {error}
        </span>
      )}
    </span>
  );
});

// ── Common validators (exported for convenience) ──────────────────────────

export const inlineValidators = {
  required:
    (label = "Value") =>
    (v: string) =>
      v.trim().length === 0 ? `${label} is required` : null,
  email: (v: string) => {
    if (!v) return null;
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) ? null : "Invalid email";
  },
  // Loose phone: 7–20 chars, digits / spaces / +-(). No locale assumption.
  phone: (v: string) => {
    if (!v) return null;
    return /^[0-9 +()\-.]{7,20}$/.test(v) ? null : "Invalid phone number";
  },
  // ISO date (YYYY-MM-DD).
  isoDate: (v: string) => {
    if (!v) return null;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return "Use YYYY-MM-DD";
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? "Invalid date" : null;
  },
  // US ZIP (5 or 5+4) — loose.
  postalCode: (v: string) => {
    if (!v) return null;
    return /^\d{5}(-\d{4})?$/.test(v) ? null : "Invalid ZIP";
  },
};
