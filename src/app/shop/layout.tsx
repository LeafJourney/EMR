import type { Metadata } from "next";
import { StoreCartProvider } from "@/components/store/cart";
import { CompareTrayProvider, CompareTrayBar } from "@/components/store/compare-tray";
import { ShopTopBar } from "@/components/store/ShopTopBar";
import { ShopDepartmentBar } from "@/components/store/ShopDepartmentBar";
import { SiteFooter } from "@/components/marketing/SiteFooter";

export const metadata: Metadata = {
  title: "Leafmart — the cannabis marketplace",
  description:
    "Shop a curated cannabis marketplace: lab-verified products, clinician picks, AI-curated details, reviews with photos, and a checkout built to rival Amazon.",
};

// EMR-188 — Integrated marketplace surface. The whole /shop tree shares one
// cart, the Amazon-style top bar (search + cart count), and the department
// nav, so navigating between the storefront, supply finder, PDPs, and
// checkout feels like one ecosystem.
export default function ShopLayout({ children }: { children: React.ReactNode }) {
  return (
    <StoreCartProvider>
      <CompareTrayProvider>
        <div className="min-h-screen bg-bg">
          <ShopTopBar />
          <ShopDepartmentBar />
          <main id="main-content">{children}</main>
          <SiteFooter />
          {/* EMR-375 — storefront-wide compare tray (max 3) */}
          <CompareTrayBar />
        </div>
      </CompareTrayProvider>
    </StoreCartProvider>
  );
}
