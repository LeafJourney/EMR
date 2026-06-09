# Golden Visit E2E Harness Design

## Purpose

Build a deterministic Golden Visit harness for `EMR-1001` that proves the critical same-day patient journey cannot regress silently.

The harness must verify one synthetic visit from appointment booking through kiosk check-in, queue/rooming, physician start, note finalization, and billing/closeout evidence. It should fail on broken workflow continuity, duplicate encounters, lost handoff data, or missing closeout outputs.

## Problem

LeafJourney already has focused unit and integration tests for individual workflow pieces:

- appointment booking guardrails
- kiosk check-in security and state movement
- queue state transitions
- active encounter selection
- physician start visit reuse
- note finalization idempotency
- billing agent/unit behavior

Those tests are valuable but fragmented. They do not yet provide one release gate that says: "a patient who booked today can move through the whole clinic visit without the system losing continuity."

## Design Choice

Use a layered harness:

1. A deterministic integration harness owns the hard workflow assertions.
2. One focused Playwright smoke spec verifies the major UI surfaces remain reachable and clickable.
3. CI runs the deterministic harness by default; browser smoke can run when an authenticated local/staging environment is available.

This avoids a brittle browser-only test while still catching broken user-facing routes.

## Scope

In scope:

- Create a Golden Visit test data fixture for one organization, one patient, one provider, one kiosk/front-desk user, one MA/extender user, and one physician user.
- Exercise the visit spine from appointment booking to final closeout.
- Assert encounter continuity at every phase.
- Assert the rooming handoff survives physician start.
- Assert finalization is idempotent.
- Assert billing/closeout returns either a generated result or explicit blocker state.
- Produce a single obvious test command for the release gate.

Out of scope for this first harness:

- Full production Clerk login coverage for every role.
- Full browser-only patient portal/kiosk/ops/clinician/billing journey.
- Real clearinghouse submission.
- Real dictation audio transcription.
- Production data mutation.

## Architecture

### Golden Visit Fixture

Add a small test fixture module that creates the synthetic visit state in memory or against mocked Prisma doubles, matching existing Vitest patterns in the repo.

The fixture should expose stable IDs and helpers:

- `orgId`
- `patientId`
- `providerId`
- `frontDeskUser`
- `maUser`
- `physicianUser`
- `appointmentId`
- `encounterId`
- date/time helpers pinned to a fixed clock

The fixture should keep the test deterministic and avoid depending on current wall-clock time except where the code under test requires `new Date()`. Where possible, the harness should inject a fixed `now`.

### Golden Visit Driver

Add a focused driver that performs the journey in named phases:

1. `bookAppointment`
2. `materializeEncounter`
3. `kioskCheckIn`
4. `moveToRooming`
5. `saveRoomingHandoff`
6. `roomPatient`
7. `startPhysicianVisit`
8. `saveAndFinalizeDocumentation`
9. `assertBillingCloseout`

Each phase should return the current encounter snapshot and fail with a clear message if the expected state is not present.

### Deterministic Integration Test

Add a Vitest file for the Golden Visit harness. It should assert:

- booking produces or links one appointment-backed encounter
- kiosk check-in moves the same encounter to `checked_in`
- queue movement advances the same encounter to `rooming` and `roomed`
- rooming handoff is preserved in `briefingContext.rooming`
- physician start reuses the roomed encounter instead of creating another one
- repeat physician start does not create a duplicate
- finalizing the note completes the same encounter
- repeat finalization does not dispatch duplicate completion work
- billing/closeout evidence is present, or a structured blocker is returned

The duplicate encounter check is mandatory after every major phase.

### Playwright Smoke Spec

Add one browser smoke spec only after the deterministic harness is in place.

The smoke spec should not carry the hard business assertions. It should verify:

- `/portal` or scheduling surface loads in an authenticated test context when credentials/storage state are available
- `/kiosk` surface loads
- `/ops/queue` loads
- `/clinic/patients/[id]` or the note route loads for the synthetic patient when the environment provides valid auth
- no page shows the production server-component error card

If auth is unavailable, the smoke spec should skip with an explicit message rather than failing the release gate for missing credentials.

## Data Flow

The harness should prove this continuity:

`Appointment.confirmed`
-> linked `Encounter.scheduled`
-> `Encounter.checked_in`
-> `Encounter.rooming`
-> `Encounter.roomed`
-> `Encounter.in_progress`
-> `Encounter.complete`
-> closeout/billing evidence

The same encounter ID must remain attached to the journey unless the test is deliberately exercising walk-in creation. The first harness should use a scheduled appointment, not a walk-in.

## Error Handling

Failures should be specific. The test should distinguish:

- missing appointment-backed encounter
- kiosk could not find today's encounter
- invalid queue transition
- duplicate active encounter
- lost rooming handoff
- physician start created a new encounter
- finalization was not idempotent
- billing/closeout evidence missing

The Playwright smoke spec should fail on user-visible broken pages, server-component error cards, and route-level crashes.

## CI And Release Gate

The primary release gate should be a targeted Vitest command for the deterministic harness plus existing health checks:

- `npm test -- <golden-visit-test-file>`
- `npm run typecheck`
- existing lint/build checks when the branch is ready for PR

The Playwright smoke spec should be configured so CI can run it only when the required auth/storage-state environment is present.

## Acceptance Criteria

- A single Golden Visit integration test walks the same synthetic visit from booking to closeout.
- The test fails if any phase creates a duplicate active encounter.
- The test fails if the MA handoff is unavailable to physician start.
- The test fails if note finalization is not idempotent.
- The test fails if billing/closeout has neither generated evidence nor an explicit structured blocker.
- A browser smoke spec verifies core surfaces load without route crashes when auth is available.
- The implementation has a clear command that can be added to CI/CD as a quarantine/release gate.

## Implementation Notes

Follow existing local patterns:

- `src/lib/domain/visit-journey.integration.test.ts` for in-memory encounter mutation.
- `src/app/(operator)/ops/queue/actions.test.ts` for queue action mocking.
- `src/app/api/mobile/kiosk/check-in/route.test.ts` for kiosk check-in behavior.
- `src/app/(clinician)/clinic/patients/[id]/actions.start-visit.test.ts` for physician start behavior.
- `src/app/(clinician)/clinic/patients/[id]/notes/[noteId]/actions.finalize-idempotent.test.ts` for finalization behavior.

Avoid broad rewrites. The first pass should add the harness and only change production code if the harness exposes a real continuity bug.
