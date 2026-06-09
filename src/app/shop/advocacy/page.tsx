import type { Metadata } from "next";
import { AdvocacyView } from "./advocacy-view";

// EMR-328 — Public BizFed Advocacy surface for the LeafMart shop.
// Integrates the BizFed family (Institute, LA County, Central Valley) with
// clean attribution and outbound links back to the official sources.
export const metadata: Metadata = {
  title: "Advocacy — BizFed × LeafJourney | Leafmart",
  description:
    "Business advocacy in partnership with the BizFed family — Institute, LA County, and Central Valley. Action alerts, member events, and position statements relevant to the cannabis & wellness community, with links to the official sources.",
};

// Rendered inside the shared ShopLayout, so this page emits content only.
export default function AdvocacyPage() {
  return (
    <div className="px-4 py-8 lg:px-12">
      <AdvocacyView />
    </div>
  );
}
