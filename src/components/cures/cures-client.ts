/**
 * EMR-781 — Thin client-safe surface over the CURES domain module.
 * Re-exports the pure helpers the prescribing UI needs plus a small
 * tone/label mapping for PDMP flags so the client doesn't have to
 * reach into design-token files directly.
 */

import { pdmpFlagLabel, type PdmpFlag } from "@/lib/dispensary/medical-cannabis";

export {
  simulateCuresQuery,
  recommendNarcan,
  findOpioids,
  isOpioid,
  CURES_REVIEW_TEMPLATE,
  CURES_SHORTCUTS,
  expandCuresShortcut,
} from "@/lib/domain/cures";
export type {
  CuresSnapshot,
  CuresPrescriptionRecord,
  NarcanRecommendation,
  ShortcutExpansion,
} from "@/lib/domain/cures";

type BadgeTone = "danger" | "warning" | "neutral" | "accent" | "highlight";

export function pdmpFlagToneAndLabel(flag: PdmpFlag): { tone: BadgeTone; label: string } {
  const label = pdmpFlagLabel(flag);
  switch (flag) {
    case "controlled_substance_combo":
    case "conflicting_scripts":
      return { tone: "danger", label };
    case "multiple_prescribers":
    case "multiple_pharmacies":
    case "early_refill":
      return { tone: "warning", label };
    case "no_findings":
      return { tone: "accent", label };
  }
}
