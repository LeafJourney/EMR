# Patient Journey — Happy-Path Audit

**Date:** 2026-06-10
**Persona:** Maya Reyes — `patient@demo.health` / `Longbeach2026!` (richest seeded record), role `patient`
**Method:** code-level trace of signup → onboarding → intake → consent → booking → check-in → visit → data capture → follow-through, four parallel audit legs, claims cited to file:line.
**Directive lens:** CLAUDE.md Data Collection Philosophy — emoji-first, 1-10 anchored scales, per-product logging, auto-population, "fun > friction," structured for research/insurance/pharma reuse.

---

## Verdict

**The portal is a beautiful read-only window onto a clinic that never speaks first — and the company's
own data-collection thesis is implemented as theater.** The interaction layer largely honors the
directive (emoji pickers, anchored scales, 5-tap dose logging, streaks, confetti). The persistence and
delivery layers are severed in both directions:

- **Inbound (patient → data):** the primary post-dose flow saves *nothing*. `DoseLog` has zero
  `create` calls in the codebase. Side effects, scales, and the dose itself are discarded at the
  celebration screen. Portal consent signatures are lost on refresh. Goals can't be saved.
  Preferences saves are `setTimeout` fakes.
- **Outbound (clinic → patient):** booking confirmations, cancellation notices, telehealth join
  links, leaflets, outcome check-in tasks, and notification rows are either never sent, never
  consumed, or never rendered. The patient finds things out only by polling her own portal.

This is the same severed-loop disease found in the front-office audit, now on both sides of the
patient relationship.

### Verified working (give credit)
- Self-booking, reschedule, cancel of her own appointments; appointment list with status colors
- Messaging round trip (her message → triage agent draft → clinic approval → visible reply)
- Document upload + AI classification; dispute filing; statements/insurance display
- Manual weekly check-in `/portal/outcomes/new` (anchored 0-10 scales) → `OutcomeLog` persists →
  streak increments → badges + confetti fire → patient-side per-product efficacy dashboard renders
- Registration packet (4-step) persists demographics/insurance/consents; kiosk lobby staging flow
  (staged-for-staff-review is intentional security design)

---

## Blockers

