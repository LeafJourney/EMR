import * as React from "react";
import { cn } from "@/lib/utils/cn";

type Variant = "primary" | "secondary" | "ghost" | "danger" | "highlight";
type Size = "sm" | "md" | "lg";

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  leadingIcon?: React.ReactNode;
  trailingIcon?: React.ReactNode;
}

const BASE =
  "inline-flex items-center justify-center gap-2 rounded-md font-medium whitespace-nowrap " +
  "transition-all duration-200 ease-smooth " +
  "disabled:opacity-50 disabled:cursor-not-allowed " +
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 " +
  "focus-visible:ring-accent/40 focus-visible:ring-offset-surface active:translate-y-[0.5px]";

// EMR-015: hover lift + shadow bumps so buttons feel tactile.
// Primary/highlight gradients also nudge -1px on the Y so the press feels
// physical when paired with the active translate-y back down.
const VARIANTS: Record<Variant, string> = {
  primary:
    "bg-gradient-to-b from-accent to-accent-strong text-accent-ink shadow-seal " +
    "hover:from-accent/90 hover:to-accent hover:shadow-xl hover:scale-[1.03] hover:-translate-y-px",
  secondary:
    "bg-surface-raised text-text border border-border-strong/70 shadow-sm " +
    "hover:bg-surface-muted hover:border-border-strong hover:shadow-md hover:-translate-y-px",
  ghost:
    "bg-transparent text-text-muted hover:bg-surface-muted hover:text-text",
  danger:
    "bg-danger text-white shadow-sm hover:brightness-110 hover:shadow-md hover:-translate-y-px",
  highlight:
    "bg-gradient-to-b from-highlight to-highlight-hover text-white shadow-seal " +
    "hover:from-highlight/90 hover:to-highlight hover:shadow-xl hover:scale-[1.03] hover:-translate-y-px",
};

const SIZES: Record<Size, string> = {
  sm: "h-8 px-3.5 text-sm",
  md: "h-10 px-4 text-sm",
  lg: "h-12 px-6 text-base",
};

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    { className, variant = "primary", size = "md", leadingIcon, trailingIcon, type, children, ...props },
    ref
  ) => {
    // a11y: default to type="button" so primitives don't accidentally submit
    // ancestor forms when consumers omit the prop. Callers can still pass
    // type="submit" / "reset" explicitly.
    return (
      <button
        ref={ref}
        type={type ?? "button"}
        className={cn(BASE, VARIANTS[variant], SIZES[size], className)}
        {...props}
      >
        {leadingIcon}
        {children}
        {trailingIcon}
      </button>
    );
  }
);
Button.displayName = "Button";
