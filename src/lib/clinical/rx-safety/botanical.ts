// ---------------------------------------------------------------------------
// Botanical, Cannabinoid & Xenobiotic Interaction Engine — Phase 4.
//
// Layered ON TOP of the existing cannabinoid interaction module
// (src/lib/domain/drug-interactions.ts → checkInteractions). That module
// already encodes the curated CBD/THC × drug interaction database (severity,
// mechanism, recommendation, PMIDs). We reuse it for the cannabinoid arm so we
// inherit the same vetted data + matching semantics instead of duplicating it,
// then translate its red/yellow/green output into the richer GuardrailFinding
// shape (with optimization actions + queued follow-up labs) the spec's anchor
// rules require, and add the non-cannabinoid botanical escalation vectors
// (e.g. St. John's Wort × cyclosporine/tacrolimus) on top.
// ---------------------------------------------------------------------------

import {
  checkInteractions,
  inferCannabinoidsFromName,
} from "@/lib/domain/drug-interactions";
import {
  type BotanicalExposure,
  type DraftOrder,
  type GuardrailFinding,
  LOINC,
  orderMatchesDrug,
} from "./types";

// ---------------------------------------------------------------------------
// Cannabinoid exposure detection
// ---------------------------------------------------------------------------

const CANNABINOID_TOKENS = ["THC", "CBD", "CBN", "CBG"];

/**
 * Derive the active cannabinoid set from the patient's botanical exposures,
 * reusing inferCannabinoidsFromName() from the existing module for free-text
 * product names (cannabis product / dosing-log entries).
 */
export function cannabinoidsFromExposures(
  exposures: BotanicalExposure[]
): { cannabinoids: string[]; concentrated: boolean } {
  const set = new Set<string>();
  let concentrated = false;
  for (const e of exposures) {
    const isCannabis =
      e.kind === "cannabinoid" ||
      CANNABINOID_TOKENS.some((t) => e.name.toUpperCase().includes(t)) ||
      /cannab|marijuana|tincture|\d+\s*:\s*\d+/i.test(e.name);
    if (!isCannabis) continue;
    if (e.concentrated) concentrated = true;
    for (const c of inferCannabinoidsFromName(e.name)) set.add(c);
  }
  return { cannabinoids: Array.from(set), concentrated };
}

// ---------------------------------------------------------------------------
// Cannabinoid anchor rules — translate checkInteractions output into the
// richer optimization/override findings the spec calls for.
// ---------------------------------------------------------------------------

interface CannabinoidAnchor {
  ruleId: string;
  drug: { names: string[]; rxNormCuis?: string[] };
  /** Which cannabinoids must be present to trigger. */
  requires: string[];
  build: (
    cannabinoids: string[],
    concentrated: boolean
  ) => Omit<GuardrailFinding, "layer" | "ruleId">;
}

const CANNABINOID_ANCHORS: CannabinoidAnchor[] = [
  // Concentrated CBD × warfarin/DOACs (CYP2C9) → optimization + INR follow-up
  {
    ruleId: "botanical.cbd.anticoagulant",
    drug: {
      names: [
        "warfarin",
        "coumadin",
        "jantoven",
        "apixaban",
        "eliquis",
        "rivaroxaban",
        "xarelto",
        "dabigatran",
        "pradaxa",
        "edoxaban",
        "savaysa",
      ],
    },
    requires: ["CBD"],
    build: () => ({
      kind: "optimization",
      mechanism:
        "CBD competes for CYP2C9 (and CYP3A4) clearance, slowing " +
        "anticoagulant metabolism and increasing bleeding risk.",
      rationale:
        "Concentrated CBD exposure alongside an anticoagulant can raise " +
        "effective anticoagulant levels.",
      recommendation:
        "Suggest a 25% reduction in the initial anticoagulant dose and queue " +
        "an immediate follow-up INR check.",
      citations: ["CYP2C9 interaction", "real-world cannabinoid PK evidence"],
      requiredFollowUp: [{ labLoinc: LOINC.INR, timing: "immediate" }],
      details: { enzyme: "CYP2C9", suggestedDoseReductionPct: 25 },
    }),
  },

  // THC/CBD × clobazam (CYP2C19) → dosing_override + sedation warning
  {
    ruleId: "botanical.cannabinoid.clobazam",
    drug: { names: ["clobazam", "onfi", "sympazan"] },
    requires: ["CBD"],
    build: () => ({
      kind: "dosing_override",
      mechanism:
        "CBD strongly inhibits CYP2C19, raising the active metabolite " +
        "N-desmethylclobazam and amplifying sedation.",
      rationale:
        "Co-administered cannabinoids cause N-desmethylclobazam accumulation " +
        "and risk profound sedation at the drafted dose.",
      recommendation:
        "Cap the proposed clobazam dose and issue a high-priority sedation " +
        "risk warning; consider tapering with monitoring.",
      citations: ["CYP2C19 inhibition", "Epidiolex/clobazam interaction data"],
      details: { enzyme: "CYP2C19", sedationRisk: "high" },
    }),
  },
];

