/**
 * EMR-781 — CURES (Controlled Substance Utilization Review & Evaluation
 * System) plugin.
 *
 * Provides:
 *   - A simulated CURES/PDMP query the prescriber can run inline from
 *     the prescribing module. Until a real CURES integration is wired,
 *     this returns a deterministic, demo-quality snapshot of the
 *     patient's controlled-substance history.
 *   - Opioid detection used by the Narcan safety check.
 *   - A `/cures` (and `/__`) slash-shortcut expansion used in note
 *     fields to insert the standardized controlled-substance review
 *     attestation text.
 *
 * Everything in this module is pure — no DB, no I/O — so it's safe to
 * import from server actions and client components alike.
 */

import type { PdmpFlag } from "@/lib/dispensary/medical-cannabis";

/* ── /cures slash shortcut ─────────────────────────────────────── */

/**
 * The standardized controlled-substance review attestation that
 * expands when a clinician types `/cures` or `/__` in any supported
 * note field. Pulled verbatim from the prescribing playbook.
 */
export const CURES_REVIEW_TEMPLATE =
  "Cures data reviewed. Drug-drug interactions with the controlled substances " +
  "prescribed discussed in detail. Stressed the importance of no driving or " +
  "operating heavy machinery while under the influence of these substances. " +
  "Discussed importance of weaning off immediately and that these types of " +
  "medications are primarily for short term use. Pt comprehended all " +
  "information and agreed with current medication regimen and plan.";

/** Shortcut tokens that expand to the CURES review template. */
export const CURES_SHORTCUTS = ["/cures", "/__"] as const;

export interface ShortcutExpansion {
  /** The text the caller should set as the new value. */
  nextValue: string;
  /** New caret position after the expansion. */
  caret: number;
}

/**
 * If the text immediately preceding `caret` ends with one of the
 * registered CURES shortcuts, return the value/caret pair that
 * replaces the shortcut with the full template. Returns null when no
 * shortcut is pending — callers should leave the textarea untouched.
 *
 * The shortcut must be either at the very start of the field or
 * preceded by whitespace so partial matches (e.g. `/curse` or
 * `xxx/cures`) do not fire.
 */
export function expandCuresShortcut(
  value: string,
  caret: number,
): ShortcutExpansion | null {
  if (caret <= 0 || caret > value.length) return null;
  const before = value.slice(0, caret);
  const after = value.slice(caret);

  for (const token of CURES_SHORTCUTS) {
    if (!before.endsWith(token)) continue;
    const startOfToken = before.length - token.length;
    // Must be at the start of input or preceded by whitespace so we
    // don't expand `xxx/cures` accidentally.
    const prevChar = startOfToken === 0 ? "" : before.charAt(startOfToken - 1);
    if (prevChar && !/\s/.test(prevChar)) continue;
    const replaced = before.slice(0, startOfToken) + CURES_REVIEW_TEMPLATE;
    return {
      nextValue: replaced + after,
      caret: replaced.length,
    };
  }
  return null;
}

/* ── Opioid detection / Narcan safety check ────────────────────── */

/**
 * Known opioid patterns. Conservative list focused on commonly
 * prescribed agents. A match triggers the Narcan co-prescribing
 * recommendation downstream.
 */
const OPIOID_PATTERNS: RegExp[] = [
  /\boxycodone\b/i,
  /\boxycontin\b/i,
  /\bpercocet\b/i,
  /\bhydrocodone\b/i,
  /\bvicodin\b/i,
  /\bnorco\b/i,
  /\bmorphine\b/i,
  /\bms\s*contin\b/i,
  /\bfentanyl\b/i,
  /\bduragesic\b/i,
  /\bcodeine\b/i,
  /\btramadol\b/i,
  /\bultram\b/i,
  /\bmethadone\b/i,
  /\bdolophine\b/i,
  /\bhydromorphone\b/i,
  /\bdilaudid\b/i,
  /\bbuprenorphine\b/i,
  /\bsuboxone\b/i,
  /\bsubutex\b/i,
  /\btapentadol\b/i,
  /\bnucynta\b/i,
  /\bmeperidine\b/i,
  /\bdemerol\b/i,
  /\boxymorphone\b/i,
  /\bopana\b/i,
];

