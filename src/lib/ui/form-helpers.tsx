/**
 * src/lib/ui/form-helpers.ts — Stripe / Linear-tier form primitives.
 *
 * This module composes on top of the a11y-polished primitives in
 * `src/components/ui/input.tsx` (Input, Textarea, Label, FieldGroup) and
 * `src/components/ui/button.tsx` (Button) and adds three pieces of polish:
 *
 *   1. <FormField/>      — label + hint + animated inline error, plus the
 *                          first-blur / submit-attempt gate so the field
 *                          never paints red on initial render.
 *   2. <SubmitButton/>   — Button wired to React's `useFormStatus()` so the
 *                          spinner + "Saving…" copy + disabled state come
 *                          for free in any server-action form.
 *   3. <FormErrorSummary/> — top-of-form list of all field errors with
 *                          anchor links to each field. Mirrors the
 *                          Stripe checkout error-stack pattern.
 *
 * Error tone:
 *   We never blame the user. Use directives ("Please add a date of birth"),
 *   not assertions ("Date of birth is required"). The
 *   `phraseRequired(label)` helper exists so consumers don't have to think
 *   about it every time.
 *
 * Motion:
 *   Animated reveals use the shared presets in `src/lib/ui/motion.ts`
 *   (EASE_PREMIUM, DURATION) and honor `prefers-reduced-motion` via
 *   framer-motion's `useReducedMotion()`. Errors slide down + fade in,
 *   summary card fades + grows from 0.97 scale.
 *
 * Styling rules (Stripe-tier polish):
 *   - error text rendered in `text-danger`
 *   - inline AlertCircle icon next to error text
 *   - inputs only get red border after the user blurs OR a submit attempt
 *     fails — never on first render. `useFieldTouchState` + the
 *     `<FormField revealOn>` prop give consumers the tools to enforce that.
 *
 * Adoption note: this file intentionally does not re-export the underlying
 * primitives from `input.tsx`. Consumers should import Input/Textarea/etc.
 * from `@/components/ui/input` so dependency direction stays one-way
 * (form-helpers → ui primitives).
 */

"use client";

import * as React from "react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { EASE_PREMIUM, DURATION } from "@/lib/ui/motion";
import { cn } from "@/lib/utils/cn";

// ---------------------------------------------------------------------------
// Tone helpers
// ---------------------------------------------------------------------------

/**
 * Build a directive "Please add a …" string from a field label.
 *
 * Lowercase the first character of the label so the message reads
 * naturally, but leave acronyms / proper nouns alone (we detect them by
 * checking whether the second character is also uppercase — e.g. "ICD-10"
 * stays as-is).
 *
 * Examples:
 *   phraseRequired("Date of birth")  → "Please add a date of birth."
 *   phraseRequired("Email")          → "Please add a email." (use phraseRequired with article: "Email address" is better in practice)
 *   phraseRequired("ICD-10 code")    → "Please add a ICD-10 code."
 */
export function phraseRequired(label: string): string {
  if (!label) return "Please complete this field.";
  const second = label.charAt(1);
  const looksLikeAcronym = second && second === second.toUpperCase() && /[A-Z]/.test(second);
  const cased = looksLikeAcronym
    ? label
    : label.charAt(0).toLowerCase() + label.slice(1);
  return `Please add a ${cased}.`;
}

// ---------------------------------------------------------------------------
// useFieldTouchState — the "no red on first paint" gate.
// ---------------------------------------------------------------------------

export interface FieldTouchState {
  /** True after the field has been blurred at least once. */
  touched: boolean;
  /** True after a submit attempt has failed. Set externally via setSubmitAttempted. */
  submitAttempted: boolean;
  /** Whether the error should currently be rendered visually. */
  showError: boolean;
  /** Pass to the input's onBlur. */
  onBlur: () => void;
  /** Call from the form's onSubmit (or server action wrapper) when validation fails. */
  setSubmitAttempted: (v: boolean) => void;
  /** Reset both flags — useful after a successful submit. */
  reset: () => void;
}

