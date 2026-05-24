import { SiteHeader } from "@/components/marketing/SiteHeader";
import { SiteFooter } from "@/components/marketing/SiteFooter";
import { getSystemHealth } from "@/lib/status/system-health";
import { StatusView } from "./status-view";
import { INCIDENTS, MAINTENANCE } from "./status-data";

export const metadata = {
  title: "System Status — Leafjourney",
  description: "Live service status and incident history for Leafjourney.",
};

// Public surface — no PHI, no auth. Re-render at most every 30s so a flood
// of status hits doesn't fan out into our (eventual) probe layer.
export const revalidate = 30;

export default async function StatusPage() {
  const snapshot = await getSystemHealth();
  return (
    <div className="min-h-screen bg-bg flex flex-col">
      <SiteHeader />
      <main
        id="main-content"
        className="flex-1 max-w-[1080px] w-full mx-auto px-6 lg:px-12 py-12"
      >
        <StatusView
          snapshot={snapshot}
          incidents={INCIDENTS}
          maintenance={MAINTENANCE}
        />
      </main>
      <SiteFooter />
    </div>
  );
}
