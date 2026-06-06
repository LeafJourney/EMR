import { requireUser } from "@/lib/auth/session";
import { PageShell, PageHeader } from "@/components/shell/PageHeader";
import { CuresCredentialsForm } from "./cures-credentials-form";

export const metadata = { title: "Provider settings" };

/**
 * EMR-889 — Provider settings.
 *
 * Currently hosts the CURES (PDMP) opt-in so a prescriber can store their
 * CURES credentials, which the controlled-substance prescribe flow links to.
 *
 * NOTE (intentional scope guard): the bottom-left provider-initials menu in
 * the shared clinic layout is the natural entry point for this page, but wiring
 * that nav link would require editing the shared clinic layout — which is out
 * of scope for the prescribe-module redesign. The route is live at
 * /clinic/settings and is linked from the CURES attestation block on the
 * prescribe form; the layout-nav wiring is deliberately left to a follow-up so
 * we don't touch shared layout files here.
 */
export default async function ClinicSettingsPage() {
  const user = await requireUser();
  const providerName = `${user.firstName} ${user.lastName}`.trim() || "Provider";

  return (
    <PageShell maxWidth="max-w-[720px]">
      <PageHeader
        eyebrow="Settings"
        title="Provider settings"
        description={`Signed in as ${providerName}. Manage your prescribing integrations below.`}
      />
      <CuresCredentialsForm userId={user.id} />
    </PageShell>
  );
}
