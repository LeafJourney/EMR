/**
 * EMR-885 — Unified medication search directory
 *
 * Dr. Patel wants the prescribe/`/med` surface to search across *all* the
 * substance classes this clinic actually manages — conventional
 * pharmaceuticals, cannabis products (by brand), nutraceuticals, OTC, and
 * (where lawful) psilocybin — from one ranked autocomplete. Each entry
 * surfaces common strengths/forms and a default sig so the order is one tap.
 *
 * `searchMedications` does case-insensitive prefix+substring matching on the
 * name and brand, respects an optional class filter, ranks prefix hits ahead
 * of substring hits, and defaults to 8 results. Pure data + helper only.
 */

export type MedClass =
  | "pharmaceutical"
  | "cannabis"
  | "nutraceutical"
  | "otc"
  | "psilocybin";

export interface MedSearchEntry {
  name: string; // "Lisinopril"
  medClass: MedClass;
  /** common strengths/forms to surface, e.g. ["2.5mg","5mg","10mg"] */
  strengths: string[];
  defaultSig?: string; // "PO qday"
  brand?: string; // for cannabis: "Camino"
}

export const MED_DIRECTORY: readonly MedSearchEntry[] = [
  // ---- Pharmaceuticals ----
  { name: "Lisinopril", medClass: "pharmaceutical", strengths: ["2.5mg", "5mg", "10mg", "20mg", "40mg"], defaultSig: "PO qday" },
  { name: "Atorvastatin", medClass: "pharmaceutical", strengths: ["10mg", "20mg", "40mg", "80mg"], defaultSig: "PO qHS" },
  { name: "Metformin", medClass: "pharmaceutical", strengths: ["500mg", "850mg", "1000mg"], defaultSig: "PO BID with meals" },
  { name: "Amlodipine", medClass: "pharmaceutical", strengths: ["2.5mg", "5mg", "10mg"], defaultSig: "PO qday" },
  { name: "Omeprazole", medClass: "pharmaceutical", strengths: ["10mg", "20mg", "40mg"], defaultSig: "PO qday before breakfast" },
  { name: "Sertraline", medClass: "pharmaceutical", strengths: ["25mg", "50mg", "100mg"], defaultSig: "PO qday" },
  { name: "Gabapentin", medClass: "pharmaceutical", strengths: ["100mg", "300mg", "400mg", "600mg", "800mg"], defaultSig: "PO TID" },
  { name: "Levothyroxine", medClass: "pharmaceutical", strengths: ["25mcg", "50mcg", "75mcg", "88mcg", "100mcg", "112mcg", "125mcg", "150mcg"], defaultSig: "PO qAM on empty stomach" },
  { name: "Losartan", medClass: "pharmaceutical", strengths: ["25mg", "50mg", "100mg"], defaultSig: "PO qday" },
  { name: "Hydrochlorothiazide", medClass: "pharmaceutical", strengths: ["12.5mg", "25mg", "50mg"], defaultSig: "PO qAM" },
  { name: "Albuterol", medClass: "pharmaceutical", strengths: ["90mcg/actuation"], defaultSig: "2 puffs INH q4-6h PRN wheezing" },
  { name: "Montelukast", medClass: "pharmaceutical", strengths: ["4mg", "5mg", "10mg"], defaultSig: "PO qHS" },
  { name: "Prednisone", medClass: "pharmaceutical", strengths: ["1mg", "2.5mg", "5mg", "10mg", "20mg"], defaultSig: "PO qday with food" },
  { name: "Amoxicillin", medClass: "pharmaceutical", strengths: ["250mg", "500mg", "875mg"], defaultSig: "PO BID x10 days" },
  { name: "Tramadol", medClass: "pharmaceutical", strengths: ["50mg"], defaultSig: "PO q6h PRN pain" },
  { name: "Duloxetine", medClass: "pharmaceutical", strengths: ["20mg", "30mg", "60mg"], defaultSig: "PO qday" },
  { name: "Bupropion XL", medClass: "pharmaceutical", strengths: ["150mg", "300mg"], defaultSig: "PO qAM" },
  { name: "Trazodone", medClass: "pharmaceutical", strengths: ["50mg", "100mg", "150mg"], defaultSig: "PO qHS PRN insomnia" },
  { name: "Pantoprazole", medClass: "pharmaceutical", strengths: ["20mg", "40mg"], defaultSig: "PO qday before breakfast" },
  { name: "Spironolactone", medClass: "pharmaceutical", strengths: ["25mg", "50mg", "100mg"], defaultSig: "PO qday" },

  // ---- Cannabis (by brand) ----
  { name: "Camino Chill", brand: "Camino", medClass: "cannabis", strengths: ["5mg THC"], defaultSig: "1 gummy PO qHS PRN" },
  { name: "Camino Sleep", brand: "Camino", medClass: "cannabis", strengths: ["5mg THC : 1mg CBN"], defaultSig: "1 gummy PO qHS PRN insomnia" },
  { name: "Camino Balance", brand: "Camino", medClass: "cannabis", strengths: ["5mg THC : 5mg CBD"], defaultSig: "1 gummy PO BID PRN" },
  { name: "WYLD Restore", brand: "WYLD", medClass: "cannabis", strengths: ["2.5mg THC : 2.5mg CBD : 2.5mg CBN"], defaultSig: "1 gummy PO qHS PRN" },
  { name: "WYLD Elderberry", brand: "WYLD", medClass: "cannabis", strengths: ["10mg THC"], defaultSig: "1/2 gummy PO PRN" },
  { name: "Kiva Camino Sparkling Pear", brand: "Kiva", medClass: "cannabis", strengths: ["5mg THC"], defaultSig: "1 gummy PO PRN" },
  { name: "Papa & Barkley Releaf Balm", brand: "Papa & Barkley", medClass: "cannabis", strengths: ["1:3 THC:CBD"], defaultSig: "Apply topically to affected area PRN" },
  { name: "Rick Simpson Oil (RSO)", brand: "Generic", medClass: "cannabis", strengths: ["0.1mL (~25mg THC)"], defaultSig: "Titrate per tolerance qHS" },

  // ---- Nutraceuticals ----
  { name: "Vitamin D3", medClass: "nutraceutical", strengths: ["1000 IU", "2000 IU", "5000 IU"], defaultSig: "PO qday with food" },
  { name: "Magnesium Glycinate", medClass: "nutraceutical", strengths: ["120mg", "240mg", "400mg"], defaultSig: "PO qHS" },
  { name: "Omega-3 Fish Oil", medClass: "nutraceutical", strengths: ["1000mg", "1200mg"], defaultSig: "PO BID with meals" },
  { name: "Melatonin", medClass: "nutraceutical", strengths: ["1mg", "3mg", "5mg", "10mg"], defaultSig: "PO qHS" },
  { name: "Turmeric (Curcumin)", medClass: "nutraceutical", strengths: ["500mg", "1000mg"], defaultSig: "PO qday with food" },

  // ---- OTC ----
  { name: "Ibuprofen", medClass: "otc", strengths: ["200mg", "400mg", "600mg", "800mg"], defaultSig: "PO q6-8h PRN pain with food" },
  { name: "Acetaminophen", medClass: "otc", strengths: ["325mg", "500mg", "650mg"], defaultSig: "PO q6h PRN, max 3g/day" },
  { name: "Loratadine", medClass: "otc", strengths: ["10mg"], defaultSig: "PO qday PRN allergies" },
  { name: "Famotidine", medClass: "otc", strengths: ["10mg", "20mg", "40mg"], defaultSig: "PO BID PRN heartburn" },
  { name: "Aspirin", medClass: "otc", strengths: ["81mg", "325mg"], defaultSig: "PO qday" },

  // ---- Psilocybin ----
  { name: "Psilocybin (microdose)", medClass: "psilocybin", strengths: ["0.1g", "0.2g"], defaultSig: "PO per Fadiman protocol (every 3rd day)" },
  { name: "Psilocybin (macrodose)", medClass: "psilocybin", strengths: ["1g", "2g", "3.5g"], defaultSig: "Supervised session only" },
];

