import { PageHeader, PageShell } from "@/components/shell/PageHeader";
import { SuperAdminConsole } from "@/components/admin/super-admin-console";

export const metadata = { title: "Super-admin console" };
export const dynamic = "force-dynamic";

export default async function SuperAdminConsolePage() {
  // The (super-admin) layout already gates this page. We just render the
  // client console — it fetches its own data through /api/admin/* so the
  // user can refresh after mutations without reloading the page.
  return (
    <PageShell>
      <PageHeader
        eyebrow="Internal"
        title="Super-admin console"
        description="Manage practices and the super-admin allowlist. Specialty switches here apply to live, published configurations."
      />
      <SuperAdminConsole />
    </PageShell>
  );
}
