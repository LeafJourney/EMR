# Core Visit Spine Hardening Design

## Goal

Make the same-day visit workflow reliable from pre-visit reminders through front-desk check-in, patient completion, MA rooming, physician visit start, and visit completion.

The weekend goal is not a fully polished practice-management suite. The goal is a durable workflow spine that prevents the failures seen at Go Live: missing check-in flow, unclear readiness, no reliable rooming handoff, duplicate encounters, and non-idempotent visit completion.

## Current Failure Pattern

The app has two disconnected scheduling concepts:

- `Appointment` drives patient scheduling and reminders.
- `Encounter` drives the clinical chart and today's queue.

The queue already displays richer operational columns, but those columns are synthetic. `EncounterStatus` currently has only `scheduled`, `in_progress`, `complete`, and `cancelled`, so check-in, rooming, roomed, and active physician visit are collapsed into `in_progress`.

This causes three high-risk behaviors:

- A patient can have an appointment without appearing in the clinical queue.
- Kiosk/front-desk check-in jumps directly to `in_progress`, which looks like the physician is already with the patient.
- Physician start can create a new same-day encounter instead of claiming the one the staff already prepared.

## Design Direction

Use `Encounter` as the same-day visit spine. Keep `Appointment` as scheduling/reminder history, linked to the encounter when available.

The spine states are:

1. `scheduled`
2. `checked_in`
3. `info_incomplete`
4. `ready`
5. `rooming`
6. `roomed`
7. `in_visit`
8. `wrap_up`
9. `complete`
10. `cancelled`
11. `no_show`

Keep legacy `in_progress` temporarily during migration. Do not remove it in the first implementation slice because existing code and seed data still reference it.

## Weekend Scope

### Core Visit State

Add a central visit-state helper that owns allowed transitions and timestamp side effects. The helper should be the only place that decides whether a state move is valid.

Required first transitions:

- `scheduled` or legacy `in_progress` to `checked_in`, then derive `ready` or `info_incomplete`
- `ready`, `roomed`, or `checked_in` to `in_visit`
- `in_visit` or `wrap_up` to `complete`
- `scheduled`, `checked_in`, `ready`, `rooming`, or `roomed` to `cancelled`
- `scheduled` or `checked_in` to `no_show`

The first slice should avoid over-modeling. Add timestamps needed for operational reliability: `checkedInAt`, `roomingStartedAt`, `roomedAt`, `wrapUpAt`, `cancelledAt`, and `noShowAt`.

### Pre-Visit Reminders

Patients should be nudged before arrival to complete missing required items through the portal.

Reminder cadence:

- 7 days before the appointment
- 2 days before the appointment
- Morning of the appointment

Reminder channels:

- Email now, where infrastructure exists.
- SMS only if the existing SMS reminder path supports it safely.
- Push notification later when the mobile app exists.

Reminder copy must not include PHI. It should say only that pre-visit items are ready and link to the portal.

### Front-Desk Check-In

Front desk must be able to:

- Locate today's appointment/encounter.
- Verify patient identity in person.
- Mark the patient checked in.
- See required missing items.
- Generate a day-of QR rescue link if the patient is incomplete or cannot handle portal login.
- Avoid moving the patient to rooming until the visit is ready or an authorized staff override is recorded.

### QR Rescue

The QR path is a narrow check-in completion session, not a replacement portal.

Rules:

- Token is appointment-scoped and patient-scoped.
- Token is short-lived.
- No PHI appears in the QR URL.
- Token is signed, or stored only as a hash if persisted.
- Redemption verifies expiry, appointment window, appointment-patient relationship, and status.
- Require DOB + SMS code when a phone is on file.
- Allow DOB + last name as front-desk fallback.
- Full chart, records, labs, and messages still require portal login.
- Audit token generation, views, redemption, expired attempts, failed verification, submissions, and staff overrides.

### MA Rooming

Weekend implementation can store rooming handoff data in `Encounter.briefingContext.rooming` to avoid a broad clinical-observation migration.

The rooming envelope should support:

- room number
- readiness flags
- handoff note
- vitals snapshot
- roomed timestamp
- rooming staff user id

This is intentionally temporary. Vitals should graduate to structured `Observation` or `VitalSign` storage before quality measures, FHIR export, MIPS, or longitudinal trending depend on them.

### Physician Workflow Boundary

The physician workflow should be owned by the separate Claude Code swarm. Its contract is:

- Start visit must claim the existing same-day roomed/ready/checked-in/scheduled encounter before creating any new encounter.
- Start visit must preserve rooming and briefing context.
- `startVisitWithBriefing` must enforce the same permissions and chart privacy checks as `startVisit`.
- Note finalization must be idempotent.
- `note.finalized` dispatches only when the note transitions into finalized.
- `encounter.completed` dispatches only when the encounter transitions into complete.

## Data Model

Minimal schema changes:

- Extend `EncounterStatus` with new spine states while preserving `in_progress`.
- Add nullable `Encounter.appointmentId` with a unique relation to `Appointment`.
- Add nullable operational timestamps:
  - `checkedInAt`
  - `roomingStartedAt`
  - `roomedAt`
  - `wrapUpAt`
  - `cancelledAt`
  - `noShowAt`
- Add `Appointment.encounter` back relation.
- Add an index for today's queue by organization, status, and scheduled time.

## State Ownership

Create `src/lib/domain/visit-state.ts`.

This helper owns:

- canonical visit states
- legacy state compatibility
- allowed transitions
- timestamp updates
- no-op/idempotent transition behavior
- optional metadata merge helpers for `briefingContext`

External swarms should call this helper when available and must not create a competing state machine.

## Staff UI Ownership

Codex swarm owns:

- Prisma visit-spine schema and migration.
- `src/lib/domain/visit-state.ts`.
- queue projection in `src/lib/domain/queue-board.ts`.
- operator queue page/actions under `src/app/(operator)/ops/queue/`.
- kiosk/front-desk check-in route behavior.
- rooming handoff envelope and front-desk/MA queue controls.

Claude Code swarm owns:

- physician start visit.
- briefing start path.
- note finalization idempotency.
- physician-visible handoff/readiness surface.

Gemini storm owns:

- DB-to-gate previsit readiness mapper.
- reminder cadence and non-PHI reminder copy.
- QR token helper and redemption security tests.
- QR rescue route/page if time allows.

## Testing Strategy

Tests must be written before production changes.

Required coverage:

- visit-state allowed and rejected transitions
- timestamp side effects
- idempotent no-op transitions
- queue projection for new statuses and legacy `in_progress`
- kiosk/check-in mutation verifies encounter-patient relationship
- pre-visit reminder sends only when incomplete and does not include PHI
- QR token validation rejects expired, mismatched, or tampered tokens
- physician start claims existing encounter instead of creating duplicate
- note finalization does not double-dispatch

## Risks

- `in_progress` is overloaded in existing data; migration cannot infer exact real-world phase for old rows.
- `briefingContext` is becoming a temporary operational envelope. Keep its structure explicit and graduate persistent clinical facts later.
- Appointment/Encounter drift will continue unless new appointment creation also creates or links an encounter.
- External swarms may overlap on physician start or QR route code. File ownership boundaries above are mandatory.

## Acceptance Criteria

- Today's queue shows real same-day state rather than collapsing everything into `in_visit`.
- Front desk can mark arrival and see incomplete versus ready.
- Patient can be nudged before arrival and rescued day-of with QR without full portal-login friction.
- MA can record a minimum rooming handoff.
- Physician start uses the prepared encounter.
- Completing the visit triggers downstream workflows once.
- All changed behavior has targeted tests.
