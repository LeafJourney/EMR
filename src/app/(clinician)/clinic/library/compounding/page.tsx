// Cannabis Compound & Botanical Order Builder — EMR-1163 (Domain 7).
//
// Net-new compounding surface: the single-product models (CannabisProduct /
// DosingRegimen) describe finished products and one-patient dosing, but a
// compound formulation is a clinician-defined recipe at a target cannabinoid
// ratio. This page drives the pure engine in @/lib/domain/cannabis-compounding.

import { PageShell, PageHeader } from "@/components/shell/PageHeader";
import { CompoundingBuilder } from "./compounding-builder";

export const metadata = { title: "Compound & Botanical Order Builder" };

export default function CompoundingPage() {
  return (
    <PageShell maxWidth="max-w-[1100px]">
      <PageHeader
        eyebrow="Compounding"
        title="Compound & Botanical Order Builder"
        description="Design a multi-cannabinoid formulation by target ratio, see the raw-ingredient yield, and check it against your jurisdictional THC limit."
      />
      <CompoundingBuilder />
    </PageShell>
  );
}