| # | Finding | Where |
|---|---------|-------|
| PJ-B1 | **Post-dose logging persists nothing.** QuickDoseLogger (product → emoji → 3 anchored scales → 12-item side-effect grid → celebration) has no server action; "Save" just transitions to the done screen. `DoseLog` model exists, `doseLog.create` appears nowhere; `/portal/dose-history` is forever empty; side effects have no persistence target. The directive's core loop captures zero data. | `portal/log-dose/quick-dose-logger.tsx:376`, `portal/log-dose/actions.ts`, schema `DoseLog` (~2338) |
| PJ-B2 | **Portal consent has no persistence and no DB read.** Signatures live in React state — refresh and they're gone; no `portal/consent/actions.ts` exists. The page also never reads `SignedConsent`, so consents signed during registration render as "Unsigned" (duplicate-signature invitation). | `portal/consent/consent-view.tsx:266-532,269` |
| PJ-B3 | **Telehealth visits cannot be joined by the patient.** `startTelehealthVisit` creates the room + patient token but nothing delivers the join link (the UI comment promises an email that doesn't exist); the portal has no join surface. | `clinic/patients/[id]/telehealth/actions.ts:24-76`; `telehealth/launch-video-popup.tsx:90-94` |
| PJ-B4 | **Appointment lifecycle is silent.** Booking success screen promises "a confirmation message shortly" — nothing sends one; `appointment.created` is never emitted anywhere; clinic cancellations emit `appointment.cancelled` (added tonight) but **no workflow consumes it**; patient-side cancel emits nothing. No reminders fire automatically. | `portal/schedule/actions.ts:43-165`; `events.ts:22-23`; `workflows.ts` (no consumer) |

## Majors

| # | Finding | Where |
|---|---------|-------|
| PJ-M1 | **Outcome-tracker tasks never reach the patient** — the agent creates 3-day/7-day check-in `Task` rows (`assigneeRole: "patient"`); no portal surface queries Task. Weekly cadence is severed (same dead-drop as FO-B1). | `lib/agents/outcome-tracker-agent.ts:26-49` |
| PJ-M2 | **Notifications are empty by design** — the scheduler creates `Notification` rows (pre-visit reminders) but the notification center hard-codes an empty list and never queries; notification prefs AND communication prefs both fake their saves with `setTimeout`. | `portal/notifications/notification-center.tsx:66-75`; `portal/profile/communication-preferences.tsx:118-127`; `lib/scheduling/send-reminders.ts:580` |
| PJ-M3 | **No refill request path** — clinic has a refill approval queue; the patient has no button/form to ask. One-way pipe. | `portal/medications` (absent), `RefillRequest` model |
| PJ-M4 | **Leaflet never reaches the patient** — no portal surface, no message attachment, no document drop. After-visit summary is clinician-only art. | `clinic/patients/[id]/leaflet/actions.ts` |
| PJ-M5 | **No guided onboarding** — new patients get no nudge to the registration packet (6+ taps of manual discovery, 13+ fields across two disconnected flows); no-record signups dead-end with a "Go to Admin Console" button; `patient.intake.stalled` fires from the scheduler with **no workflow consumer** (dead nudge). | `portal/page.tsx:77-242`; `workflows.ts` |
| PJ-M6 | **Treatment goals are demo seeds** — progress bars render hardcoded examples; NewGoalForm has no submit handler; no goal persistence exists. Directive item "treatment goal progress" is display-only. | `portal/goals/page.tsx:42-72`, `goals-view.tsx` |
| PJ-M7 | **Clinician never sees per-product efficacy** — the patient-side dashboard works; no clinician chart surface reads the same data. "Which products work for which patients" — the product-development thesis — is invisible to the care team. | `portal/efficacy/**` vs `clinic/patients/[id]` (no tab) |
| PJ-M8 | **Check-in status invisible** — Encounter check-in/rooming states never surface on her appointment view. | `portal/appointments/page.tsx` |
| PJ-M9 | **Patient payments hardcoded disabled** ("pilot" banner; every Pay button `disabled`) while the desk-side rails (gateway, idempotency, FinancialEvents) are fully built. | `portal/billing/page.tsx:65-114,280` |
| PJ-M10 | **Researcher portal is a mockup** — hardcoded demo cohorts; no live OutcomeLog/cohort linkage; per-product attribution rides in a parsed `note` string. Data-reuse target unimplemented end-to-end. | `(researcher)/research-portal/page.tsx:19-23` |

## Minors
1. Freeze tokens earned but buried in `/portal/lifestyle` (most patients will never find them); badge gallery likewise.
2. AI "companion" (Cindy) is a static nav hub; `AICoachThread/Message` schema unused — no conversation.
3. Intake submit gives no next-steps; registration data doesn't prefill the intake form.
4. Cancellation reason audit-logged but never shown to the patient.
5. Dispute filing works but isn't linked from the main billing card.
6. `withTimeout` hardening exists only on the portal homepage; other portal pages fall to the generic error boundary.
7. Assessments page has heuristic "up next" triage but no trigger/cadence system.

---

## Directive scorecard

| Directive | Interaction layer | Data layer |
|-----------|------------------|------------|
| Emoji-first surveys | ✅ implemented | ❌ discarded (dose flow) |
| 1-10 anchored scales | ✅ implemented | ⚠️ persists only via manual weekly form |
| Per-product logging | ✅ UI exists | ❌ DoseLog never written; attribution via note-string parsing |
| Auto-population | ⚠️ partial | ❌ registration ↛ intake prefill |
| Fun > friction | ✅ 5-tap dose flow | ❌ the fun flow is the one that saves nothing |
| Structured for research | — | ❌ researcher portal mock; no cohort linkage |

## Fix plan (crews)
- **PJ-1 Data capture persistence (the thesis):** persist the full post-dose flow (DoseLog incl. side effects + linked OutcomeLogs), populate dose history, real treatment goals, surface outcome-tracker tasks in the portal. Owns the schema/migration delta.
- **PJ-2 Onboarding & consent:** portal consent server action + DB-read (dedupe with registration consents), onboarding gate/banner on portal home, intake next-steps + registration→intake prefill, wire `patient.intake.stalled` to the messaging workflow.
- **PJ-3 Appointment lifecycle comms:** emit + consume `appointment.created`/`appointment.cancelled` (both sides) → Notification rows + portal-visible confirmation/cancellation messages; telehealth join link delivery + portal Join button; check-in status on her appointment card; cancellation reason shown.
- **PJ-4 Portal round-trips:** notification center reads the real feed + badge; preferences persist (both screens); refill request UI → sign-off refills queue; leaflet delivered as a patient document + message link.
- **Backlog (ticketed, not tonight):** patient online payments enablement (gateway decision), clinician efficacy tab, researcher portal live cohorts, conversational AI coach.