export function useFieldTouchState(hasError: boolean): FieldTouchState {
  const [touched, setTouched] = React.useState(false);
  const [submitAttempted, setSubmitAttempted] = React.useState(false);
  return {
    touched,
    submitAttempted,
    showError: hasError && (touched || submitAttempted),
    onBlur: () => setTouched(true),
    setSubmitAttempted,
    reset: () => {
      setTouched(false);
      setSubmitAttempted(false);
    },
  };
}

// ---------------------------------------------------------------------------
// Inline alert icon — keeps bundle small and avoids pulling lucide for one glyph.
// ---------------------------------------------------------------------------

function AlertGlyph({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 16 16"
      width="14"
      height="14"
      aria-hidden="true"
      className={cn("inline-block flex-shrink-0", className)}
    >
      <circle cx="8" cy="8" r="7" fill="currentColor" opacity="0.12" />
      <path
        d="M8 4.25v4M8 10.75v.5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// FormField — labeled field with animated inline error.
// ---------------------------------------------------------------------------

export interface FormFieldProps {
  /** Visible label. Also drives the auto-generated `name` if name isn't passed. */
  label: string;
  /** Optional helper text shown when there's no active error. */
  hint?: string;
  /** Error message. When falsy, no error UI renders. */
  error?: string;
  /** Mark the field required (renders `*` after label + sets `required` on the input). */
  required?: boolean;
  /** Override the auto-generated id if you need to anchor from a summary. */
  id?: string;
  /**
   * Children. The single direct child is cloned and wired with id, aria-invalid,
   * aria-describedby, required, and an onBlur that updates the touched state.
   * If you don't pass children, an `<Input/>` is rendered with the provided
   * `inputProps`.
   */
  children?: React.ReactNode;
  /** Convenience: when not passing children, props for the auto-rendered Input. */
  inputProps?: React.InputHTMLAttributes<HTMLInputElement>;
  /**
   * Externally controlled touch / submit-attempt state. If omitted, FormField
   * tracks its own state and only reveals the red error after first blur.
   * Pass this from a parent that runs server-side validation so an
   * unblurred field still flashes red on submit failure.
   */
  touchState?: FieldTouchState;
  /** Extra class for the outer wrapper. */
  className?: string;
}

/**
 * FormField — the canonical labeled input.
 *
 * - Errors animate in (slide-down + fade) using framer-motion.
 * - The bound input only gets `aria-invalid` (and thus the red border via
 *   the BASE input styles) once the field has been blurred OR a submit
 *   attempt has been made. That matches Stripe / Linear behavior: pristine
 *   fields don't shout at the user.
 * - When there's no error and a hint is set, the hint shows below the field.
 * - SR users get `aria-describedby` on both hint and error (FieldGroup does
 *   this in the underlying primitive — we preserve it here).
 */
export const FormField = React.forwardRef<HTMLDivElement, FormFieldProps>(
  function FormField(
    { label, hint, error, required, id, children, inputProps, touchState, className },
    ref,
  ) {
    const reactId = React.useId();
    const fieldId = id ?? `ff-${reactId}`;
    const hintId = hint ? `${fieldId}-hint` : undefined;
    const errorId = error ? `${fieldId}-error` : undefined;
    const describedBy = [errorId, hintId].filter(Boolean).join(" ") || undefined;

    const internalTouch = useFieldTouchState(Boolean(error));
    const touch = touchState ?? internalTouch;
    const showError = Boolean(error) && touch.showError;

    const reduce = useReducedMotion() ?? false;

    // Build the input child. If consumers passed a child, clone & wire it.
    // Otherwise render a default <Input/> with inputProps.
    let child: React.ReactNode;
    if (React.isValidElement(children)) {
      const c = children as React.ReactElement<
        React.InputHTMLAttributes<HTMLInputElement> & {
          "aria-describedby"?: string;
          "aria-invalid"?: boolean | "true" | "false";
        }
      >;
      const existingBlur = c.props.onBlur;
      child = React.cloneElement(c, {
        id: c.props.id ?? fieldId,
        required: c.props.required ?? required,
        "aria-describedby": c.props["aria-describedby"] ?? describedBy,
        "aria-invalid": c.props["aria-invalid"] ?? (showError ? true : undefined),
        onBlur: (e: React.FocusEvent<HTMLInputElement>) => {
          existingBlur?.(e);
          touch.onBlur();
        },
      });
    } else {
      child = (
        <Input
          id={fieldId}
          required={required}
          aria-describedby={describedBy}
          aria-invalid={showError ? true : undefined}
          onBlur={touch.onBlur}
          {...inputProps}
        />
      );
    }

    return (
      <div ref={ref} className={cn("w-full", className)}>
        <Label htmlFor={fieldId}>
          {label}
          {required && (
            <span className="text-danger ml-0.5" aria-hidden="true">
              *
            </span>
          )}
        </Label>
        {child}

        {/* Hint (only when no visible error). */}
        {hint && !showError && (
          <p id={hintId} className="text-xs text-text-subtle mt-1.5">
            {hint}
          </p>
        )}

        {/* Animated error — slide-down + fade. Layouts shift smoothly. */}
        <AnimatePresence initial={false}>
          {showError && (
            <motion.p
              id={errorId}
              role="alert"
              key="error"
              initial={
                reduce ? { opacity: 1, height: "auto" } : { opacity: 0, height: 0, y: -4 }
              }
              animate={
                reduce
                  ? { opacity: 1, height: "auto" }
                  : { opacity: 1, height: "auto", y: 0 }
              }
              exit={
                reduce
                  ? { opacity: 0, height: 0 }
                  : { opacity: 0, height: 0, y: -2 }
              }
              transition={{ duration: reduce ? 0 : DURATION.quick, ease: EASE_PREMIUM }}
              className="text-xs text-danger mt-1.5 flex items-start gap-1.5 overflow-hidden"
            >
              <AlertGlyph className="mt-px" />
              <span>{error}</span>
            </motion.p>
          )}
        </AnimatePresence>
      </div>
    );
  },
);

// ---------------------------------------------------------------------------
// SubmitButton — Button wired to useFormStatus.
// ---------------------------------------------------------------------------

export interface SubmitButtonProps
  extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "type" | "disabled"> {
  /** Idle label. Defaults to "Save". */
  idleLabel?: React.ReactNode;
  /** Pending label. Defaults to "Saving…". */
  pendingLabel?: React.ReactNode;
  /** Force-disabled, in addition to the form's pending state. */
  disabled?: boolean;
  /**
   * Button variant. Defaults to primary. Anything Button supports
   * ("primary" | "secondary" | "ghost" | "danger" | "highlight").
   */
  variant?: "primary" | "secondary" | "ghost" | "danger" | "highlight";
  size?: "sm" | "md" | "lg";
}

/**
 * SubmitButton reads React's `useFormStatus()` and renders an animated
 * spinner + pending label automatically. Wraps Button so it picks up our
 * tap-press, focus ring, and hover transforms.
 *
 * Must be rendered as a descendant of a `<form action={…}>` for the
 * useFormStatus signal to flow. If your form uses `useTransition` or a
 * custom onSubmit, pass `disabled` manually instead.
 */
export function SubmitButton({
  idleLabel = "Save",
  pendingLabel = "Saving…",
  disabled,
  variant = "primary",
  size = "md",
  className,
  children,
  ...rest
}: SubmitButtonProps) {
  const { pending } = useFormStatus();
  const isPending = pending || disabled === true;

  return (
    <Button
      type="submit"
      variant={variant}
      size={size}
      disabled={isPending}
      aria-busy={pending || undefined}
      className={cn("min-w-[8rem]", className)}
      leadingIcon={
        pending ? (
          <svg
            className="animate-spin"
            viewBox="0 0 16 16"
            width="14"
            height="14"
            aria-hidden="true"
          >
            <circle
              cx="8"
              cy="8"
              r="6"
              stroke="currentColor"
              strokeWidth="2"
              fill="none"
              opacity="0.25"
            />
            <path
              d="M14 8a6 6 0 0 0-6-6"
              stroke="currentColor"
              strokeWidth="2"
              fill="none"
              strokeLinecap="round"
            />
          </svg>
        ) : undefined
      }
      {...rest}
    >
      {children ?? (pending ? pendingLabel : idleLabel)}
    </Button>
  );
}

// ---------------------------------------------------------------------------
// FormErrorSummary — top-of-form summary card with anchor links.
// ---------------------------------------------------------------------------

export interface FormFieldError {
  /** The field's id on the page — used for the anchor link `#id`. */
  id: string;
  /** Short label of the field (e.g. "Date of birth"). */
  label: string;
  /** The actual error message to render. Defaults to phraseRequired(label). */
  message?: string;
}

export interface FormErrorSummaryProps {
  /** Array of field-level errors. Renders nothing when empty. */
  errors: FormFieldError[];
  /** Optional heading override. */
  heading?: string;
  /** Extra className for the outer wrapper. */
  className?: string;
}

/**
 * FormErrorSummary — shows when multiple fields fail validation. Each line
 * is an anchor link to `#<field-id>`, which moves focus to the offending
 * input on click. Use it at the top of a form (or inside a step in a
 * multi-step modal) — the goal is the same as Stripe checkout: one
 * scannable list, one click per fix.
 *
 * Renders nothing when `errors.length < 2`. Single errors should live
 * inline next to their field instead — surfacing a summary card for one
 * issue feels like overkill.
 *
 * a11y: container is `role="alert"` so SR users hear the summary; each
 * link is a real `<a href="#…">` so keyboard nav lands on the field.
 */
export function FormErrorSummary({
  errors,
  heading = "Please fix the following before continuing:",
  className,
}: FormErrorSummaryProps) {
  const reduce = useReducedMotion() ?? false;
  const visible = errors.filter((e) => e.id && e.label);
  const hasMultiple = visible.length >= 2;

  return (
    <AnimatePresence initial={false}>
      {hasMultiple && (
        <motion.div
          key="form-error-summary"
          role="alert"
          aria-live="polite"
          initial={
            reduce
              ? { opacity: 1, height: "auto" }
              : { opacity: 0, height: 0, scale: 0.98 }
          }
          animate={
            reduce
              ? { opacity: 1, height: "auto" }
              : { opacity: 1, height: "auto", scale: 1 }
          }
          exit={
            reduce ? { opacity: 0, height: 0 } : { opacity: 0, height: 0, scale: 0.98 }
          }
          transition={{ duration: reduce ? 0 : DURATION.base, ease: EASE_PREMIUM }}
          className={cn(
            "rounded-lg border border-danger/30 bg-danger/5 px-4 py-3 overflow-hidden",
            className,
          )}
        >
          <div className="flex items-start gap-2">
            <AlertGlyph className="text-danger mt-0.5" />
            <div className="space-y-1.5 w-full">
              <p className="text-sm font-medium text-danger">{heading}</p>
              <ul className="space-y-1 list-disc list-inside marker:text-danger/60">
                {visible.map((e) => (
                  <li key={e.id} className="text-xs text-danger/90">
                    <a
                      href={`#${e.id}`}
                      className="underline decoration-danger/40 underline-offset-2 hover:decoration-danger focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-danger/40 rounded"
                      onClick={(ev) => {
                        // Focus + smooth-scroll the anchored field. Default
                        // anchor navigation only scrolls; we want focus too.
                        const target = document.getElementById(e.id);
                        if (target) {
                          ev.preventDefault();
                          target.focus({ preventScroll: true });
                          target.scrollIntoView({
                            behavior: reduce ? "auto" : "smooth",
                            block: "center",
                          });
                        }
                      }}
                    >
                      {e.label}
                    </a>
                    {e.message ? <span> — {e.message}</span> : null}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// ---------------------------------------------------------------------------
// Convenience: build a FormFieldError list from a Record<string, boolean>
// (the shape NewPatientModal already uses).
// ---------------------------------------------------------------------------

export function buildErrors(
  errors: Record<string, boolean>,
  labels: Record<string, string>,
  messages?: Record<string, string>,
): FormFieldError[] {
  return Object.keys(errors)
    .filter((k) => errors[k] && labels[k])
    .map((k) => ({
      id: k,
      label: labels[k],
      message: messages?.[k] ?? phraseRequired(labels[k]),
    }));
}
