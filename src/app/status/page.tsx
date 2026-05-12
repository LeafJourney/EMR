import { SiteHeader } from "@/components/marketing/SiteHeader";
import { SiteFooter } from "@/components/marketing/SiteFooter";
import { StatusView } from "./status-view";

export const metadata = {
  title: "System Status — Leafjourney",
  description: "Live service status and incident history for Leafjourney.",
};

export default function StatusPage() {
  return (
    <div className="min-h-screen bg-bg flex flex-col">
      <SiteHeader />
      <main id="main-content" className="flex-1 max-w-[1080px] w-full mx-auto px-6 lg:px-12 py-12">
        <StatusView />
      </main>
      <SiteFooter />
    </div>
  );
}
