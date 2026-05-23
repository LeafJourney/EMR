import { PageHeader, PageShell } from "@/components/shell/PageHeader";
import { PatientRosterSkeleton } from "@/components/ui/skeletons";

/**
 * Patient roster loading skeleton — mirrors the search bar, action
 * button, and the bordered list of patient rows the live roster
 * eventually renders.
 */
export default function Loading() {
  return (
    <PageShell maxWidth="max-w-[1200px]">
      <PageHeader
        eyebrow="Clinic"
        title="Patient Roster"
        description="Search, filter, and open any patient's chart."
      />
      <PatientRosterSkeleton rows={12} />
    </PageShell>
  );
}
