/**
 * Methods of Administration taxonomy (EMR-880).
 *
 * Dr. Patel: each route family is its own *coloured header bubble* (never
 * gold/red/green — those are reserved for ratio/active/inactive), with the
 * concrete examples rendered as "beige" sub-bubbles. The same structure
 * applies across cannabis, psilocybin, pharmaceutical, OTC and nutraceutical
 * medications, so this lives in one place and the AI/route mapper can target
 * a single canonical key.
 */

export interface AdministrationMethod {
  key: string;
  /** Header bubble label. */
  label: string;
  /** Concrete examples → rendered as beige sub-bubbles. */
  examples: string[];
  /** Header bubble colour classes — deliberately avoids gold/red/green. */
  headerClass: string;
}

export const ADMINISTRATION_METHODS: AdministrationMethod[] = [
  {
    key: "inhalation",
    label: "Inhalation",
    examples: ["Smoking", "Vaporizing", "Dabbing", "Inhaler"],
    headerClass: "bg-sky-100 text-sky-800 border-sky-300",
  },
  {
    key: "oral",
    label: "Oral",
    examples: ["Edibles", "Beverage", "Capsule/Pill"],
    headerClass: "bg-violet-100 text-violet-800 border-violet-300",
  },
  {
    key: "topical_transdermal",
    label: "Topical & Transdermal",
    examples: ["Cream", "Patch", "Balm", "Lotion"],
    headerClass: "bg-teal-100 text-teal-800 border-teal-300",
  },
  {
    key: "suppository",
    label: "Suppositories",
    examples: ["Rectal", "Vaginal"],
    headerClass: "bg-purple-100 text-purple-800 border-purple-300",
  },
  {
    key: "nasal",
    label: "Nasal",
    examples: ["Sprays", "Mist"],
    headerClass: "bg-cyan-100 text-cyan-800 border-cyan-300",
  },
  {
    key: "ocular",
    label: "Ocular",
    examples: ["Eye drops"],
    headerClass: "bg-indigo-100 text-indigo-800 border-indigo-300",
  },
  {
    key: "buccal",
    label: "Buccal",
    examples: ["Cheek", "Gum"],
    headerClass: "bg-fuchsia-100 text-fuchsia-800 border-fuchsia-300",
  },
  {
    key: "cns",
    label: "Central Nervous System",
    examples: ["Intrathecal", "Epidural", "Intraventricular"],
    headerClass: "bg-rose-100 text-rose-800 border-rose-300",
  },
  {
    key: "otic",
    label: "Otic",
    examples: ["Ear drops"],
    headerClass: "bg-blue-100 text-blue-800 border-blue-300",
  },
  {
    key: "injectable",
    label: "Injectable",
    examples: ["IV", "IM", "SubQ", "ID"],
    headerClass: "bg-pink-100 text-pink-800 border-pink-300",
  },
  {
    key: "skeletal_joints",
    label: "Skeletal / Joints",
    examples: ["IA (intra-articular)", "IO (intraosseous)"],
    headerClass: "bg-emerald-100 text-emerald-900 border-emerald-300",
  },
  {
    key: "body_cavity",
    label: "Body Cavity",
    examples: ["IC", "IP", "IPL"],
    headerClass: "bg-slate-100 text-slate-700 border-slate-300",
  },
];

const METHOD_BY_KEY = new Map(ADMINISTRATION_METHODS.map((m) => [m.key, m]));

export function methodByKey(key: string): AdministrationMethod | undefined {
  return METHOD_BY_KEY.get(key);
}

/**
 * Heuristically map a free-text route/format (e.g. "sublingual oil",
 * "vape cartridge", "rectal suppository") to a canonical method key.
 * Deterministic so a given medication always lands in the same family.
 */
export function mapRouteToMethod(route: string | null | undefined): string {
  const r = (route ?? "").toLowerCase();
  if (/(smok|vape|vapor|inhal|dab|cartridge|flower)/.test(r)) return "inhalation";
  if (/(edible|gummy|gummies|capsule|pill|tablet|beverage|drink|oral|sublingual|tincture|oil)/.test(r))
    return "oral";
  if (/(topical|transderm|cream|balm|lotion|patch)/.test(r)) return "topical_transdermal";
  if (/(supposit|rectal|vaginal)/.test(r)) return "suppository";
  if (/(nasal|nose|mist|spray)/.test(r)) return "nasal";
  if (/(ocular|eye)/.test(r)) return "ocular";
  if (/(buccal|cheek|gum)/.test(r)) return "buccal";
  if (/(intrathecal|epidural|intraventricular)/.test(r)) return "cns";
  if (/(otic|ear)/.test(r)) return "otic";
  if (/\b(iv|im|subq|subcutaneous|intramuscular|intradermal|inject)/.test(r))
    return "injectable";
  if (/(intra-?articular|intraosseous|\bia\b|\bio\b|joint)/.test(r))
    return "skeletal_joints";
  if (/(intracavit|intraperitoneal|\bip\b|\bic\b)/.test(r)) return "body_cavity";
  return "oral";
}
