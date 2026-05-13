// EMR-281 — Build the suggestion universe for the Leafmart hero search bar.
//
// Server-side: pulls product names from the catalog and combines them with
// static cannabis taxonomies (symptoms, cannabinoids, terpenes, strains,
// delivery formats). The result is ranked client-side as the user types.

import type { Suggestion } from "@/components/leafmart/HeroSearchBar";
import type { LeafmartProduct } from "@/components/leafmart/LeafmartProductCard";

const SYMPTOMS = [
  "sleep", "insomnia", "anxiety", "pain", "chronic pain", "back pain",
  "migraine", "headache", "nausea", "depression", "ptsd", "stress",
  "appetite", "inflammation", "muscle recovery", "focus", "energy",
  "menstrual cramps", "neuropathy", "fatigue",
];

const CANNABINOIDS = [
  "THC", "CBD", "CBG", "CBN", "THCv", "CBC", "CBDa", "THCa",
];

const TERPENES = [
  "myrcene", "limonene", "linalool", "pinene", "alpha-pinene",
  "beta-pinene", "caryophyllene", "humulene", "terpinolene", "ocimene",
  "bisabolol", "eucalyptol",
];

const STRAINS = ["indica", "sativa", "hybrid"];

const FORMATS = [
  "tincture", "edible", "topical", "beverage", "capsule", "vape",
  "serum", "flower",
];

const ACCESSORIES = [
  "grow light", "grow tent", "vape battery", "rolling tray",
  "storage jar", "grinder", "fertilizer", "trimming shears",
];

export function buildSuggestions(products: LeafmartProduct[]): Suggestion[] {
  const out: Suggestion[] = [];

  // Products — name + brand context. De-duplicate by slug.
  const seen = new Set<string>();
  for (const p of products) {
    if (seen.has(p.slug)) continue;
    seen.add(p.slug);
    out.push({
      kind: "product",
      label: p.name,
      detail: `${p.partner} · ${p.formatLabel}`,
      href: `/leafmart/products/${p.slug}`,
    });
  }

  for (const s of SYMPTOMS) out.push({ kind: "symptom", label: s });
  for (const c of CANNABINOIDS) out.push({ kind: "cannabinoid", label: c });
  for (const t of TERPENES) out.push({ kind: "terpene", label: t });
  for (const s of STRAINS) out.push({ kind: "strain", label: s });
  for (const f of FORMATS) out.push({ kind: "format", label: f });
  for (const a of ACCESSORIES) out.push({ kind: "accessory", label: a });

  return out;
}
