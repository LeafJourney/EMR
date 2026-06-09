// EMR-1084 (Back-Office Operations Audit §5) — the calendar-block placeholder
// patient must never surface as a person.
//
// `createSpecialBlock` (src/app/(clinician)/clinic/schedule/actions.ts) anchors
// vacation / meeting / do_not_book holds on a synthetic Patient row named
// "System CalendarBlock" (no linked User). It exists only so a block can own an
// Appointment. It is NOT a real patient and must be filtered out of every
// patient roster and search surface.
//
// This module is the single source of truth for that identity so the create
// site, the Prisma exclusion, and any in-memory predicate can't drift apart.

/** Name fields that identify the synthetic calendar-block placeholder patient. */
export const CALENDAR_BLOCK_PATIENT = {
  firstName: "System",
  lastName: "CalendarBlock",
} as const;

/**
 * Prisma `where` fragment that excludes the placeholder. Spread it into a
 * patient query's `where`:
 *
 *   where: { organizationId, deletedAt: null, ...EXCLUDE_CALENDAR_BLOCK_PATIENT }
 *
 * `NOT: { firstName, lastName }` excludes only rows matching BOTH fields, so a
 * real patient who happens to share one of the names is unaffected. Safe to
 * spread into any `where` that does not already define a top-level `NOT`.
 */
export const EXCLUDE_CALENDAR_BLOCK_PATIENT = {
  NOT: {
    firstName: CALENDAR_BLOCK_PATIENT.firstName,
    lastName: CALENDAR_BLOCK_PATIENT.lastName,
  },
} as const;

/** In-memory predicate for filtering already-loaded rows. */
export function isCalendarBlockPatient(p: {
  firstName?: string | null;
  lastName?: string | null;
}): boolean {
  return (
    p.firstName === CALENDAR_BLOCK_PATIENT.firstName &&
    p.lastName === CALENDAR_BLOCK_PATIENT.lastName
  );
}
