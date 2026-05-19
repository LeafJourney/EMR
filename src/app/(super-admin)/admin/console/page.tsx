import { PageHeader, PageShell } from "@/components/shell/PageHeader";
import { Breadcrumbs } from "@/components/super-admin/breadcrumbs";
import { SuperAdminConsole } from "@/components/admin/super-admin-console";

export const metadata = { title: "Super-admin console" };
export const dynamic = "force-dynamic";

export default async function SuperAdminConsolePage() {
  return (
    <PageShell>
      <Breadcrumbs
        items={[
          { label: "HQ", href: "/admin/hq" },
          { label: "Security" },
          { label: "Super-admin console" },
        ]}
      />
      <PageHeader
        eyebrow="Internal"
        title="Super-admin console"
        description="Manage practices and the super-admin allowlist. Specialty switches here apply to live, published configurations."
      />
      <SuperAdminConsole />
    </PageShell>
  );
}
