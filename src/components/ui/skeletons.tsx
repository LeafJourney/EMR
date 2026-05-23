import { Skeleton, SkeletonCircle } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils/cn";

/**
 * Composite skeletons — content-aware loading placeholders that mirror
 * the eventual page layout. Used in `loading.tsx` across the highest-
 * traffic clinician, patient, and marketplace surfaces.
 *
 * Apple-iOS aesthetic: tinted parchment surfaces, subtle pulse,
 * `prefers-reduced-motion` honored via the underlying <Skeleton> primitive.
 */

/* ───────────────────────── MessageListSkeleton ─────────────────────── */

/**
 * Mirrors `/clinic/messages` Smart Inbox: a vertical list of triaged
 * thread rows with avatar, priority chip, subject line, and snippet.
 */
export function MessageListSkeleton({
  rows = 8,
  className,
}: {
  rows?: number;
  className?: string;
}) {
  return (
    <div className={cn("space-y-2", className)}>
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          className="flex items-start gap-3 rounded-xl border border-border/60 bg-surface px-4 py-3"
        >
          <SkeletonCircle size={36} />
          <div className="flex-1 min-w-0 space-y-2">
            <div className="flex items-center gap-2">
              <Skeleton className="h-3.5 w-32 rounded" />
              <Skeleton className="h-3 w-16 rounded-full" />
              <Skeleton className="ml-auto h-3 w-10 rounded" />
            </div>
            <Skeleton className="h-3 w-3/4 rounded" />
            <Skeleton className="h-2.5 w-1/2 rounded" />
          </div>
        </div>
      ))}
    </div>
  );
}

/* ─────────────────────── PatientRosterSkeleton ─────────────────────── */

/**
 * Mirrors `/clinic/patients` roster: search bar, then a list of patient
 * rows with avatar, identity, chart summary tags, and a pain sparkline.
 */
export function PatientRosterSkeleton({
  rows = 12,
  className,
}: {
  rows?: number;
  className?: string;
}) {
  return (
    <div className={cn("space-y-4", className)}>
      <div className="flex items-center gap-3">
        <Skeleton className="h-10 flex-1 rounded-lg" />
        <Skeleton className="h-10 w-32 rounded-lg" />
      </div>
      <div className="rounded-xl border border-border/60 bg-surface overflow-hidden">
        {Array.from({ length: rows }).map((_, i) => (
          <div
            key={i}
            className={cn(
              "flex items-center gap-4 px-4 py-3",
              i !== rows - 1 && "border-b border-border/40",
            )}
          >
            <SkeletonCircle size={40} />
            <div className="flex-1 min-w-0 space-y-1.5">
              <Skeleton className="h-3.5 w-44 rounded" />
              <Skeleton className="h-3 w-28 rounded" />
            </div>
            <div className="hidden md:flex items-center gap-2">
              <Skeleton className="h-5 w-16 rounded-full" />
              <Skeleton className="h-5 w-20 rounded-full" />
            </div>
            <Skeleton className="h-8 w-24 rounded-md" />
          </div>
        ))}
      </div>
    </div>
  );
}

/* ──────────────────────── DashboardSkeleton ────────────────────────── */

/**
 * Mirrors `/clinic` landing: command strip, queue rail, two-column
 * activity feed + sidebar tiles. Matches the existing layout block.
 */
export function DashboardSkeleton({ className }: { className?: string }) {
  return (
    <div className={cn("space-y-8", className)}>
      <Skeleton className="h-20 w-full rounded-xl" />

      <div className="flex gap-4 overflow-hidden">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-36 w-56 shrink-0 rounded-xl" />
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 rounded-xl bg-surface-muted overflow-hidden">
          <div className="px-6 pt-6 pb-3 space-y-2">
            <Skeleton className="h-5 w-32 rounded" />
            <Skeleton className="h-3.5 w-56 rounded" />
          </div>
          <div className="px-6 pb-6 pt-4 space-y-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-12 rounded-lg" />
            ))}
          </div>
        </div>
        <div className="space-y-4">
          <Skeleton className="h-24 rounded-xl" />
          <Skeleton className="h-24 rounded-xl" />
          <Skeleton className="h-24 rounded-xl" />
          <Skeleton className="h-48 rounded-xl" />
        </div>
      </div>
    </div>
  );
}

