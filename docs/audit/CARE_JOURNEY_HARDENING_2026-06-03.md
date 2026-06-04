# Core Care-Journey Hardening — 2026-06-03

Overnight hardening of the end-to-end same-day patient care workflow.
Branch: `worktree-care-journey-hardening` (isolated git worktree).
Synthetic data only; no production secrets, claims, emails/SMS, or prod mutations.

---

## 1. Workflow map

| # | Step | Surface (route / module) | Server action / fn | State written |
|---|------|--------------------------|--------------------|---------------|
| 1 | Patient books | `/(patient)/portal/schedule` + `booking-calendar.tsx` | `bookAppointment` (`portal/schedule/actions.ts`) | `Appointment(status=requested)` |
| 2 | Check-in (kiosk/QR rescue) | `/kiosk/(console)`, `/kiosk/lobby/[token]`, `src/lib/check-in/*` | `issueHandoffToken`→OTP→`createKioskLobbySession`; `POST /api/mobile/kiosk/check-in`; queue `moveQueueEncounter` | `Encounter.checkedInAt`, `status=checked_in`; staged `KioskLobbySubmission` |
| 3 | Front-desk readiness | `/clinic` (`UpcomingVisitsMissingInfo`), `/ops/queue` | `getAppointmentReadiness` / `evaluatePrevisitReadiness`, `intake-gate` | derived (PHI-free requirement ids) |
| 4 | MA rooming + vitals | `/ops/queue` (`queue-board.tsx`), staff objective editor | `moveQueueEncounter` (rooming→roomed), `saveRoomingHandoff`, `saveObjectiveDocumentation` | `roomingStartedAt`, `roomedAt`, `briefingContext.rooming`, Note `findings` block |
| 5 | Physician Start Visit | `/clinic/patients/[id]` | `startVisit` / `startVisitWithBriefing` → `selectActiveVisitEncounter` + `advanceVisitState` + `assignVisitProvider` | reuse encounter → `status=in_progress`, `startedAt`, `providerId`/`renderingProviderId` |
| 6 | Dictation / documentation | `/clinic/patients/[id]/notes/[noteId]` (`note-editor.tsx`) | `routeDictationToBlocks`, `saveNoteBlocks` | `Note.blocks` (APSO/SOAP) |
| 7 | Finalize / sign / co-sign | same | `finalizeNote` / `saveAndFinalizeNote` (mid-levels → `pending_cosign`) | `Note.status=finalized`, `finalizedAt`; `Encounter.status=complete`, `completedAt`, `chartingCompletedAt` |
| 8 | Billing / charge capture | coding agent + visit completion | `note.finalized` → Coding Readiness Agent → `CodingSuggestion`/`Charge`; `releaseVisitCompletion` (gated on finalized) | `CodingSuggestion`, `Charge(pending)`, `VisitCompletion` |

**Encounter state machine** (12-value `EncounterStatus`):
`scheduled → checked_in → info_incomplete/ready → rooming → roomed → in_progress (in_visit) → (wrap_up) → complete`; terminal: `complete | cancelled | no_show`.
Queue board (`/ops/queue`, kiosk) persists the intermediate flow states via `computeQueueTransition`; the physician spine (`advanceVisitState`) maps `in_visit → in_progress` and `complete`.

---

## 2. Step-by-step status

