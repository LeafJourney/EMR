/**
 * Server-side serializers that flatten Prisma DosingRegimen / DoseLog rows
 * into the plain shapes the Rx tab client component consumes. Kept out of
 * the client file so it can be reused by the regimens deep page (EMR-878)
 * without dragging Prisma into the bundle.
 */

import { mapRouteToMethod } from "@/lib/clinical/methods-of-administration";
import type { RxRegimen, RxDoseLog } from "./rx-tab";

function formatRatio(thc: number | null, cbd: number | null): string | null {
  if (thc == null || cbd == null || (thc === 0 && cbd === 0)) return null;
  if (cbd === 0) return `${thc}:0`;
  if (thc === 0) return `0:${cbd}`;
  const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));
  const d = gcd(Math.round(thc * 10), Math.round(cbd * 10)) || 1;
  return `${Math.round((thc * 10) / d)}:${Math.round((cbd * 10) / d)}`;
}

export function serializeRegimen(r: any): RxRegimen {
  const product = r.product ?? null;
  const ratio =
    product?.thcCbdRatio ??
    formatRatio(r.calculatedThcMgPerDose ?? null, r.calculatedCbdMgPerDose ?? null);
  const sig =
    r.timingInstructions?.trim() ||
    `${r.volumePerDose} ${r.volumeUnit}, ${r.frequencyPerDay}× daily`;
  return {
    id: r.id,
    productName: product?.name ?? "Unknown product",
    brand: product?.brand ?? null,
    productType: product?.productType ?? null,
    route: product?.route ?? null,
    active: Boolean(r.active),
    isControlled: (product?.thcConcentration ?? 0) > 0,
    ratioLabel: ratio,
    doseLabel: `${r.volumePerDose} ${r.volumeUnit}`,
    sig,
    thcMgPerDose: r.calculatedThcMgPerDose ?? null,
    cbdMgPerDose: r.calculatedCbdMgPerDose ?? null,
    thcMgPerDay: r.calculatedThcMgPerDay ?? null,
    cbdMgPerDay: r.calculatedCbdMgPerDay ?? null,
    frequencyPerDay: r.frequencyPerDay ?? 1,
    prescribedDate: r.startDate ? new Date(r.startDate).toISOString() : null,
    renewedDate: r.updatedAt ? new Date(r.updatedAt).toISOString() : null,
    endDate: r.endDate ? new Date(r.endDate).toISOString() : null,
    methodKey: mapRouteToMethod(product?.route),
    patientInstructions: r.patientInstructions ?? null,
    clinicianNotes: r.clinicianNotes ?? null,
    clinicianNoteAt: r.updatedAt ? new Date(r.updatedAt).toISOString() : null,
  };
}

export function serializeDoseLog(log: any): RxDoseLog {
  return {
    id: log.id,
    productName: log.regimen?.product?.name ?? "Unknown",
    loggedAt: log.loggedAt ? new Date(log.loggedAt).toISOString() : new Date().toISOString(),
    volume: `${log.actualVolume} ${log.volumeUnit}`,
    thcMg: log.estimatedThcMg ?? null,
    cbdMg: log.estimatedCbdMg ?? null,
    note: log.note ?? null,
  };
}