/** Returns true if the supplied name matches a known opioid. */
export function isOpioid(name: string | null | undefined): boolean {
  if (!name) return false;
  const candidate = name.trim();
  if (!candidate) return false;
  return OPIOID_PATTERNS.some((p) => p.test(candidate));
}

/**
 * Scans a list of medication names and returns the subset that match
 * known opioids. Order preserved; duplicates collapsed
 * case-insensitively.
 */
export function findOpioids(names: ReadonlyArray<string | null | undefined>): string[] {
  const seen = new Set<string>();
  const matches: string[] = [];
  for (const raw of names) {
    if (!isOpioid(raw)) continue;
    const trimmed = (raw as string).trim();
    const key = trimmed.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    matches.push(trimmed);
  }
  return matches;
}

export interface NarcanRecommendation {
  /** True when at least one opioid was identified in scope. */
  recommended: boolean;
  /** Opioids that triggered the recommendation. */
  opioids: string[];
  /** Plain-language explanation to display in the UI / audit log. */
  rationale: string;
}

/**
 * Build the Narcan co-prescribing recommendation for a prescribing
 * session. Pass every name the prescriber and patient have on file
 * (new Rx + existing meds) — if any are opioids, recommend Narcan.
 */
export function recommendNarcan(
  candidateNames: ReadonlyArray<string | null | undefined>,
): NarcanRecommendation {
  const opioids = findOpioids(candidateNames);
  if (opioids.length === 0) {
    return {
      recommended: false,
      opioids: [],
      rationale:
        "No opioids detected in this prescription or the patient's active medication list.",
    };
  }
  return {
    recommended: true,
    opioids,
    rationale:
      `Opioid${opioids.length === 1 ? "" : "s"} detected (${opioids.join(", ")}). ` +
      "Per CDC and state opioid-safety guidance, naloxone (Narcan) should be co-prescribed " +
      "and overdose-reversal counseling documented in the visit note.",
  };
}

/* ── Simulated CURES database query ─────────────────────────────── */

export interface CuresPrescriptionRecord {
  /** Drug name as it appears in CURES (brand or generic). */
  drug: string;
  /** Prescriber who wrote the script. */
  prescriber: string;
  /** Pharmacy that filled it. */
  pharmacy: string;
  /** DEA schedule of the drug (II–V). */
  schedule: "II" | "III" | "IV" | "V";
  /** Quantity dispensed at the last fill. */
  quantity: number;
  /** Days supply of the last fill. */
  daysSupply: number;
  /** Last fill date (ISO yyyy-mm-dd). */
  lastFillDate: string;
  /** Total fills in the lookback window. */
  fills: number;
}

export interface CuresSnapshot {
  /** Patient identifier the snapshot was generated for. */
  patientId: string;
  /** Query timestamp (ISO). */
  queriedAt: string;
  /** Lookback window in months — California CURES defaults to 12. */
  lookbackMonths: number;
  /** Active controlled-substance prescriptions on file. */
  prescriptions: CuresPrescriptionRecord[];
  /** Normalized PDMP flag summary. */
  flags: PdmpFlag[];
  /** Plain-language safety summary surfaced to the clinician. */
  safetySummary: string;
  /** Total morphine milligram equivalents per day across all active opioid Rx. */
  totalMmePerDay: number;
}

interface PatientFingerprintInput {
  patientId: string;
  /** Names of active patient meds, used to seed the simulation. */
  medicationNames?: ReadonlyArray<string>;
  /** Pinned "now" for deterministic tests. Defaults to new Date(). */
  now?: Date;
}