/* ────────────────────────── ChartSkeleton ──────────────────────────── */

/**
 * Mirrors the patient chart shell at `/clinic/patients/[id]`: identity
 * header card, vitals strip, tabbed section with note rows + sidebar.
 */
export function ChartSkeleton({ className }: { className?: string }) {
  return (
    <div className={cn("space-y-6", className)}>
      {/* Identity header card */}
      <div className="rounded-2xl border border-border/60 bg-surface p-5">
        <div className="flex items-center gap-4">
          <SkeletonCircle size={56} />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-5 w-56 rounded" />
            <Skeleton className="h-3.5 w-40 rounded" />
          </div>
          <Skeleton className="h-9 w-28 rounded-lg" />
        </div>
      </div>

      {/* Vitals strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-20 rounded-xl" />
        ))}
      </div>

      {/* Tabs + body */}
      <div className="flex items-center gap-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-8 w-24 rounded-full" />
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className="lg:col-span-2 space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="rounded-xl border border-border/60 bg-surface p-4 space-y-2"
            >
              <Skeleton className="h-4 w-40 rounded" />
              <Skeleton className="h-3 w-full rounded" />
              <Skeleton className="h-3 w-5/6 rounded" />
              <Skeleton className="h-3 w-2/3 rounded" />
            </div>
          ))}
        </div>
        <div className="space-y-3">
          <Skeleton className="h-32 rounded-xl" />
          <Skeleton className="h-32 rounded-xl" />
          <Skeleton className="h-40 rounded-xl" />
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────── QueueSkeleton ─────────────────────────── */

/**
 * Mirrors Today's Queue: header strip + cards stacked by visit slot.
 */
export function QueueSkeleton({
  rows = 6,
  className,
}: {
  rows?: number;
  className?: string;
}) {
  return (
    <div className={cn("space-y-3", className)}>
      <div className="flex items-center justify-between">
        <Skeleton className="h-6 w-40 rounded" />
        <Skeleton className="h-8 w-28 rounded-lg" />
      </div>
      <div className="space-y-2">
        {Array.from({ length: rows }).map((_, i) => (
          <div
            key={i}
            className="flex items-center gap-3 rounded-xl border border-border/60 bg-surface px-4 py-3"
          >
            <Skeleton className="h-10 w-14 rounded-md" />
            <SkeletonCircle size={36} />
            <div className="flex-1 space-y-1.5">
              <Skeleton className="h-3.5 w-44 rounded" />
              <Skeleton className="h-3 w-32 rounded" />
            </div>
            <Skeleton className="h-6 w-20 rounded-full" />
            <Skeleton className="h-8 w-20 rounded-lg" />
          </div>
        ))}
      </div>
    </div>
  );
}

/* ────────────────────── MarketplaceSkeleton ────────────────────────── */

/**
 * Mirrors `/marketplace`: hero band + filter chips + responsive product
 * grid (1/2/3/4 cols at sm/lg/xl).
 */
export function MarketplaceSkeleton({
  cards = 12,
  className,
}: {
  cards?: number;
  className?: string;
}) {
  return (
    <div className={cn("space-y-8", className)}>
      {/* Hero */}
      <div className="space-y-3">
        <Skeleton className="h-3 w-24 rounded" />
        <Skeleton className="h-9 w-2/3 max-w-xl rounded" />
        <Skeleton className="h-4 w-full max-w-2xl rounded" />
      </div>

      {/* Filter chips */}
      <div className="flex flex-wrap items-center gap-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-8 w-24 rounded-full" />
        ))}
        <Skeleton className="ml-auto h-9 w-40 rounded-lg" />
      </div>

      {/* Product grid */}
      <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {Array.from({ length: cards }).map((_, i) => (
          <li
            key={i}
            className="rounded-2xl border border-border/60 bg-surface overflow-hidden"
          >
            <Skeleton className="h-44 w-full rounded-none" />
            <div className="p-4 space-y-2">
              <Skeleton className="h-3 w-20 rounded" />
              <Skeleton className="h-4 w-3/4 rounded" />
              <Skeleton className="h-3 w-1/2 rounded" />
              <div className="flex items-center justify-between pt-2">
                <Skeleton className="h-5 w-16 rounded" />
                <Skeleton className="h-8 w-20 rounded-lg" />
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
