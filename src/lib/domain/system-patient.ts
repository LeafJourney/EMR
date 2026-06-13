// The reserved internal Patient record that anchors calendar blocks (provider
// time-off, meetings, do-not-book windows). It is NOT a real patient: it must
// never surface in clinical patient lists (roster, search, pickers) or be
// selectable / bulk-actionable.
//
// It is identified by the reserved name pair below — the same convention the
// schedule block writer uses. Centralized here so the exclusion can't drift
// between query sites. That drift is exactly what let the record leak into the
// roster's first server render while search/refresh hid it (fixed 2026-06-13).

export const SYSTEM_PATIENT_NAME = { firstName: "System", lastName: "CalendarBlock" };

/** Prisma `where` fragment that excludes the reserved system pseudo-patient. */
export const EXCLUDE_SYSTEM_PATIENT = {
  NOT: { firstName: SYSTEM_PATIENT_NAME.firstName, lastName: SYSTEM_PATIENT_NAME.lastName },
};