/**
 * Search the directory. Case-insensitive prefix+substring match on name and
 * brand; prefix hits rank ahead of substring hits. Respects `opts.classes`
 * (any-of) and `opts.limit` (default 8). An empty query returns the head of
 * the filtered directory.
 */
export function searchMedications(
  query: string,
  opts?: { classes?: MedClass[]; limit?: number },
): MedSearchEntry[] {
  const limit = opts?.limit ?? 8;
  const classFilter = opts?.classes;

  const inClass = (e: MedSearchEntry) =>
    !classFilter || classFilter.length === 0 || classFilter.includes(e.medClass);

  const q = query.trim().toLowerCase();
  const pool = MED_DIRECTORY.filter(inClass);

  if (q === "") return pool.slice(0, limit);

  const scored: { entry: MedSearchEntry; rank: number }[] = [];
  for (const entry of pool) {
    const name = entry.name.toLowerCase();
    const brand = entry.brand?.toLowerCase() ?? "";
    let rank = Infinity;
    if (name.startsWith(q) || brand.startsWith(q)) rank = 0;
    else if (name.includes(q) || brand.includes(q)) rank = 1;
    if (rank !== Infinity) scored.push({ entry, rank });
  }

  scored.sort((a, b) => a.rank - b.rank || a.entry.name.localeCompare(b.entry.name));
  return scored.slice(0, limit).map((s) => s.entry);
}
