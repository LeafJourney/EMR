import { requireRole } from "@/lib/auth/session";
import { PageShell, PageHeader } from "@/components/shell/PageHeader";
import { ImpactView } from "./impact-view";
import { IMPACT_DATA } from "./impact-data";

export const metadata = { title: "Cannabis Impact" };

// ---------------------------------------------------------------------------
// Cannabis Impact hub (EMR-288)
// ---------------------------------------------------------------------------
// A patient-portal education page that contextualizes cannabis with cited
// outcome statistics: the Medical Cannabis Library positive/negative/neutral
// classification, economic footprint, harm-reduction themes, and a risk-profile
// comparison against alcohol and pharmaceuticals. Educational only — every
// figure carries a source note and a clear disclaimer.
// ---------------------------------------------------------------------------

export default async function CannabisImpactPage() {
  await requireRole("patient");

  return (
    <PageShell maxWidth="max-w-[1040px]">
      <PageHeader
        eyebrow="Education"
        title="The bigger picture"
        description="Cannabis, by the numbers — outcomes from the research, the economy it supports, its harm-reduction story, and how its risks compare to alcohol and pharmaceuticals. Every figure is cited. Read it, then make up your own mind."
      />
      <ImpactView data={IMPACT_DATA} />
    </PageShell>
  );
}
