// SAFE: dead-export-allowed reason="Health maintenance scheduler for EMR-705"

/**
 * EMR-705 — Health maintenance + preventive-care scheduler.
 *
 * Note authoring emits structured health-maintenance items with due-dates
 * and referral targets — they populate the patient chart's preventive-care
 * surface as first-class rows (not free text inside the note).
 *
 * Item shape per ticket:
 *   { type, label, reason, dueBy, status, linkedProblem }
 *
 * Pure data + helpers; persistence lives at the call site.
 */

import { z } from "zod";

export type HealthMaintenanceType = "screening" | "referral" | "followup";
export type HealthMaintenanceStatus =
  | "due"
  | "ordered"
  | "completed"
  | "deferred";

/**
 * `dueBy` is either an ISO date string for a specific calendar date, or a
 * recurrence keyword ("annual", "every 3 months", "every 6 months") that the
 * scheduler turns into a concrete date relative to the last completion.
 */
export type DueBy =
  | { kind: "date"; iso: string }
  | { kind: "recurring"; cadence: RecurrenceCadence };

export type RecurrenceCadence =
  | "annual"
  | "every 3 months"
  | "every 6 months"
  | "every 2 years";

export const CADENCE_DAYS: Record<RecurrenceCadence, number> = {
  annual: 365,
  "every 3 months": 90,
  "every 6 months": 182,
  "every 2 years": 730,
};

const DueBySchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("date"), iso: z.string().min(10) }),
  z.object({
    kind: z.literal("recurring"),
    cadence: z.enum(["annual", "every 3 months", "every 6 months", "every 2 years"]),
  }),
]);

export const HealthMaintenanceItemSchema = z
  .object({
    type: z.enum(["screening", "referral", "followup"]),
    label: z.string().min(1).max(160),
    reason: z.string().min(1).max(400),
    dueBy: DueBySchema,
    status: z.enum(["due", "ordered", "completed", "deferred"]),
    /** ICD-10 code linking this item to a chart problem. */
    linkedProblem: z.string().min(1).max(10),
  })
  .strict();

export type HealthMaintenanceItem = z.infer<typeof HealthMaintenanceItemSchema>;

/**
 * Resolve `dueBy` to an absolute calendar date.
 *   - "date" → return that ISO date.
 *   - "recurring" → add the cadence to `lastCompletedAt` (or `now` if never
 *     completed), so the chart UI can sort and badge it.
 */
export function resolveDueDate(
  item: HealthMaintenanceItem,
  now: Date,
  lastCompletedAt: Date | null,
): Date {
  if (item.dueBy.kind === "date") return new Date(item.dueBy.iso);
  const base = lastCompletedAt ?? now;
  const days = CADENCE_DAYS[item.dueBy.cadence];
  return new Date(base.getTime() + days * 86_400_000);
}

/**
 * True when the resolved due-date is on or before `now` — drives the
 * "Due" badge on the patient header.
 */
export function isOverdue(
  item: HealthMaintenanceItem,
  now: Date,
  lastCompletedAt: Date | null,
): boolean {
  if (item.status === "completed" || item.status === "deferred") return false;
  return resolveDueDate(item, now, lastCompletedAt).getTime() <= now.getTime();
}

/**
 * Sort items the way the preventive-care surface wants them rendered:
 * overdue first, then upcoming by ascending date, with completed/deferred
 * sinking to the bottom.
 */
export function sortForPreventiveCareSurface(
  items: HealthMaintenanceItem[],
  now: Date,
  lastCompletedAt: Date | null,
): HealthMaintenanceItem[] {
  const STATUS_RANK: Record<HealthMaintenanceStatus, number> = {
    due: 0,
    ordered: 1,
    completed: 2,
    deferred: 3,
  };
  return items.slice().sort((a, b) => {
    const sr = STATUS_RANK[a.status] - STATUS_RANK[b.status];
    if (sr !== 0) return sr;
    return (
      resolveDueDate(a, now, lastCompletedAt).getTime() -
      resolveDueDate(b, now, lastCompletedAt).getTime()
    );
  });
}

// ---------------------------------------------------------------------------
// Maya Reyes fixture seed (EMR-705 acceptance).
// Five preventive-care items + three follow-up items.
// ---------------------------------------------------------------------------

export const MAYA_REYES_HM_FIXTURE: readonly HealthMaintenanceItem[] = [
  {
    type: "screening",
    label: "Urine Microalbumin/Cr ratio",
    reason: "Early diabetic nephropathy",
    dueBy: { kind: "recurring", cadence: "annual" },
    status: "due",
    linkedProblem: "E11.9",
  },
  {
    type: "screening",
    label: "Ophthalmology dilated comprehensive eye exam",
    reason: "Annual DM eye exam",
    dueBy: { kind: "date", iso: "2026-08-01" },
    status: "due",
    linkedProblem: "E11.9",
  },
  {
    type: "referral",
    label: "Podiatry — diabetic foot/nail care",
    reason: "New sensory loss",
    dueBy: { kind: "date", iso: "2026-06-01" },
    status: "ordered",
    linkedProblem: "E11.9",
  },
  {
    type: "screening",
    label: "Colonoscopy",
    reason: "Age-appropriate screening",
    dueBy: { kind: "date", iso: "2027-05-16" },
    status: "due",
    linkedProblem: "Z12.11",
  },
  {
    type: "screening",
    label: "Mammogram follow-up",
    reason: "Continued surveillance",
    dueBy: { kind: "date", iso: "2026-09-01" },
    status: "due",
    linkedProblem: "Z12.31",
  },
  {
    type: "followup",
    label: "Repeat BMP",
    reason: "Starting SGLT2 inhibitor",
    dueBy: { kind: "date", iso: "2026-06-13" },
    status: "due",
    linkedProblem: "E11.9",
  },
  {
    type: "followup",
    label: "Chronic care visit — recheck HbA1c",
    reason: "Glycemic control trending up",
    dueBy: { kind: "date", iso: "2026-08-16" },
    status: "due",
    linkedProblem: "E11.9",
  },
  {
    type: "followup",
    label: "Start PT for L shoulder",
    reason: "If pain persists after 1 month",
    dueBy: { kind: "date", iso: "2026-06-16" },
    status: "due",
    linkedProblem: "M25.512",
  },
];
