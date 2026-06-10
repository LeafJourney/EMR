# Front-Office Workflow — Happy-Path Audit

**Date:** 2026-06-10
**Persona:** Robin Vance — `frontdesk@demo.health` / `Longbeach2026!` (seeded + Clerk-synced), role `front_office`
**Role grants (src/lib/rbac/permissions.ts:86):** `patient.demographics.read/edit`, `billing.read/edit` — nothing else.
**Method:** code-level trace of login → landing → scheduling → check-in → tasks → communications → front-desk billing, four parallel audit legs, claims cited to file:line.

---

## Verdict

**The front office is an afterthought wearing a clinician's UI.** Robin lands in a clinician shell with
unfiltered navigation, can't perform her role's namesake functions (demographics editing is gated on
`notes.edit`; the detail editor saves to localStorage), can't see the tasks the physician workflow
explicitly routes to her, can't reach the queue board to check patients in, and can't cancel an
appointment because no such action exists. Meanwhile pages she *shouldn't* see (sign-off queue with
notes/labs/refills) load without any permission check. Enforcement is asymmetric: the patient chart
is airtight; nearly everything else is either accidentally open or accidentally closed.

**The severed loop (worst finding):** physician releases visit completion → `Task` created with
`assigneeRole: "front_office"` (notes/[noteId]/actions.ts:990-1002) → the only task worklist is
`/ops/tasks`, whose layout requires operator/practice_owner/system → **front office can never see or
work the task.** The physician workflow we just shipped ends in a dead drop.

### What works today (verified)
- Login → `/clinic` landing (roles.ts homeForRoles) ✓
- Patient roster, demographics *viewing*, chart section-gating (clinical tabs redirect away cleanly) ✓
- Right-click create appointment + drag-reschedule on `/clinic/schedule` (ungated, but functional) ✓
- Kiosk patient self-check-in (advances encounter to `checked_in`) ✓
- **Payment collection** (`collectPayment` explicitly allows front_office), statements, invoice view/print, balance display in the financial cockpit ✓

---

## Blockers

| # | Finding | Where | What Robin experiences |
|---|---------|-------|------------------------|
| FO-B1 | **Front-office tasks are unreachable.** Visit-completion creates `assigneeRole: "front_office"` tasks; the only worklist is `/ops/tasks` behind an operator-only layout. No clinic-side task surface exists. | `notes/[noteId]/actions.ts:990-1002`; `(operator)/layout.tsx:31-36`; `ops/tasks/page.tsx` | Physician hands off "book follow-up in 3 weeks" → Robin never sees it. The handoff loop is severed. |
| FO-B2 | **Demographics/insurance edits gate on `notes.edit`**, not `patient.demographics.edit`. The role's core permission unlocks nothing: inline-edit fields render read-only for front_office. | `patients/[id]/actions.ts:318,400`; chart `canEdit` derived from notes perms | Robin's job is updating phone numbers and member IDs; the fields are visible but dead for her. |
| FO-B3 | **Demographics detail editor persists to localStorage only** — for every role. "Save changes" sets a timestamp; no server action exists. Refresh ⇒ edits gone. | `patients/[id]/demographics/[section]/detail-editor.tsx:43-60,170` | Robin updates insurance, sees "Saved at 10:42", and the data silently evaporates. |
| FO-B4 | **Check-in/queue UI unreachable.** `moveQueueEncounter` + `saveRoomingHandoff` explicitly allow front_office (QUEUE_STATE_ROLES), but the only UI is `/ops/queue` (operator-gated). No clinic-side way to advance scheduled→checked_in. | `ops/queue/actions.ts:10-17,46-91`; `(operator)/layout.tsx:31-36` | A patient walks in; Robin has no button to check them in unless the patient uses the kiosk. |
| FO-B5 | **Sign-off queue loads PHI with no permission gate.** Page queries notes/labs/refills/messages with only `requireUser()`; nav shows the link and Mission Control shows a "Notes to sign" count to front_office. | `clinic/sign-off/page.tsx`, `layout.tsx:123-167`, `clinic/page.tsx:327-334,523` | A role with no `notes.read` can browse the clinical sign-off queue. Privacy gap + misleading UI. |

## Majors

