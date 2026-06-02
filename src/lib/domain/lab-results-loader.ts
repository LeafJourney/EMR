/**
 * Patient-scoped lab loader (EMR-806).
 *
 * The patient portal previously rendered `generateDemoLabPanels()` — the same
 * fabricated panels for every authenticated patient. That is a demo-PHI
 * fallback: it shows lab data that does not belong to the signed-in patient
 * and implies a successful data load when none happened. This loader reads the
 * real `LabResult` rows for one patient. The pure row→panel mapping lives in
 * `lab-results.ts` (`mapLabResultRow`) and is unit tested without a database.
 */

import { prisma } from "@/lib/db/prisma";
import { mapLabResultRow, type LabPanel } from "./lab-results";

/** Load a single patient's real lab panels, newest first. */
export async function getPatientLabPanels(
  patientId: string,
): Promise<LabPanel[]> {
  const rows = await prisma.labResult.findMany({
    where: { patientId },
    orderBy: { receivedAt: "desc" },
    select: {
      id: true,
      panelName: true,
      receivedAt: true,
      results: true,
      signedAt: true,
    },
  });
  return rows.map(mapLabResultRow);
}
