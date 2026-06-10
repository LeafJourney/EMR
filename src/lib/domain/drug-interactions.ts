import interactionData from "../../../data/drug-interactions.json";

export type Severity = "red" | "yellow" | "green";

export interface DrugInteraction {
  drug: string;
  cannabinoid: string;
  severity: Severity;
  mechanism: string;
  recommendation: string;
  /** Raw reference strings from the database (e.g. "PMID: 12345678"). */
  references: string[];
}

interface InteractionEntry {
  drug: string;
  aliases: string[];
  cannabinoid: string;
  severity: string;
  mechanism: string;
  recommendation: string;
  references: string[];
}

const SEVERITY_ORDER: Record<Severity, number> = {
  red: 0,
  yellow: 1,
  green: 2,
};

/**
 * Check a patient's medication list against a set of cannabinoids
 * (derived from their cannabis products) to find all known interactions.
 *
 * Returns results sorted by severity: red first, then yellow, then green.
 */
export function checkInteractions(
  medications: string[],
  cannabinoids: string[]
): DrugInteraction[] {
  const results: DrugInteraction[] = [];
  const normalizedMeds = medications.map((m) => m.toLowerCase().trim());
  const normalizedCannabinoids = cannabinoids.map((c) => c.toUpperCase().trim());

  for (const entry of interactionData.interactions as InteractionEntry[]) {
    // Check if this interaction's cannabinoid is present in the patient's regimen
    if (!normalizedCannabinoids.includes(entry.cannabinoid.toUpperCase())) {
      continue;
    }

    // Check if any of the patient's medications match this entry
    const drugNames = [entry.drug, ...entry.aliases].map((n) =>
      n.toLowerCase().trim()
    );

    for (const med of normalizedMeds) {
      const matched = drugNames.some(
        (drugName) => med.includes(drugName) || drugName.includes(med)
      );

      if (matched) {
        results.push({
          drug: entry.drug,
          cannabinoid: entry.cannabinoid,
          severity: entry.severity as Severity,
          mechanism: entry.mechanism,
          recommendation: entry.recommendation,
          references: entry.references ?? [],
        });
        break; // Avoid duplicate matches for same med against same entry
      }
    }
  }

  // Deduplicate — same drug + same cannabinoid should only appear once
  const seen = new Set<string>();
  const deduplicated = results.filter((r) => {
    const key = `${r.drug.toLowerCase()}|${r.cannabinoid.toUpperCase()}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  // Sort by severity: red → yellow → green
  return deduplicated.sort(
    (a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]
  );
}

const KNOWN_CANNABINOIDS = ["THC", "CBD", "CBN", "CBG"] as const;

/**
 * Best-effort cannabinoid profile for a custom / free-text product that has no
 * structured concentration data. Scans the product name (and any explicit
 * "open to" cannabinoid hints) for cannabinoid tokens, treats a ratio like
 * "1:1" as implying THC + CBD, and falls back to the THC + CBD pair a cannabis
 * product almost always carries — so interaction screening still runs instead
 * of silently passing. (WS-C task 2 / audit minor #9.)
 */
export function inferCannabinoidsFromName(
  name: string,
  hints: ReadonlyArray<string> = [],
): string[] {
  const found = new Set<string>();
  const haystack = (name ?? "").toUpperCase();
  for (const c of KNOWN_CANNABINOIDS) {
    if (haystack.includes(c)) found.add(c);
  }
  for (const h of hints) {
    const u = h.toUpperCase().trim();
    if ((KNOWN_CANNABINOIDS as readonly string[]).includes(u)) found.add(u);
  }
  // A ratio like "1:1" or "20:1" implies both THC and CBD are present.
  if (/\d+\s*:\s*\d+/.test(name ?? "")) {
    found.add("THC");
    found.add("CBD");
  }
  if (found.size === 0) {
    found.add("THC");
    found.add("CBD");
  }
  return Array.from(found);
}

/** Return the full interaction database sorted by severity (red → yellow → green). */
export function getAllInteractions(): DrugInteraction[] {
  return (interactionData.interactions as InteractionEntry[])
    .map((e) => ({
      drug: e.drug,
      cannabinoid: e.cannabinoid,
      severity: e.severity as Severity,
      mechanism: e.mechanism,
      recommendation: e.recommendation,
      references: e.references ?? [],
    }))
    .sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]);
}

/** Human-readable label for each severity level. */
export function getSeverityLabel(severity: Severity): string {
  switch (severity) {
    case "red":
      return "Contraindicated";
    case "yellow":
      return "Use with caution";
    case "green":
      return "No known interaction";
  }
}

/** CSS color value for the stoplight dot. */
export function getSeverityColor(severity: Severity): string {
  switch (severity) {
    case "red":
      return "var(--danger)";
    case "yellow":
      return "var(--highlight)";
    case "green":
      return "var(--success)";
  }
}