| # | Finding | Where |
|---|---------|-------|
| FO-M1 | **No appointment cancel action or UI exists** — front desk (or anyone) can't cancel from the schedule; `appointment.cancelled` event exists in the taxonomy but nothing emits it. | `schedule-calendar.tsx`; events.ts |
| FO-M2 | **Booking page dead-ends for staff**: `confirmBookingAction` resolves the patient via `userId: user.id` (self-serve design), so staff get "No patient record on file." The page comment claims "front desk can use it on a patient's behalf" — it can't. | `scheduling/book/actions.ts:44-70` |
| FO-M3 | **Messaging asymmetry**: front office can *compose* a new patient thread (`composeMessage`, ungated) but cannot *reply* (`sendClinicReplyAction` requires clinician) — she can start conversations she's forbidden to continue. | `clinic/messages/actions.ts:28-29,150-190,192-234` |
| FO-M4 | **Ungated server actions working "by accident"**: `createPatientAction`, `recordVoicemailAction`, `sendFaxAction`, `collectCopay`, `createPatientAppointmentAction`, `createAppointmentAction`, `createGroupSeriesAction` have no permission/role checks at all. Front desk's access to its own job is luck, not policy — and anything authenticated can call these. | `patients/actions.ts:41-98`; `communications/voicemail/actions.ts:36`; `communications/fax/actions.ts:35`; `billing/actions.ts:252`; `schedule/calendar/actions.ts:29`; `scheduling/groups/actions.ts:30` |
| FO-M5 | **Payment plans visible but hard-denied** to front_office (clinician/practice_owner/operator only) and the denial fails silently in the form. Desk enrollment is a normal front-office function. | `patients/[id]/billing/actions.ts:358`; `payment-plan-form.tsx:26-114` |
| FO-M6 | **No balance/copay at the check-in surface** — the schedule shows nothing financial; Robin chart-dives per patient to know what to collect. | `clinic/schedule/page.tsx` |
| FO-M7 | **Eligibility "Verify" is cosmetic** — client-side format checks presented as verification; no live check is reachable from the desk. | `patients/[id]/billing/insurance-verify.tsx` |
| FO-M8 | **Navigation and Mission Control are role-blind** — every nav item renders for front_office; clinical widgets/counters query and render regardless of permissions. | `(clinician)/layout.tsx:123-167`; `clinic/page.tsx` |

## Minors
1. Two competing reschedule actions — one requires a provider profile and fails for staff, the duplicate doesn't (`schedule/actions.ts:24` vs `schedule/calendar/actions.ts:94`). Consolidate.
2. `createGroupSeriesAction` silently creates series with `providerId: null` when caller has no provider record.
3. Eligibility snapshots (`EligibilitySnapshot`) are never surfaced in the insurance card UI; coinsurance % not shown.
4. Broadcasts page renders a full compose form to roles that will always be rejected on submit (fail-late UX).
5. Beam/telehealth and transcript review correctly blocked (no action needed) — noted to document intent.

---

## Policy decisions embedded in the fixes (flag if you disagree)
1. **Front office CAN handle routine patient messaging** (compose AND reply); clinical masking (`sensitive_diagnoses.read`) still applies. Broadcasts remain clinician/operator-only.
2. **Front office CAN enroll payment plans** (it already holds `billing.edit`; desk enrollment is standard).
3. **Front office CAN create patients, log voicemails, send faxes** — but via explicit grants, not missing gates.
4. New permissions added to the matrix rather than scattering role lists: `schedule.manage`, `tasks.work`, `messages.routine` (or repo-consistent equivalents).

## Fix plan (tonight)
- **FO-1 Task queue & check-in** (FO-B1, FO-B4): clinic-side `/clinic/tasks` worklist (front_office + back_office + clinicians see their role's tasks) with complete/claim actions and deep links; clinic-side check-in control wired to the existing queue transition actions.
- **FO-2 Demographics & desk billing rights** (FO-B2, FO-B3, FO-M5, FO-M7): re-gate demographic/insurance edits on `patient.demographics.edit`; real persistence for the detail editor; payment plans allow front_office + surface errors; honest eligibility labeling.
- **FO-3 Scheduling completeness** (FO-M1, FO-M2, FO-M4-sched, minors 1-2): cancel action + UI emitting `appointment.cancelled`; on-behalf-of booking for staff; explicit gates on scheduling actions; consolidate reschedule.
- **FO-4 Access coherence** (FO-B5, FO-M3, FO-M4-comms, FO-M8, minor 4): permission-gate sign-off; role-aware nav + Mission Control (front-office variant surfaces schedule/tasks/payments instead of clinical counters); coherent messaging policy; explicit gates on patient-create/voicemail/fax/copay.
