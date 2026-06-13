import { requireRole } from "@/lib/auth/session";
import { PageHeader, PageShell } from "@/components/shell/PageHeader";
import { PatientSectionNav } from "@/components/shell/PatientSectionNav";
import { IntegrationsView } from "./integrations-view";
import { getDeviceConnections } from "./actions";

export const metadata = { title: "Integrations" };

export default async function PatientIntegrationsPage() {
  await requireRole("patient");
  const connections = await getDeviceConnections();

  return (
    <PageShell maxWidth="max-w-[1060px]">
      <PatientSectionNav section="account" />
      <PageHeader
        eyebrow="Account"
        title="Connected devices & apps"
        description="Sync data from your wearables and health apps so your care team sees the full picture."
      />
      <IntegrationsView initialStates={connections} />
    </PageShell>
  );
}
