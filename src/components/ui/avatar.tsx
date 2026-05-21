import * as React from "react";
import { cn } from "@/lib/utils/cn";
import { initials } from "@/lib/utils/format";

type Size = "sm" | "md" | "lg";

const SIZES: Record<Size, string> = {
  sm: "h-7 w-7 text-[11px]",
  md: "h-10 w-10 text-sm",
  lg: "h-14 w-14 text-base",
};

export function Avatar({
  firstName,
  lastName,
  size = "md",
  src,
  className,
}: {
  firstName: string;
  lastName: string;
  size?: Size;
  src?: string | null;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "relative inline-flex items-center justify-center rounded-full select-none overflow-hidden",
        "bg-gradient-to-br from-accent-soft to-highlight-soft text-accent font-display font-medium",
        "ring-1 ring-inset ring-border",
        SIZES[size],
        className
      )}
      aria-hidden="true"
    >
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt={`${firstName} ${lastName}`} className="h-full w-full object-cover" />
      ) : (
        initials(firstName, lastName)
      )}
    </div>
  );
}

