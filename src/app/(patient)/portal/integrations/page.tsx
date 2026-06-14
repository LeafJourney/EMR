import { requireRole } from "@/lib/auth/session";
import { PageHeader, PageShell } from "@/components/shell/PageHeader";
import { PatientSectionNav } from "@/components/shell/PatientSectionNav";
import { IntegrationsView } from "./integrations-view";
import { getDeviceConnections } from "./actions";
import { allProviderAvailability } from "./availability";

export const metadata = { title: "Integrations" };

export default async function PatientIntegrationsPage() {
  await requireRole("patient");
  const connections = await getDeviceConnections();
  // Computed server-side because it depends on env (which providers are
  // actually configured to connect). Passed down so the client view never
  // shows a working "Connect" for a provider with no real backend.
  const availability = allProviderAvailability();

  return (
    <PageShell maxWidth="max-w-[1060px]">
      <PatientSectionNav section="account" />
      <PageHeader
        eyebrow="Account"
        title="Connected devices & apps"
        description="Sync data from your wearables and health apps so your care team sees the full picture."
      />
      <IntegrationsView
        initialStates={connections}
        availability={availability}
      />
    </PageShell>
  );
}
