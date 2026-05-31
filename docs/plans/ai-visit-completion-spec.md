# AI Visit Completion — Product Spec

Status: **Approved direction → implementation-ready spec** · Owner: product · Surface: clinician, post-note-finalization
Builds on the "AI Visit Completion panel" scaffold (PR #555). Companion to the Pre-Visit Readiness work (EMR-912).

> Design philosophy: physicians hate EMRs because EMRs convert *judgment* into *clerical burden*. AI Visit Completion does the opposite — it converts clinical judgment into completed, auditable, safe action. The physician stays in control, but is no longer alone.

---

## 1. Product narrative

A visit note today is a dead end. The physician writes "start metformin, A1C in 3 months, refer ophthalmology, return in 6 weeks," signs the note, and then *becomes a clerk* — placing orders, chasing the refill, messaging the patient, hoping the front desk books the follow-up, and praying the coding holds up. The intent was clear at the moment of signing. The execution leaks out over the following hours and days, across six screens and three people, and some of it simply never happens.

**AI Visit Completion** closes that gap. The instant the note is finalized, a thin co-pilot layer opens directly beneath it and says, in effect:

> *"Based on this visit, here are the clinically reasonable next actions. Approve, remove, edit, or send."*

It is not a dashboard, a billing screen, or an administrative junk drawer. It is the **completion moment** — the physician's intent, already formed, rendered as a short list of **Suggested Next Best Actions** they can release with confidence. Nothing is ordered, sent, scheduled, billed, or assigned until the physician presses **Release Care Plan**. After release, the system does the clerical work the physician used to do by hand: it turns selected actions into orders, patient messages, scheduling, staff tasks, and billing-readiness checks.

The wedge is trust, not automation. Every other "AI in the EMR" pitch asks the physician to cede control. This asks the opposite: *keep* control, lose the busywork. That is why the primary verb is **Release**, not "submit" or "run" — the physician is releasing reviewed intent into motion, deliberately.

The business case is quiet but real: fewer dropped follow-ups, fewer missed care gaps, fewer inbound "what did the doctor say" calls, cleaner claims, and less documentation drift — *revenue protection that feels like care, not coding jail.*

---

## 2. User journey — note finalization → Release Care Plan

1. **Finalize.** Physician signs/finalizes the visit note. (Existing flow; finalization is the trigger.)
2. **Completion opens.** Below the now-read-only note, the **AI Visit Completion** panel expands — not a modal, not a new page. It reads the finalized note + structured chart context and renders **Suggested Next Best Actions** grouped into four cards: Suggested Orders, Follow-Up Plan, Patient Communication, Practice Readiness.
3. **Review.** Each suggestion shows *why* (the clinical rationale + its source in the note or chart) and is pre-set to a sensible default state (most are **suggested/selected**; nothing is committed). The physician scans, then **Select Care Actions**: approve, edit, remove, or defer each.
4. **Adjust.** Edits are inline and fast (change a lab, swap a referral target, reword the patient summary, change the follow-up interval). Removing an item requires one tap; the rationale stays visible so removal is informed.
5. **Release Care Plan.** A single primary CTA. A concise confirmation states exactly what will happen ("3 orders queued, 1 follow-up routed to front desk, 1 patient message sent, 2 staff tasks created, coding readiness recorded"). The physician confirms.
6. **Fan-out.** The system converts each *selected* action into its real artifact (order, message, scheduling request, staff task, billing-readiness flag) and writes an immutable audit record of what was suggested, what the physician did to it, and what was released.
7. **Post-release.** The panel collapses to a **released summary** (what went out, to whom, status). Deferred items remain visible as "not released." Staff pick up routed tasks in their queues. Nothing about the chart note itself was changed by any of this.

Edge journeys: physician releases **nothing** (valid — closes with an audited "no actions released"); physician releases **a subset** and defers the rest (the visit can be re-opened to release deferred items later, within a window); note is **amended** after release (a new completion pass is offered, scoped to the delta).

---

## 3. UX spec — the AI Visit Completion section

**Placement & frame.** A full-width panel anchored *below* the finalized note on the note page — same scroll context, visually subordinate to the note (the note is the record; this is the action layer). Calm, Apple-grade: generous spacing, one primary action, muted until engaged. It is collapsed-with-summary before finalization and expands on finalize.

**Header.** `AI Visit Completion` + a one-line, plain statement of intent: *"Reviewed by you. Nothing happens until you release."* A small confidence/Coverage note ("Generated from this visit + chart context") and a timestamp. No jargon, no sparkles.

**The four cards** (each a section of **Suggested Next Best Actions**):

### 3.1 Suggested Orders
Diagnosis-aware labs, imaging, referrals, medication actions, screenings, and care gaps. Each row:
- **What** (e.g., "A1C") + **type chip** (Lab / Imaging / Referral / Medication / Screening / Care gap).
- **Why** — short rationale + provenance ("Dx: Type 2 diabetes · last A1C 142 days ago").
- **State control**: Approve · Edit · Remove · Defer (default = suggested/selected for high-confidence, *unselected* for lower-confidence care-gap nudges so the floor is "do nothing").
- Care-gap items are clearly distinguished from visit-driven orders (they're "while we're here" nudges, never implied to be from the note if they aren't).
- Worked example (diabetes follow-up): A1C, urine albumin/creatinine, CMP/eGFR, lipid panel (if due), retinal-exam check, foot-exam reminder, medication-refill check.

### 3.2 Follow-Up Plan
- Detects **return-to-clinic language** in the note ("return in 6 weeks", "f/u 3 months").
- States the **gap**: *"Plan mentions return in 6 weeks. No follow-up appointment scheduled."*
- Actions: route scheduling to front desk (creates a scheduling task), or send the patient a scheduling link; or mark "already scheduled" (links the existing appointment).
- If a matching future appointment exists, it says so and offers nothing to do.

### 3.3 Patient Communication
- Generates a **plain-language visit summary** for portal / print / SMS / translation.
- Includes: what we did, lab instructions, follow-up plan, medication reminders, education materials, next steps.
- Physician can edit the text, pick channels, pick language, and preview exactly what the patient will receive.
- Goal: fewer inbound calls, better adherence.

### 3.4 Practice Readiness
- *Quiet* support: coding suggestion (E/M level + diagnoses) with confidence, documentation-quality nudges, prior-authorization risk flags, claim-readiness checklist, and optional staff tasks.
- Framed as **revenue protection**, surfaced softly and collapsed by default — never a billing console, never blocking. The physician can ignore it entirely.

**Footer / commit bar (sticky).** A live tally ("4 selected · 2 deferred · 1 removed") and the single primary CTA **Release Care Plan**. Secondary: "Release later" (keeps the plan as draft on the visit). Pressing Release opens a concise confirmation enumerating side effects before anything fires.

**States:** loading (generating), ready, partially-released, released (collapsed summary), error (degrade gracefully — see §11). Empty state is valid and dignified ("No additional actions suggested for this visit").

---

## 4. Data needed to power each card

A single server assembler builds a **`VisitCompletionContext`** from existing models; the suggestion engine is a pure(ish) function over it so it is testable and auditable.

| Card | Inputs |
|---|---|
| Suggested Orders | Finalized note text (NLP for plan/assessment); problem list / encounter diagnoses (ICD-10); med list (`PatientMedication`, `DosingRegimen`); lab history + result dates (`LabResult`) for due/overdue math; allergy/contraindication flags; age/sex for screening eligibility; care-gap rules (clinician-governed table — see EMR-917 pattern). |
| Follow-Up Plan | Note plan text (return-to-clinic NLP); existing future `Appointment`s for the patient; provider + clinic context; scheduling routes. |
| Patient Communication | Note (assessment/plan); selected orders + follow-up (so the summary matches what's actually being released); med changes; patient language/comms prefs (`CommunicationPreference`); education-material catalog. |
| Practice Readiness | Note + diagnoses + procedures; existing coding suggestion (`codingSuggestion` already on the note); payer/coverage (`PatientCoverage`); documentation-completeness signals; prior-auth rules per payer/drug. |

**Provenance is mandatory:** every suggestion carries `{ source: "note" | "chart" | "care_gap_rule", reference }` so the UI can show *why* and the audit can prove it. Clinical rule tables (care gaps, screening intervals, prior-auth) follow the **clinician-governed** model (Tier-1 policy table, AI recommends, clinician overrides) — assistance, not autonomous medicine.

---

## 5. Action model — approve / remove / edit / defer / send

Each suggestion is a **`SuggestedAction`** with a lifecycle the physician drives:

```
suggested ──approve──▶ selected ──(Release)──▶ released ──▶ executing ──▶ completed | failed
   │  │  │
   │  │  └─defer──▶ deferred (stays on the visit, not released)
   │  └────remove──▶ dismissed (audited, with optional reason)
   └───────edit───▶ selected (edited; original retained for audit)
```

- **Approve / Select** — marks the action to be included on Release. High-confidence items default to selected; low-confidence care gaps default to *not* selected.
- **Edit** — modify the action's parameters (lab, target, dose intent, message text, follow-up interval). The original AI suggestion is retained immutably alongside the edited version.
- **Remove / Dismiss** — exclude it; optional structured reason ("not indicated", "patient declined", "already done"). Dismissals are audited (useful signal + defensible).
- **Defer** — keep it on the visit as un-released; can be released in a later pass within a defined window.
- **Send** — only meaningful at **Release**; there is no per-item "send now" that bypasses review. (Exception: explicitly previewing a patient message is read-only.)
- **Release Care Plan** — the single commit point: every `selected` action transitions to `released` → `executing`. Returns a per-action result so partial failures are visible and retryable, never silent.

Actions are **idempotent on release** (a double-press cannot double-order). Re-opening a released visit shows what was released and lets deferred items be released without re-firing completed ones.

---

## 6. Safety model

The entire feature is built around one invariant: **nothing leaves the physician's hands without an explicit, audited release.**

- **No silent ordering.** Orders are created only on Release, only for `selected` items, and land as *orders to be acted on* — not auto-resulted or auto-transmitted beyond existing order policy.
- **No silent billing.** Practice Readiness records **billing-readiness signals and a coding suggestion**; it never submits a claim or finalizes a code. Claim submission stays in the existing billing pipeline, downstream, human-initiated.
- **No silent scheduling.** Follow-up creates a **scheduling task or a patient scheduling link** — it does not book an appointment without front-desk/patient action.
- **No silent chart overwrite.** The completion flow **never edits the finalized note**. Patient-reported or AI-generated content is *staged* (tasks, messages, readiness flags) and routed for review; it does not mutate the clinical record. (Same "stage, don't overwrite" rule as the kiosk lobby.)
- **Physician control is total.** Every item is approve/edit/remove/defer; releasing nothing is a valid outcome.
- **Audit trail (immutable).** One record per visit-completion session capturing: the generated suggestions (with provenance + model/version), every physician action on each (approve/edit-diff/remove-reason/defer), the release event (actor, timestamp), and the resulting artifacts + their execution status. PHI-minimized in any logs/metadata; full detail lives in the audited record, access-controlled.
- **Attribution.** Released actions are attributed to the physician (the releaser), with the AI suggestion retained as provenance — defensible "physician reviewed and released," never "the AI ordered it."
- **Degrade safe.** If suggestion generation fails or is low-confidence, the panel shows an honest empty/partial state; it never fabricates orders to look productive.

---

## 7. Task-routing model — staff handoff

On Release, each released action is converted to its real artifact and, where human work is required, routed to the right queue:

| Released action | Becomes | Routed to |
|---|---|---|
| Lab / imaging order | Order record (existing order pipeline) | Order queue / orders staff; results loop back to provider |
| Referral | Referral task + (optional) patient comms | Referral coordinator / back office |
| Medication action (refill/change intent) | Rx task or order per existing Rx flow | Provider/Rx queue (controls honored) |
| Follow-up scheduling | Scheduling task **or** patient scheduling link | Front desk (task) / patient (link) |
| Patient communication | Portal message / SMS / print packet | Sent to patient via comms pipeline (respects `CommunicationPreference`) |
| Coding / billing readiness | Billing-readiness flag + coding suggestion on the encounter | Billing/coding queue (review, not auto-submit) |
| Care-gap closure | Task or order as appropriate | Relevant staff queue |

Routing rules are **configurable per practice** (who handles what), defaulting sensibly. Every task carries scope (org, clinic, patient, visit, source action) and a back-reference to the visit-completion record, so staff see *why* and the loop is auditable end-to-end. Tasks reuse the existing `Task` model + queues; this feature is a *producer* into them, not a new task system.

---

## 8. MVP scope (v1)

Ship the moment-of-completion loop for the highest-leverage actions, read-mostly where risk is highest:

- **Trigger + panel**: opens on note finalization, below the note; collapsed→expanded; released-summary state.
- **Suggested Orders (v1):** labs + referrals + medication-refill check + a small, clinician-governed care-gap set. Each with rationale + provenance + approve/edit/remove/defer. (Imaging + full screening catalog can follow.)
- **Follow-Up Plan (v1):** return-to-clinic detection + "scheduled? / not scheduled" + route-to-front-desk task **or** patient scheduling link.
- **Patient Communication (v1):** generated plain-language summary → portal message + print; edit + preview; language/channel from prefs. (SMS + live translation can follow.)
- **Practice Readiness (v1):** surface the existing coding suggestion + a documentation-readiness checklist + optional staff task. Read-only signals; no claim action.
- **Release Care Plan**: confirmation with explicit side-effect list → fan-out → audit record → released summary.
- **Safety + audit + task-routing** per §6/§7 are in v1 (non-negotiable — they're the product).

**Explicitly out of v1:** auto-resulting orders, claim submission, appointment auto-booking, multi-pass deferral windows beyond same-session, OCR/insurance capture, and any autonomous (un-reviewed) action.

---

## 9. Future state (v2+)

- Per-visit-type **completion templates** (diabetes follow-up vs. new-patient vs. annual) with specialty-tuned action sets, governed by clinicians.
- Closed-loop **outcome tracking**: did the follow-up get booked? did the lab get drawn? surface non-completion back to the practice.
- **Prior-auth pre-flight**: predict and pre-assemble PA before the order leaves.
- **Patient-side** continuity: the released plan feeds the patient portal "your plan" + the kiosk/lobby completion surface (shared readiness spine).
- **Smart deferral & recall**: deferred care gaps re-surface at the right future visit.
- **Practice analytics** (quiet): completion rate, follow-up booking rate, care-gap closure, days-to-result — revenue + quality, not vanity.
- **Ambient draft**: completion suggestions pre-staged *during* the visit from ambient/voice, finalized at signing.

---

## 10. Acceptance criteria (engineering)

- Finalizing a note opens the AI Visit Completion panel below it; an un-finalized note does not.
- Suggestions render grouped into the four cards, each item showing rationale + provenance; generation failure shows an honest empty/partial state, never fabricated actions.
- Every suggested action supports approve / edit / remove (with optional reason) / defer; low-confidence care gaps default to *unselected*.
- **No artifact (order, message, schedule, task, billing flag) is created before Release.** Verified by test: rendering + editing suggestions writes nothing executable.
- Release shows a confirmation enumerating exact side effects; on confirm, only `selected` actions execute; each returns a per-action success/failure; release is idempotent (double-release creates no duplicates).
- The finalized note is byte-for-byte unchanged by any completion action (no chart overwrite).
- An immutable visit-completion audit record exists capturing suggestions + provenance + per-item physician actions + release actor/time + resulting artifacts + status.
- Released actions route to the correct staff queue/patient channel per the configurable routing rules, each with a back-reference to the visit-completion record.
- Releasing zero actions is a valid, audited outcome.
- Coding/billing: Practice Readiness records a suggestion + readiness flags only; no claim is submitted by this feature.
- PHI is absent from logs and task/audit metadata beyond access-controlled record detail.

---

## 11. Risks & product guardrails

- **Automation bias / over-trust.** Mitigation: defaults bias to "do nothing" for low-confidence items; rationale + provenance always shown; release is explicit and itemized.
- **Alert/suggestion fatigue.** Mitigation: short, high-precision lists; care gaps collapsed/secondary; tune for precision over recall; let practices disable cards.
- **Liability / "the AI ordered it."** Mitigation: attribution to the releasing physician; AI suggestion retained as provenance; full audit; nothing fires without release.
- **Wrong/unsafe suggestion.** Mitigation: allergy/contraindication checks on med/order suggestions; clinician-governed rule tables; easy removal; surface uncertainty honestly.
- **Scope creep into a billing console.** Guardrail: Practice Readiness stays quiet, collapsed, non-blocking, never submits claims. If it starts feeling like coding jail, it's wrong.
- **Latency at the worst moment** (physician waiting to leave the room). Guardrail: generate asynchronously/early (pre-stage during the visit where possible); panel must be usable within ~1–2s or degrade to "generate" on demand.
- **Partial-failure opacity.** Guardrail: per-action status, visible retries, never a silent drop.
- **Cross-patient/data leakage.** Guardrail: all context assembly + actions are patient+org-scoped server-side; reuse existing chart-access guards.
- **Language to avoid** (keeps the product honest): no "billing launch," "checkout bundle," "clinical decision support insights," "AI synergy," "automation hub." Use: AI Visit Completion, Suggested Next Best Actions, Suggested Orders, Follow-Up Plan, Patient Communication, Practice Readiness, Release Care Plan, Select Care Actions.

---

## 12. Codex implementation prompt

```
Implement "AI Visit Completion" — a physician co-pilot layer that opens below a
finalized visit note and turns clinical intent into reviewed, released action.

PRINCIPLE: convert judgment into completed, auditable, safe action. The physician
is in control; NOTHING is ordered, sent, scheduled, billed, or assigned until they
press "Release Care Plan." Never overwrite the chart. Never submit a claim. Never
book or transmit without explicit release. Stage + route + audit — don't automate
silently.

SURFACE: on the finalized note page, render an "AI Visit Completion" panel BELOW
the read-only note (not a modal/page). Trigger = note finalization. Four cards of
"Suggested Next Best Actions":
  1. Suggested Orders — diagnosis-aware labs/imaging/referrals/medication actions/
     screenings/care gaps; each with rationale + provenance + approve/edit/remove/
     defer; low-confidence care gaps default UNSELECTED.
  2. Follow-Up Plan — detect return-to-clinic language; show whether a future
     appointment exists; route scheduling to front desk (task) or send a patient
     scheduling link.
  3. Patient Communication — generate a plain-language summary (portal/print/SMS/
     translation) covering labs, follow-up, meds, education, next steps; editable +
     previewable; honor CommunicationPreference.
  4. Practice Readiness — surface the existing coding suggestion + documentation/
     claim-readiness checklist + optional staff task. Quiet, collapsed, NON-blocking,
     NEVER submits a claim.

DATA: build a server-side VisitCompletionContext from the finalized note (NLP for
assessment/plan), encounter diagnoses/problem list, med list, lab history+dates,
future appointments, coverage, and clinician-governed care-gap/screening rules
(Tier-1 policy table + clinician override; AI recommends, never decides). Every
suggestion carries provenance {source: note|chart|care_gap_rule, reference}. The
suggestion engine is a pure, testable function over that context.

ACTION MODEL: SuggestedAction lifecycle suggested → selected/deferred/dismissed →
(Release) → released → executing → completed|failed. Editing retains the original
suggestion immutably. Release is the only commit point, itemized, idempotent,
returns per-action status.

SAFETY/AUDIT: nothing executable is created before Release (test this). Finalized
note is never mutated. One immutable VisitCompletion audit record per session:
suggestions + provenance + model/version + every physician action + release
actor/time + resulting artifacts + status. Attribution = releasing physician. PHI
out of logs/metadata.

ROUTING: on Release, convert each selected action to its artifact and route to the
right queue using the existing Task model + comms/order pipelines (configurable per
practice): orders→order queue, referrals→coordinator, follow-up→front desk task or
patient link, comms→patient channel, coding→billing-readiness flag (review only).
Each task back-references the VisitCompletion record.

MVP: panel + trigger; Suggested Orders (labs/referrals/refill-check + small care-gap
set); Follow-Up (detect + route); Patient Communication (portal + print, editable);
Practice Readiness (coding suggestion + readiness checklist, read-only); Release with
explicit side-effect confirmation + fan-out + audit + released-summary. OUT: auto-
resulting, claim submission, auto-booking, OCR, autonomous actions.

ACCEPTANCE: see spec §10. Tests must prove: no executable artifact before Release;
note unchanged; idempotent release; per-action status; zero-release is valid;
no claim submitted; routing + audit present.

Reuse existing: note finalization + codingSuggestion on the note, Task model +
queues, CommunicationPreference + comms (email/SMS) adapters, order/Rx pipelines,
PatientCoverage, the readiness/rules patterns from EMR-913/EMR-917. Match house
style; keep PHI out of tokens/URLs/logs.
```

---

## Assumptions (documented, per "keep moving")
1. **Note finalization is the trigger** and is an existing, detectable event. If finalization is multi-step (e.g., co-sign), "finalized" = the terminal signed state.
2. **An order pipeline / order records exist** (labs, Rx). v1 produces order records/tasks into it rather than inventing transmission; auto-transmit stays governed by existing order policy.
3. **Coding suggestion already exists on the note** (`codingSuggestion`) and is reused; Practice Readiness surfaces, never submits.
4. **`Task` model + role queues exist** and are the handoff substrate; this feature is a producer.
5. **`CommunicationPreference` + comms adapters** (email via Resend, SMS via the adapter) exist and are honored for Patient Communication.
6. **Care-gap / screening / prior-auth rules are clinician-governed** (Tier-1 table; AI recommends; clinician overrides) — consistent with the platform's "assistance, not autonomous medicine" stance.
7. **Suggestion generation may be async**; the panel must degrade gracefully and never fabricate to appear productive.
8. **This shares the readiness spine** with pre-visit (one definition of "what's needed/next"), so v2 can unify pre-visit and post-visit "your plan" surfaces.
