"use client";

import * as React from "react";
import { cn } from "@/lib/utils/cn";

/**
 * EMR-696 — Allergy bubble (red/yellow) with hover detail.
 *
 * - Red bubble  → true allergy (hives, angioedema, anaphylaxis).
 * - Yellow bubble → adverse reaction (nausea, vomiting, body aches,
 *   weakness, etc) that is NOT a true allergy.
 *
 * Hover surfaces a small popup with the cause + reaction so the chart
 * header doesn't have to wrap long reaction strings inline.
 */

export type AllergyKind = "true-allergy" | "adverse-reaction";

/**
 * Classify a reaction string into a true allergy vs an adverse reaction.
 * Conservative: anything matching the immune-mediated keyword list is
 * "true-allergy"; otherwise "adverse-reaction". Editable from one place.
 */
const TRUE_ALLERGY_KEYWORDS = [
  "hives",
  "urticaria",
  "angioedema",
  "anaphylaxis",
  "anaphylactic",
  "wheezing",
  "throat swelling",
  "shortness of breath",
  "swelling",
  "rash",
];

export function classifyAllergyKind(reaction: string): AllergyKind {
  const lower = reaction.toLowerCase();
  return TRUE_ALLERGY_KEYWORDS.some((kw) => lower.includes(kw))
    ? "true-allergy"
    : "adverse-reaction";
}

const KIND_CLASSES: Record<AllergyKind, string> = {
  "true-allergy": "bg-red-100 text-red-800 border-red-300",
  "adverse-reaction": "bg-amber-100 text-amber-800 border-amber-300",
};

const KIND_LABEL: Record<AllergyKind, string> = {
  "true-allergy": "allergy",
  "adverse-reaction": "reaction",
};

export interface AllergyBubbleData {
  /** What the patient is allergic / reactive to. */
  cause: string;
  /** What happens (free text). */
  reaction: string;
  /** Either derived from `reaction` or set explicitly by the user. */
  kind?: AllergyKind;
}

export function AllergyBubble({
  data,
  className,
}: {
  data: AllergyBubbleData;
  className?: string;
}) {
  const kind = data.kind ?? classifyAllergyKind(data.reaction);
  return (
    <span
      className={cn(
        "group relative inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-medium rounded-full border tracking-wide cursor-help",
        KIND_CLASSES[kind],
        className,
      )}
      data-allergy-kind={kind}
    >
      {data.cause}
      <span className="text-[10px] opacity-70">· {KIND_LABEL[kind]}</span>
      <span
        role="tooltip"
        className="invisible group-hover:visible absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-56 bg-surface-raised border border-border text-text text-xs rounded-md p-2 shadow-xl z-50"
      >
        <strong className="block mb-1 text-text">{data.cause}</strong>
        <span className="text-text-muted">{data.reaction}</span>
        <span className="block mt-1 text-[10px] text-text-subtle uppercase tracking-wider">
          {kind === "true-allergy"
            ? "True allergy — avoid"
            : "Adverse reaction — note, not a contraindication"}
        </span>
      </span>
    </span>
  );
}
