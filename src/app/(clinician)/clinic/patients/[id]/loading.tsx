import { PageShell } from "@/components/shell/PageHeader";
import { ChartSkeleton } from "@/components/ui/skeletons";

/**
 * Patient chart shell — mirrors identity header, vitals strip, tab rail,
 * and the two-column note feed + sidebar that the live chart renders.
 */
export default function Loading() {
  return (
    <PageShell maxWidth="max-w-[1280px]">
      <ChartSkeleton />
    </PageShell>
  );
}