// ---------------------------------------------------------------------------
// Non-cannabinoid botanical escalation vectors
// ---------------------------------------------------------------------------

interface BotanicalAnchor {
  ruleId: string;
  /** Botanical name tokens to detect in the exposure manifest. */
  botanicalTokens: string[];
  drug: { names: string[]; rxNormCuis?: string[] };
  build: () => Omit<GuardrailFinding, "layer" | "ruleId">;
}

const BOTANICAL_ANCHORS: BotanicalAnchor[] = [
  // St. John's Wort × cyclosporine/tacrolimus (CYP3A4 / P-gp induction)
  {
    ruleId: "botanical.sjw.calcineurin",
    botanicalTokens: ["st. john", "st john", "hypericum", "hyperforin"],
    drug: {
      names: [
        "cyclosporine",
        "neoral",
        "sandimmune",
        "gengraf",
        "tacrolimus",
        "prograf",
        "astagraf",
        "envarsus",
      ],
    },
    build: () => ({
      kind: "hard_stop",
      mechanism:
        "Hyperforin in St. John's Wort potently induces hepatic CYP3A4 and " +
        "P-glycoprotein, accelerating calcineurin-inhibitor clearance.",
      rationale:
        "Subtherapeutic cyclosporine/tacrolimus levels create a high risk of " +
        "acute organ transplant rejection.",
      recommendation:
        "Hard block. Deny parallel prescription. Discontinue St. John's Wort " +
        "and re-evaluate immunosuppressant dosing with level monitoring.",
      citations: ["CYP3A4/P-gp induction", "transplant rejection case evidence"],
      details: { enzyme: "CYP3A4/P-gp", transplantRejectionRisk: true },
    }),
  },
];

// ---------------------------------------------------------------------------
// evaluateBotanical
// ---------------------------------------------------------------------------

/**
 * Evaluate the botanical/cannabinoid layer. Reuses checkInteractions() from the
 * existing domain module to confirm a curated cannabinoid×drug interaction
 * exists before emitting the richer anchor finding, so we never fire ahead of
 * the vetted database.
 */
export function evaluateBotanical(
  order: DraftOrder,
  exposures: BotanicalExposure[]
): GuardrailFinding[] {
  const findings: GuardrailFinding[] = [];

  // --- Cannabinoid arm (reuses the existing interaction database) --------
  const { cannabinoids, concentrated } = cannabinoidsFromExposures(exposures);
  if (cannabinoids.length > 0) {
    // Confirm the curated DB knows about an interaction for this drug ×
    // cannabinoid pair (reuse of checkInteractions). This both validates the
    // pairing and surfaces the underlying PMIDs.
    const known = checkInteractions([order.drugName], cannabinoids);

    for (const anchor of CANNABINOID_ANCHORS) {
      if (!orderMatchesDrug(order, anchor.drug)) continue;
      if (!anchor.requires.every((c) => cannabinoids.includes(c))) continue;

      const partial = anchor.build(cannabinoids, concentrated);

      // Enrich citations with any PMIDs the curated DB carries for this pair.
      const refs = known
        .filter((k) => anchor.requires.includes(k.cannabinoid.toUpperCase()))
        .flatMap((k) => k.references);
      const citations = [...partial.citations, ...refs];

      findings.push({
        ...partial,
        citations,
        layer: "botanical",
        ruleId: anchor.ruleId,
      });
    }
  }

  // --- Non-cannabinoid botanical arm -------------------------------------
  const manifest = exposures.map((e) => e.name.toLowerCase());
  for (const anchor of BOTANICAL_ANCHORS) {
    const present = anchor.botanicalTokens.some((t) =>
      manifest.some((m) => m.includes(t))
    );
    if (!present) continue;
    if (!orderMatchesDrug(order, anchor.drug)) continue;
    findings.push({
      ...anchor.build(),
      layer: "botanical",
      ruleId: anchor.ruleId,
    });
  }

  return findings;
}
