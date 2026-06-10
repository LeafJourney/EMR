import type { Metadata } from "next";
import { DosingGuideView } from "./dosing-guide-view";

export const metadata: Metadata = {
  title: "Dosing guide — Leafmart",
  description:
    "General, evidence-informed dosing guidance by product format. Start low, go slow. Education, not medical advice.",
};

// EMR-371 — Dosing guide. Each format entry is gated behind a disclaimer modal
// the shopper must explicitly acknowledge before the guide opens.
export default function DosingGuidePage({
  searchParams,
}: {
  searchParams?: { format?: string };
}) {
  return (
    <div className="px-4 py-8 lg:px-12">
      <DosingGuideView initialFormat={searchParams?.format} />
    </div>
  );
}
