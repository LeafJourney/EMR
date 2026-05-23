import * as React from "react";
import { cn } from "@/lib/utils/cn";

// a11y notes:
// - focus ring uses focus-visible so it only renders for keyboard nav, not
//   mouse clicks (matches Apple-iOS feel goal in CLAUDE.md while staying
//   AA-compliant for keyboard users).
// - aria-invalid="true" repaints the border + ring in danger so screen
//   readers AND sighted users both see the error.
const BASE =
  "flex w-full rounded-md border border-border-strong bg-surface px-3 text-text placeholder:text-text-subtle " +
  "transition-colors duration-200 ease-smooth " +
  "focus:outline-none focus-visible:outline-none " +
  "focus-visible:border-accent focus-visible:ring-2 focus-visible:ring-accent/30 " +
  "aria-[invalid=true]:border-danger aria-[invalid=true]:focus-visible:ring-danger/30 " +
  "disabled:opacity-50 disabled:cursor-not-allowed";

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, type = "text", ...props }, ref) => {
    return (
      <input
        ref={ref}
        type={type}
        className={cn(BASE, "h-10 text-sm", className)}
        {...props}
      />
    );
  }
);
Input.displayName = "Input";

export const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement>
>(({ className, rows = 4, ...props }, ref) => {
  return (
    <textarea
      ref={ref}
      rows={rows}
      className={cn(BASE, "py-2 text-sm leading-6 resize-y", className)}
      {...props}
    />
  );
});
Textarea.displayName = "Textarea";

export const Label = React.forwardRef<HTMLLabelElement, React.LabelHTMLAttributes<HTMLLabelElement>>(
  ({ className, ...props }, ref) => {
    return (
      <label
        ref={ref}
        className={cn("text-sm font-medium text-text mb-1.5 inline-block", className)}
        {...props}
      />
    );
  }
);
Label.displayName = "Label";

// FieldGroup auto-wires aria-describedby (hint) and role="alert" on error so
// SR users hear "<label>, <hint>" on focus and "<error>" when validation
// fails. Children get the generated ids via cloneElement when they're a
// single Input/Textarea/Select. Consumers can pass htmlFor explicitly to
// override the generated id.
export function FieldGroup({
  label,
  hint,
  error,
  children,
  htmlFor,
}: {
  label: string;
  hint?: string;
  error?: string;
  children: React.ReactNode;
  htmlFor?: string;
}) {
  const reactId = React.useId();
  const fieldId = htmlFor ?? `field-${reactId}`;
  const hintId = hint ? `${fieldId}-hint` : undefined;
  const errorId = error ? `${fieldId}-error` : undefined;
  const describedBy = [errorId, hintId].filter(Boolean).join(" ") || undefined;

  // If children is a single field element, wire id + aria-* through. We
  // only stamp the id when the consumer didn't already provide one so we
  // don't clobber explicit htmlFor relationships.
  let enhancedChildren: React.ReactNode = children;
  if (React.isValidElement(children)) {
    const child = children as React.ReactElement<
      React.InputHTMLAttributes<HTMLInputElement> & {
        "aria-describedby"?: string;
        "aria-invalid"?: boolean | "true" | "false";
      }
    >;
    enhancedChildren = React.cloneElement(child, {
      id: child.props.id ?? fieldId,
      "aria-describedby": child.props["aria-describedby"] ?? describedBy,
      "aria-invalid": child.props["aria-invalid"] ?? (error ? true : undefined),
    });
  }

  return (
    <div className="w-full">
      <Label htmlFor={fieldId}>{label}</Label>
      {enhancedChildren}
      {hint && !error && (
        <p id={hintId} className="text-xs text-text-subtle mt-1.5">{hint}</p>
      )}
      {error && (
        <p id={errorId} role="alert" className="text-xs text-danger mt-1.5">
          {error}
        </p>
      )}
    </div>
  );
}
