import { SiteHeader } from "@/components/marketing/SiteHeader";
import { SiteFooter } from "@/components/marketing/SiteFooter";
import { PricingClient } from "./PricingClient";

export const metadata = {
  title: "Pricing — Leafjourney",
  description:
    "Simple, transparent pricing for cannabis clinics. Start free, scale when ready — no per-patient charges, no hidden fees.",
};

// EMR — pricing page. Previously this route redirected to `/`, which
// dead-ended a fully built pricing UI (PricingClient) and broke the
// Stripe/Linear-tier expectation that "/pricing" should always work.
// Bringing the real client back online with the marketing chrome
// (SiteHeader + SiteFooter) so it matches the rest of the public surface.
export default function PricingPage() {
  return (
    <div className="min-h-screen bg-bg">
      <SiteHeader />
      <main id="main-content">
        <PricingClient />
      </main>
      <SiteFooter />
    </div>
  );
}
