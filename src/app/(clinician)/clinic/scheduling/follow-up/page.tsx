import { requireUser } from "@/lib/auth/session";
import { PageShell, PageHeader } from "@/components/shell/PageHeader";
import { FollowUpCadence } from "./follow-up-cadence";

export const metadata = { title: "Follow-up cadence" };

/**
 * EMR-208 — Algorithmic follow-up cadence.
 *
 * Hosts the condition/phase cadence selector. Reachable at
 * /clinic/scheduling/follow-up (optionally ?patientId=…). Like the provider
 * settings page, the layout-nav link is intentionally deferred so we don't
 * edit shared layout files here — the page is linked from the scheduler.
 */
export default async function FollowUpCadencePage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireUser();
  const sp = (await searchParams) ?? {};
  const patientId = Array.isArray(sp.patientId) ? sp.patientId[0] : sp.patientId;

  return (
    <PageShell maxWidth="max-w-[860px]">
      <PageHeader
        eyebrow="Scheduling"
        title="Follow-up cadence"
        description="Condition-specific follow-up recommendations, auto-computed from the practice standard of care."
      />
      <FollowUpCadence patientId={patientId} />
    </PageShell>
  );
}
