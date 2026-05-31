# AI Visit Completion Design

## Goal

Turn the finalized-note ending into a physician-controlled care-plan release moment.

The current note page finalizes the note, shows coding suggestions when available, and offers print/leaflet actions. That is clinically useful, but it misses the high-leverage moment immediately after the physician has expressed intent in the plan. The new surface should translate that intent into concrete next actions while keeping the physician in control.

The product feeling should be: "I am still deciding, but I am no longer doing clerical assembly by hand."

## Design Direction

Add an **AI Visit Completion** section directly beneath the finalized note content. It is not a separate dashboard and not a multi-step administrative wizard. It is a thin co-pilot strip with four action cards and one primary release action.

Primary language:

- Section: **AI Visit Completion**
- Main heading: **Suggested Next Best Actions**
- Primary action: **Release Care Plan**
- Supporting action: **Approve all suggested actions**
- Card labels:
  - **Suggested Orders**
  - **Follow-Up Plan**
  - **Patient Communication**
  - **Practice Readiness**

Avoid language that makes the physician feel trapped in revenue-cycle tooling. Use "Practice Readiness" instead of "Billing launch", "Select Care Actions" instead of "Choose send-off actions", and "Release Care Plan" instead of "Complete checkout bundle".

## User Experience

When a note is finalized, the lower portion of the note detail page shows the AI Visit Completion section.

The header explains that suggested actions were generated from the finalized note, active problems, patient history, and practice patterns. The primary action is visible on the right on desktop and full-width on mobile.

The primary action includes a compact summary such as:

> Includes 2 care actions, 1 patient message, 2 staff tasks, and billing readiness check.

The physician can:

- Review each card.
- Approve all suggested actions.
- Remove a suggestion.
- Edit a suggestion before release.
- Send an item to staff.
- Defer an item.
- Release the care plan when comfortable.

Nothing is ordered, messaged, billed, assigned, or submitted until the physician releases the plan or explicitly sends a specific item.

## Action Cards

### Suggested Orders

Shows clinically reasonable orders and care actions based on the note and chart context.

First slice examples:

- medication refill check
- lab or screening item if due and determinable
- education or monitoring instruction
- regimen-safety follow-up

Future AI-backed examples:

- diagnosis-aware order sets for diabetes, hypertension, CKD, depression, obesity, chronic pain, asthma, COPD, anticoagulation, and post-hospital follow-up
- due-status evidence from last result dates
- physician preference patterns

### Follow-Up Plan

Detects whether the plan implies or states follow-up and whether a matching appointment exists.

First slice examples:

- "Plan implies follow-up; no appointment scheduled"
- "Recommend return visit in 6 weeks"
- "Send scheduling task to front desk before patient leaves"

This is one of the highest-value cards because it converts clinical intent into scheduling action while the patient is still reachable.

### Patient Communication

Shows the patient-facing version of the plan.

First slice examples:

- portal message draft
- printable or Leaflet handoff
- translation action when relevant
- plain-language next steps

The card should make it clear that the physician can preview and edit before sending.

### Practice Readiness

Keeps coding, documentation, prior authorization, and staff-operation checks present but not dominant.

First slice examples:

- suggested E/M level when coding suggestions exist
- ICD-10 candidates from Coding Readiness Agent output
- documentation gap that would make coding, prior auth, or patient handoff stronger
- staff task warning if a plan item lacks an owner

The tone should be quiet revenue protection and operational completeness, not coding anxiety.

## Data Flow

The first implementation should use a typed server-side projection rather than wiring a new autonomous agent end to end.

Recommended helper:

`src/lib/domain/visit-completion.ts`

Responsibilities:

- Accept note, encounter, patient context, coding suggestion, and existing follow-up/task/order/message facts where available.
- Return a `VisitCompletionBundle` with stable sections, counts, and source metadata.
- Use deterministic heuristics first so the UI can ship safely.
- Leave room for model-generated suggestions later without changing the UI contract.

Example shape:

```ts
export interface VisitCompletionBundle {
  summary: string;
  cards: VisitCompletionCard[];
  releaseEnabled: boolean;
  warnings: VisitCompletionWarning[];
}

export interface VisitCompletionCard {
  id: "orders" | "follow_up" | "patient_message" | "practice_readiness";
  title: string;
  subtitle: string;
  items: VisitCompletionItem[];
  actions: VisitCompletionAction[];
}

export interface VisitCompletionItem {
  id: string;
  label: string;
  tone: "neutral" | "warning" | "alert";
  source: "note" | "coding" | "problem_list" | "encounter" | "heuristic";
  reason?: string;
}
```

## UI Components

Add a focused component near the note detail route:

`src/app/(clinician)/clinic/patients/[id]/notes/[noteId]/visit-completion-panel.tsx`

Responsibilities:

- Render the AI Visit Completion header.
- Render the four cards.
- Keep card controls visually compact and physician-friendly.
- Support empty, loading, and degraded states.
- Accept a fully built bundle as props.

The existing note editor is already doing too much. The panel should be a separate component and the route page should pass the projected bundle alongside `codingSuggestion`.

## Release Behavior

The first implementation can make **Release Care Plan** a staged client action with clear disabled/degraded states if back-end mutation support is not ready.

Preferred behavior when mutations are available:

- Release creates or updates staff tasks.
- Release queues or stores patient-message drafts for approval/sending.
- Release records selected/deferred items and source metadata.
- Release dispatches billing/readiness workflow events only once.
- Release writes an audit event with user id, note id, encounter id, selected items, and timestamp.

High-risk actions must remain gated:

- orders require physician approval
- portal messages require preview or explicit send
- billing submission remains downstream and approval-gated according to existing billing-agent rules

## Error Handling

If the bundle cannot be built, show a calm degraded state:

> AI Visit Completion is unavailable for this note. The finalized note and coding suggestions are still saved.

If only one data source is missing, keep the section visible and mark the affected card:

- "No coding suggestion yet"
- "No follow-up appointment found"
- "Patient messaging unavailable"
- "Chart context incomplete"

Never block note finalization because the visit-completion bundle failed.

## Testing Strategy

Tests should be written before production changes.

Required coverage:

- bundle builder returns all four card ids in stable order
- finalized note with coding suggestions populates Practice Readiness
- plan text with follow-up language and no appointment creates a Follow-Up Plan warning
- missing coding suggestion degrades Practice Readiness without crashing
- panel renders Release Care Plan and all four cards
- controls do not appear for actions that are unavailable
- release mutation, when implemented, is idempotent and audit-logged

## Acceptance Criteria

- Finalized notes show AI Visit Completion below the note content.
- The section uses the approved product language.
- The four cards appear in a coherent bottom-third strip on desktop and stack cleanly on mobile.
- The primary action is **Release Care Plan**.
- The UI makes it clear that the physician controls what happens.
- Billing/coding support is present under Practice Readiness but does not dominate the flow.
- The first slice can run without a live model call.
- Failures in the bundle do not block note finalization.

## Reference Mockup

The approved visual direction was explored in the local brainstorming preview:

`.superpowers/brainstorm/27616-1780203190/content/ai-visit-completion-v1.html`

That file is a disposable visual companion artifact and should not be committed as product code.