| Step / required scenario | Status | Evidence |
|---|---|---|
| Patient books through portal | **fixed** | `bookAppointment` now guards conflicts/past/invalid + preserves modality; `actions.book.test.ts` |
| Same patient checks in on appt day | **⚠ gap** | check-in transition works (`api/mobile/kiosk/check-in`, `kioskCheckIn`, `computeQueueTransition`) **but only if an Encounter already exists** — booked appointments are never materialized into encounters (see Risk #1), so a booked-but-no-encounter patient hits "No appointment found" |
| Missing required intake detected/surfaced | pass | `intake-gate` + `previsit-readiness` (existing suites) |
| QR/OTP rescue (no portal password for older adult) | pass | `kiosk-handoff` → OTP → lobby session; existing `check-in/*` suites |
| Front desk marks readiness / sees blockers | pass | `getAppointmentReadiness`, `MissingRequirement[]` deep links |
| MA enters vitals + rooms patient | pass | `saveObjectiveDocumentation` (findings block, blocked once signed), `saveRoomingHandoff` |
| Roomed patient appears for physician | **fixed** | was invisible (status filter bug); `visit-state.select-active.test.ts`, journey test |
| Start Visit reuses correct same-day encounter | **fixed** | `selectActiveVisitEncounter` non-terminal set; start-visit + journey tests |
| No duplicate active encounters (repeat click/refresh) | **fixed** | reuse + idempotent advance; journey test (repeat-click, walk-in) |
| Provider/rendering attribution correct | pass | `assignVisitProvider`; existing start-visit attribution tests |
| Dictation lands in intended section | pass | `routeDictationToBlocks`; `dictation-routing.test.ts` |
| Docs edited/saved/finalized/reopened safely | **fixed** | `saveNoteBlocks` now blocks edits to signed notes; `actions.save-note-lock.test.ts` |
| Finalization idempotent | pass | `finalizeNote` short-circuits; `actions.finalize-idempotent.test.ts` |
| Billing only after clinical complete | pass | coding agent on `note.finalized`; `releaseVisitCompletion` gated on finalized + unique-noteId idempotency |
| Completed visit leaves queues correctly | pass (covered) | terminal excluded from `selectActiveVisitEncounter`; `mapEncounterStatusToQueueStatus`→`completed`; journey test |

---

## 3. Blockers found & fixed (with regression tests)

### A. Duplicate encounter + orphaned MA handoff at Start Visit  — **HIGH**
`selectActiveVisitEncounter` filtered `status IN (scheduled, in_progress)` only, but the
front-desk queue/kiosk persist `checked_in/ready/rooming/roomed/wrap_up` onto the row.
A checked-in/roomed patient was invisible to the physician → Start Visit minted a
**second** encounter and orphaned the rooming vitals + handoff stored in the first
encounter's `briefingContext`. (The kiosk console had its own work-around set,
`KIOSK_VISIBLE_STATUSES`; the physician path never got the fix.) Same drift in the
telehealth page (`["scheduled","in_progress"]`) → a roomed video visit fell back to a
bogus `patientId`-as-`encounterId` room URL.
- Fix: `ACTIVE_VISIT_STATUSES` = all non-terminal statuses + `TERMINAL_VISIT_STATUSES`;
  used in `selectActiveVisitEncounter` and telehealth (now org-scoped).
- Tests: `visit-state.select-active.test.ts` (drives the real WHERE clause — fails on
  old filter), `actions.start-visit.test.ts` (+queue-state reuse / terminal-create),
  `visit-journey.integration.test.ts`.
- Commit `4d922df3`.

### B. Portal double-booking / silent failure  — **MED**
`bookAppointment` created an Appointment unconditionally: no conflict guard (reschedule
had one), no future/validity check, silently collapsed `phone`→`video`, and returned a
bare `{id}` so the UI showed a fake "booked" even on (now-possible) failure.
- Fix: overlap conflict guard, past/invalid rejection, modality preserved, discriminated
  `{ok}` result; `booking-calendar.tsx` surfaces the error.
- Tests: `actions.book.test.ts`. Commit `0304dda3`.

