// /search loading skeleton — mirrors the header / search bar / tab strip
// / grouped-list layout so the page doesn't flash a different shape
// when the data resolves. Honors prefers-reduced-motion via the shared
// `Skeleton` primitive.

import { PageHeader, PageShell } from "@/components/shell/PageHeader";
import { Skeleton, SkeletonText } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <PageShell maxWidth="max-w-[1100px]">
      <PageHeader
        eyebrow="Universal search"
        title="Search"
        description="Find patients, messages, notes, and audit events across your practice."
      />

      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        <Skeleton className="flex-1 h-12 rounded-md" />
        <Skeleton className="w-28 h-12 rounded-md" />
      </div>

      <div className="flex gap-3 border-b border-border pb-2 mb-6">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-5 w-16" />
        ))}
      </div>

      {Array.from({ length: 3 }).map((_, group) => (
        <section key={group} className="mb-10">
          <div className="flex items-center gap-2 mb-2">
            <Skeleton className="h-5 w-24" />
            <Skeleton className="h-4 w-8 rounded-full" />
          </div>
          <div className="border border-border rounded-xl divide-y divide-border/70 bg-surface">
            {Array.from({ length: 3 }).map((_, row) => (
              <div key={row} className="px-4 py-3">
                <SkeletonText lines={2} />
              </div>
            ))}
          </div>
        </section>
      ))}
    </PageShell>
  );
}