/**
 * Produces a deterministic, demo-quality CURES snapshot for the
 * supplied patient. Real integration would call out to the state
 * CURES API and parse the response; until that ships this gives the
 * prescribing UI realistic-looking data to render against.
 *
 * Determinism: same `patientId` + medication list always returns the
 * same snapshot, so screenshots / e2e tests don't drift.
 */
export function simulateCuresQuery(
  input: PatientFingerprintInput,
): CuresSnapshot {
  const now = input.now ?? new Date();
  const lookbackMonths = 12;
  const seed = hashSeed(input.patientId);

  // Always pull the patient's known opioid meds into the simulation
  // so the UI reflects the truth we *do* know.
  const knownOpioids = findOpioids(input.medicationNames ?? []);

  const prescriptions: CuresPrescriptionRecord[] = [];

  for (const name of knownOpioids) {
    prescriptions.push(buildRecord(name, seed, now, prescriptions.length));
  }

  // Mix in 0–2 simulated additional controlled scripts derived from
  // the patient fingerprint so the snapshot has body for demo use.
  const extraCount = seed % 3; // 0, 1, or 2
  const fillerPool: Array<{ drug: string; schedule: "II" | "III" | "IV" | "V" }> = [
    { drug: "Alprazolam 0.5 mg", schedule: "IV" },
    { drug: "Zolpidem 10 mg", schedule: "IV" },
    { drug: "Tramadol 50 mg", schedule: "IV" },
    { drug: "Lorazepam 1 mg", schedule: "IV" },
    { drug: "Hydrocodone-Acetaminophen 5-325 mg", schedule: "II" },
  ];
  for (let i = 0; i < extraCount; i++) {
    const pick = fillerPool[(seed + i) % fillerPool.length];
    // Don't duplicate something we already added from real meds.
    if (prescriptions.some((p) => p.drug.toLowerCase() === pick.drug.toLowerCase())) continue;
    prescriptions.push({
      ...buildRecord(pick.drug, seed + i * 7, now, prescriptions.length),
      schedule: pick.schedule,
    });
  }

  // Aggregate flags from the synthesized set.
  const uniquePrescribers = new Set(prescriptions.map((p) => p.prescriber));
  const uniquePharmacies = new Set(prescriptions.map((p) => p.pharmacy));
  const opioidCount = prescriptions.filter((p) => isOpioid(p.drug)).length;
  const benzoCount = prescriptions.filter((p) => /benzodiazepine|alprazolam|lorazepam|diazepam|clonazepam/i.test(p.drug)).length;

  const flags: PdmpFlag[] = [];
  if (uniquePrescribers.size >= 3) flags.push("multiple_prescribers");
  if (uniquePharmacies.size >= 3) flags.push("multiple_pharmacies");
  if (opioidCount > 0 && benzoCount > 0) flags.push("controlled_substance_combo");
  if (flags.length === 0 && prescriptions.length === 0) flags.push("no_findings");

  const totalMmePerDay = prescriptions.reduce(
    (sum, p) => sum + estimateMmePerDay(p),
    0,
  );

  const safetySummary = buildSafetySummary({
    prescriptions,
    flags,
    totalMmePerDay,
  });

  return {
    patientId: input.patientId,
    queriedAt: now.toISOString(),
    lookbackMonths,
    prescriptions,
    flags,
    safetySummary,
    totalMmePerDay: Math.round(totalMmePerDay * 10) / 10,
  };
}

const SIMULATED_PRESCRIBERS = [
  "Dr. Avery Chen, MD",
  "Dr. Priya Patel, MD",
  "Dr. Marcus Webb, DO",
  "Dr. Linda Gomez, NP",
];
const SIMULATED_PHARMACIES = [
  "CVS Pharmacy #4421",
  "Walgreens #2207",
  "Rite Aid #1108",
  "Community Compounding Rx",
];