### C. Signed note silently mutable  — **MED**
`saveNoteBlocks` had no status guard, so a `finalized`/`amended` (signed legal) note could
be rewritten via a direct action call with no audit trail (the editor hides Save, but the
server didn't enforce it; `saveObjectiveDocumentation` already did).
- Fix: reject block saves on finalized/amended notes.
- Tests: `actions.save-note-lock.test.ts`. Commit `886e495b`.

### D. Two more duplicate-encounter siblings (round 2)  — **MED**
An audit of EVERY `prisma.encounter.find*` selector for the same status-drift class found
two more find-or-create paths that missed queue-state encounters:
- `startVoiceEncounter` (`voice-chart/actions.ts`) matched `status:"in_progress"` only →
  voice charting on a checked-in/roomed patient minted a duplicate. Now uses
  `selectActiveVisitEncounter`.
- `startOverlayTelehealthVisit` (`communications/actions.ts`) filtered
  `["scheduled","in_progress"]` → broadened to `ACTIVE_VISIT_STATUSES`.
- Tests: `actions.start-voice.test.ts`, `actions.overlay-telehealth.test.ts`. Commit `8a0f3619`.
- (The `/ops/queue` board query was audited and is correct — no status filter, loads the full day.)

### E. Booking trusted an arbitrary providerId (round 2)  — **MED**
`bookAppointment` never validated `providerId`, so the portal could create a dangling
appointment against a missing, inactive, or cross-org provider.
- Fix: look the provider up by id + patient's `organizationId` + `active` before booking.
- Tests: extended `actions.book.test.ts`. Commit `61735a21`.

---

## 4. Residual risks (do NOT mark fully shipped without these)

0. **★ Appointments are never materialized into Encounters (SYSTEMIC — needs a product decision).**
   `Encounter.appointmentId` is `@unique` in the schema but is **never set anywhere in app
   code** — confirmed by auditing every `encounter.create` site. Booking creates only an
   `Appointment`; encounters are created solely at visit-start (`startVisit` /
   `startVisitWithBriefing` / `startVoiceEncounter`) or walk-in, all as `in_progress`. The
   readiness/intake side runs off Appointments; the check-in → rooming → visit side runs off
   Encounters; **nothing bridges them.** Consequence: a patient who books and shows up has no
   Encounter, so `kioskCheckIn` returns *"No appointment found for today"* and the queue board
   never shows them. The seeded demo hides this because it creates encounters directly.
   - **Recommended fix (team decision required — timing/semantics):** an idempotent
     `ensureEncounterForAppointment(appointmentId)` that creates a `scheduled` Encounter from a
     confirmed Appointment (copying `scheduledFor`/`providerId`/`modality`, linking
     `appointmentId` — the `@unique` makes it race-safe). Wire it at ONE agreed trigger: at
     appointment confirmation, a day-of cron, or lazily on first check-in / queue-board load.
     This affects what the queue/dashboards/billing count, so it's a workflow-semantics call,
     not a silent fix — deliberately left for you.

1. **Concurrent walk-in duplicate** — `selectActiveVisitEncounter`+`create` is not atomic.
   The deterministic roomed-miss is fixed and repeat-clicks reuse, but two *simultaneous*
   Start Visits for a patient with NO existing encounter can still both create. A true fix
   needs a DB-level guard (partial unique index on active encounter per patient/day);
   deferred — requires a migration on the shared dev DB (which has known `migrate deploy`
   drift). Low likelihood (single physician per patient), surfaced here intentionally.
2. **Concurrent provider double-book at booking** — the new conflict check closes the
   sequential/repeat case; a true concurrent race needs a DB exclusion constraint (same
   migration caveat).
3. **No formal amend/reopen workflow** — `amended` status exists but nothing transitions
   into it; signed notes are now correctly locked. A clinician-facing amendment flow
   (new addendum + audit) is a product decision, not in scope.
4. **Co-sign author identity** — `pending_cosign` overwrites `authorUserId` with the
   finalizing clinician; the originating mid-level is not separately retained. Pre-existing;
   flagged for product/clinical review (semantic decision).

---

## 5. Verification

Baseline before changes: 269 test files / 2566 tests, all passing.

| Gate | Command | Result |
|------|---------|--------|
| Unit + integration | `npx vitest run` | **275 files / 2613 tests passing** (+6 files, +47 tests over baseline) |
| Typecheck | `npm run typecheck` (`tsc --noEmit`) | pass (exit 0) — re-run after round 2 |
| Lint | `npm run lint` (`next lint`) | pass (exit 0); only a pre-existing `no-img-element` warning in `ShareDialog.tsx` (untouched) |
| Build | `npm run build` (`prisma generate && next build`) | pass (exit 0) at round 1; round-2 changes are typecheck+lint+test clean (build not re-run) |

New / changed tests:
- `src/lib/domain/visit-state.select-active.test.ts` (new, 13) — drives the real
  WHERE clause; **verified to fail on the pre-fix filter** (8 failures) then pass.
- `src/lib/domain/visit-journey.integration.test.ts` (new, 4) — end-to-end spine.
- `src/app/(patient)/portal/schedule/actions.book.test.ts` (new, 7).
- `src/app/(clinician)/clinic/patients/[id]/notes/[noteId]/actions.save-note-lock.test.ts` (new, 5).
- `actions.start-visit.test.ts` (+6 queue-state reuse / terminal-create cases).
- `visit-state.test.ts` (updated contract assertions to the corrected non-terminal set).
- Round 2: `voice-chart/actions.start-voice.test.ts` (new, 7),
  `communications/actions.overlay-telehealth.test.ts` (new, 3),
  `actions.book.test.ts` (+2 provider-validation cases).

Playwright e2e was **not executed**: the authed care-journey UI needs a running
dev server + seeded DB + Clerk auth, which can't be stood up with synthetic-only,
no-prod-credential constraints in this sandbox. The journey is instead proven by
the integration spine + server-action unit tests above. The existing `e2e/`
specs (public/authed surfaces) remain unchanged.

## 6. Commits (branch `worktree-care-journey-hardening`, off `main`)

```
4d922df3 fix(visit): reuse checked-in/roomed encounter on Start Visit — no duplicate encounters
0304dda3 fix(portal): guard bookAppointment against double-booking, past/invalid times, modality loss
886e495b fix(notes): block saveNoteBlocks from silently mutating a signed note
ad2084b0 test(visit): end-to-end same-day care-journey integration spine
61121004 test(visit): align ACTIVE_VISIT_STATUSES contract test with the non-terminal fix
8a0f3619 fix(visit): close two more duplicate-encounter siblings (voice charting, telehealth overlay)
61735a21 fix(portal): validate provider exists, is active, and shares the patient's org on booking
docs(audit): round-2 update — siblings, provider validation, appointment↔encounter finding
```
