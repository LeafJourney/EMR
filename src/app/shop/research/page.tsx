import type { Metadata } from "next";
import { Eyebrow } from "@/components/ui/ornament";
import { Badge } from "@/components/ui/badge";
import { AnalyticsLab } from "./analytics-lab";
import {
  HEATMAP,
  SEASONAL,
  HEADLINE_STATS,
  LAST_UPDATED_LABEL,
} from "./research-data";

export const metadata: Metadata = {
  title: "Research — Analytics Lab | Leafmart",
  description:
    "Explore the Leafmart Analytics Lab: a live, de-identified view of how the community reports cannabis outcomes — a patient trend heatmap and a seasonal pattern detector across six wellness metrics.",
};

// EMR-374 — Public "Research" surface for the LeafMart shop. Renders inside the
// shared ShopLayout (top bar + department nav + footer are provided by the
// layout), so this page returns ONLY the inner content. All aggregate data is
// built deterministically on the server in research-data.ts (no Math.random, no
// time APIs) and passed down to the interactive client view.
export default function ShopResearchPage() {
  return (
    <div className="px-4 py-8 lg:px-12">
      <div className="mb-6 max-w-2xl">
        <div className="mb-2 flex items-center gap-3">
          <Eyebrow>Analytics Lab</Eyebrow>
          <Badge tone="success">De-identified · aggregated</Badge>
        </div>
        <h1 className="font-display text-3xl tracking-tight text-text sm:text-4xl">
          See what the community is reporting
        </h1>
        <p className="mt-3 text-[15px] leading-relaxed text-text-muted">
          A live, never-personal window into how people report feeling on
          cannabis. Explore a trend heatmap across six wellness metrics and a
          seasonal pattern detector — all built from community check-ins,
          aggregated and de-identified, never tied to anyone.
        </p>
      </div>

      <AnalyticsLab
        heatmap={HEATMAP}
        seasonal={SEASONAL}
        stats={HEADLINE_STATS}
        lastUpdatedLabel={LAST_UPDATED_LABEL}
      />
    </div>
  );
}
