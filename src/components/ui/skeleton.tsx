import { cn } from "@/lib/utils/cn";

/**
 * Skeleton — single animated placeholder rectangle used in `loading.tsx`
 * across the operator, clinician, and patient dashboards.
 *
 * - Apple-iOS aesthetic: subtle pulse on a tinted parchment surface
 *   (`bg-surface-muted`), ~1.5s cycle via Tailwind's `animate-pulse`.
 * - Honors `prefers-reduced-motion: reduce` and the `.reduce-motion`
 *   user toggle (see `globals.css`) — the pulse collapses to a static
 *   dim block via `motion-reduce:animate-none`.
 * - The default shape is `rounded-md`; pass `rounded-xl` / `rounded-full`
 *   / etc. via `className` to override.
 */
export function Skeleton({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        "animate-pulse motion-reduce:animate-none rounded-md bg-surface-muted",
        className,
      )}
      {...props}
    />
  );
}

/**
 * SkeletonText — a stacked column of skeleton lines, sized like text.
 * Last line is slightly shorter so it reads as a paragraph, not a block.
 */
export function SkeletonText({
  lines = 3,
  className,
}: {
  lines?: number;
  className?: string;
}) {
  return (
    <div className={cn("space-y-2", className)}>
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton
          key={i}
          className={cn(
            "h-3.5 rounded",
            i === lines - 1 ? "w-2/3" : "w-full",
          )}
        />
      ))}
    </div>
  );
}

/**
 * SkeletonCircle — round avatar/icon placeholder. `size` is in pixels.
 * Uses inline style instead of dynamic Tailwind classes so it survives
 * the JIT class-name purge.
 */
export function SkeletonCircle({
  size = 40,
  className,
}: {
  /** Diameter in pixels. Default 40px. */
  size?: number;
  className?: string;
}) {
  return (
    <Skeleton
      style={{ width: size, height: size }}
      className={cn("rounded-full shrink-0", className)}
    />
  );
}