function buildRecord(
  drug: string,
  seed: number,
  now: Date,
  index: number,
): CuresPrescriptionRecord {
  const prescriber = SIMULATED_PRESCRIBERS[(seed + index) % SIMULATED_PRESCRIBERS.length];
  const pharmacy = SIMULATED_PHARMACIES[(seed + index * 3) % SIMULATED_PHARMACIES.length];
  const daysSupply = [7, 14, 30][(seed + index) % 3];
  const quantity = [30, 60, 90][(seed + index * 2) % 3];
  const fills = ((seed + index) % 5) + 1;
  // Last fill somewhere in the past 60 days, deterministic.
  const daysAgo = (seed * 13 + index * 11) % 60;
  const lastFill = new Date(now.getTime() - daysAgo * 24 * 60 * 60 * 1000);
  const schedule: "II" | "III" | "IV" | "V" = isOpioid(drug) ? "II" : "IV";

  return {
    drug,
    prescriber,
    pharmacy,
    schedule,
    quantity,
    daysSupply,
    lastFillDate: lastFill.toISOString().slice(0, 10),
    fills,
  };
}

/**
 * Rough MME/day estimate. The real CDC calculator is significantly
 * more nuanced; this is a heuristic for the simulated snapshot only
 * and must not be used for clinical dosing decisions.
 */
function estimateMmePerDay(rx: CuresPrescriptionRecord): number {
  const factor = OPIOID_MME_FACTORS.find((f) => f.pattern.test(rx.drug));
  if (!factor) return 0;
  // Quantity × strength assumption per pill is unknown in CURES rows,
  // so we approximate per-day as factor × (quantity / daysSupply).
  if (!rx.daysSupply) return 0;
  return Math.max(0, factor.multiplier * (rx.quantity / rx.daysSupply));
}

const OPIOID_MME_FACTORS: Array<{ pattern: RegExp; multiplier: number }> = [
  { pattern: /\bfentanyl\b/i, multiplier: 7.2 },
  { pattern: /\bmethadone\b/i, multiplier: 4.7 },
  { pattern: /\boxymorphone\b/i, multiplier: 3.0 },
  { pattern: /\bhydromorphone\b/i, multiplier: 4.0 },
  { pattern: /\boxycodone\b/i, multiplier: 1.5 },
  { pattern: /\bhydrocodone\b/i, multiplier: 1.0 },
  { pattern: /\bmorphine\b/i, multiplier: 1.0 },
  { pattern: /\bcodeine\b/i, multiplier: 0.15 },
  { pattern: /\btramadol\b/i, multiplier: 0.1 },
  { pattern: /\btapentadol\b/i, multiplier: 0.4 },
];

function buildSafetySummary({
  prescriptions,
  flags,
  totalMmePerDay,
}: {
  prescriptions: CuresPrescriptionRecord[];
  flags: PdmpFlag[];
  totalMmePerDay: number;
}): string {
  if (prescriptions.length === 0) {
    return "No active controlled-substance prescriptions on file in the CURES lookback window.";
  }
  const parts: string[] = [
    `${prescriptions.length} active controlled-substance prescription${prescriptions.length === 1 ? "" : "s"} on file.`,
  ];
  if (totalMmePerDay > 0) {
    parts.push(`Estimated total ${Math.round(totalMmePerDay)} MME/day across active opioid scripts.`);
    if (totalMmePerDay >= 50) {
      parts.push("MME exceeds CDC 50 MME/day threshold — co-prescribe naloxone and reassess.");
    }
  }
  if (flags.includes("multiple_prescribers")) {
    parts.push("Multiple prescribers identified — verify care coordination.");
  }
  if (flags.includes("multiple_pharmacies")) {
    parts.push("Multiple pharmacies identified — consider consolidation for adherence safety.");
  }
  if (flags.includes("controlled_substance_combo")) {
    parts.push("Opioid + benzodiazepine combination on record — high overdose risk.");
  }
  return parts.join(" ");
}

/**
 * Cheap, deterministic hash used to seed the demo CURES snapshot. We
 * specifically don't use crypto — we want stability across renders.
 */
function hashSeed(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h | 0);
}
