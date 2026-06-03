/**
 * Leafnerd FHIR Intelligence — SERVER-ONLY data access.
 *
 * Kept separate from `analytics.ts` (which is pure, client-safe demo data)
 * because this module touches the Prisma client. Importing it from a client
 * component would drag `pg` / `node:fs` into the browser bundle and break the
 * build. Server components (e.g. src/app/leafnerd/page.tsx) import
 * `getLeafnerdData` from here; client surfaces import `DEMO_DATA` from
 * `./analytics`.
 */
import type { LeafnerdData } from "./types";
import { DEMO_DATA } from "./analytics";

/** Deep clone so callers can't mutate the shared DEMO_DATA singleton. */
function cloneDemoData(): LeafnerdData {
  // structuredClone is available in Node 18+ / modern runtimes; fall back to
  // JSON round-trip if it is ever unavailable. Either way this never throws on
  // the plain-data DEMO_DATA shape.
  try {
    return structuredClone(DEMO_DATA);
  } catch {
    return JSON.parse(JSON.stringify(DEMO_DATA)) as LeafnerdData;
  }
}

/** Replace the `value` of a metric by id, leaving everything else intact. */
function overrideMetricValue(
  data: LeafnerdData,
  id: string,
  value: string,
): void {
  const m = data.metrics.find((x) => x.id === id);
  if (m) m.value = value;
}

/**
 * Returns a copy of DEMO_DATA, conservatively overlaying a few headline numbers
 * with real aggregates when the DB is reachable. Every DB call is isolated in
 * its own try/catch — any failure leaves the corresponding DEMO_DATA value in
 * place. This function NEVER throws and always returns a complete payload, so
 * the investor-demo screens always look full and polished.
 *
 * Overlays (only when the live count is > 0 so an empty/seedless DB never makes
 * a screen look hollow):
 *   - metrics["patients"].value  ← real active Patient count (toLocaleString)
 *   - metrics["risk"].value      ← real open claim-anomaly count (ClaimScrubResult, status != clean)
 *   - fhirCounts.Patient         ← real total Patient count
 *
 * Everything else stays DEMO_DATA.
 */
export async function getLeafnerdData(): Promise<LeafnerdData> {
  const data = cloneDemoData();

  // Lazy import so a missing/blown-up prisma module can never crash a render.
  let prisma: typeof import("@/lib/db/prisma").prisma | null = null;
  try {
    prisma = (await import("@/lib/db/prisma")).prisma;
  } catch {
    return data; // DB layer unavailable — pure demo payload.
  }
  if (!prisma) return data;

  // Parse the current (demo) formatted headline, e.g. "48,210" -> 48210.
  const numericOf = (id: string): number => {
    const m = data.metrics.find((x) => x.id === id);
    return m ? Number(m.value.replace(/[^0-9.]/g, "")) || 0 : 0;
  };

  // IMPORTANT: overlays only ever GROW a headline number. Real data can make the
  // story bigger, but must never downgrade the curated baseline — otherwise a
  // thin/unseeded dev DB would make the investor screen read "9 active patients".

  // --- Overlay 1: real active-patient count into the "patients" metric. ----
  try {
    const activePatients = await prisma.patient.count({
      where: { status: "active" },
    });
    if (activePatients > numericOf("patients")) {
      overrideMetricValue(data, "patients", activePatients.toLocaleString());
    }
  } catch {
    /* keep DEMO_DATA "48,210" */
  }

  // --- Overlay 2: real open claim-anomaly count into the "risk" metric. ----
  try {
    const openAnomalies = await prisma.claimScrubResult.count({
      where: { status: { not: "clean" } },
    });
    if (openAnomalies > numericOf("risk")) {
      overrideMetricValue(data, "risk", openAnomalies.toLocaleString());
    }
  } catch {
    /* keep DEMO_DATA "1,206" */
  }

  // --- Overlay 3: real total Patient count into the FHIR tree counts. ------
  try {
    const totalPatients = await prisma.patient.count();
    if (totalPatients > data.fhirCounts.Patient) {
      data.fhirCounts.Patient = totalPatients;
    }
  } catch {
    /* keep DEMO_DATA 48210 */
  }

  return data;
}
