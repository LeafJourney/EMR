import { requireRole } from "@/lib/auth/session";
import { PageShell } from "@/components/shell/PageHeader";
import { PatientSectionNav } from "@/components/shell/PatientSectionNav";
import { CarePathwayPicker } from "./care-pathway-picker";

export const metadata = { title: "Choose your care pathway" };

/**
 * EMR-422 — Patient care-pathway picker.
 *
 * NEW patient-facing feature, intentionally distinct from the practice-admin
 * care-model archetype step already shipped under the EMR-422 id. Lets an
 * onboarding patient choose between a Conventional and a Cannabinoid care
 * pathway. Reachable at /portal/care-pathway.
 */
export default async function CarePathwayPage() {
  const user = await requireRole("patient");
  return (
    <PageShell maxWidth="max-w-[860px]">
      <PatientSectionNav section="account" />
      <CarePathwayPicker userId={user.id} />
    </PageShell>
  );
}
