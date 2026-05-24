import { PageShell } from "@/components/shell/PageHeader";
import { DashboardSkeleton } from "@/components/ui/skeletons";

/**
 * Clinic landing — content-aware skeleton mirroring the command strip,
 * patient queue rail, and two-column activity + sidebar layout. Replaces
 * the inline animate-pulse rectangles with the shared composite, which
 * honors `prefers-reduced-motion`.
 */
export default function Loading() {
  return (
    <PageShell maxWidth="max-w-[1400px]">
      <DashboardSkeleton />
    </PageShell>
  );
}
