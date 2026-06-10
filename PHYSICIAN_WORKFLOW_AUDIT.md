# Physician Workflow — Happy-Path Audit

**Date:** 2026-06-09
**Scope:** End-to-end physician happy path: sign-in → schedule → chart review → encounter documentation → clinical decisions (recommendation / Rx / orders / compliance) → note finalization → post-visit wrap-up & billing handoff.
**Method:** Code-level trace of every route, server action, and orchestration event on the path, with claims spot-verified against source. Lens: eliminate documentation waste, keep the physician in control, zero dead ends.

---

## Verdict

**The documentation core is excellent. The clinical-decision and billing-control edges are where the workflow breaks.**

- ✅ **Sign-in → schedule → chart → start visit → scribe draft → note edit → finalize → visit-completion release** works end-to-end, is idempotent, permission-gated, and covered by tests (`actions.finalize-idempotent.test.ts`, `actions.save-note-lock.test.ts`, `actions.release.test.ts`). No blockers on this spine.
- ❌ **Orders, compliance e-signature, and the recommendation→prescription handoff are stubs or lose data.** The physician completes work that is never persisted or never transmitted.
- ❌ **Charges are auto-created before the physician ever sees coding suggestions, with no approval checkpoint.** This violates "physician in control" of billing intent.

---

## Verified happy path (works today)

1. **Sign-in → landing.** Clerk → `/post-sign-in` → `resolveHomePath()` → `/clinic` Mission Control (today's encounters, queue, messages).
2. **Schedule → chart.** `/clinic/schedule` appointment chip links to `/clinic/patients/{id}` (`schedule-calendar.tsx:679,745`).
3. **Start visit.** Chart header "Start visit" → `startVisit()` (`patients/[id]/actions.ts:33-150`): permission + chart-access checks, reuses today's active encounter (no duplicates), dispatches `encounter.note.draft.requested`, runs scribe inline with 15s timeout, redirects to the note editor (graceful fallback to `?tab=notes&scribe=processing`).
4. **Document.** Note editor with APSO blocks, AI refine, dictation; save via `saveNoteBlocks`; finalize via `saveAndFinalizeNote` (`notes/[noteId]/actions.ts:275-402`) — idempotent, single shared timestamp, emits `note.finalized` + `encounter.completed`, revalidates the chart.
5. **Wrap up.** Visit-completion panel (orders / follow-up / patient message / readiness cards) → `releaseVisitCompletion` creates back-office and front-office tasks, a draft patient message, and audit log entries. Coding suggestions render in the finalized note; outreach + outcome-tracker agents fire; AI drafts queue in `/clinic/approvals`.

---

## Blockers (happy path silently breaks)

### B1. Lab & imaging orders are simulation-only — nothing is saved or transmitted
`orders/labs/lab-order-form.tsx:83`, `orders/imaging/imaging-order-form.tsx:72`
"Submit Order" `console.log`s the payload and shows a success state. No server action, no DB row, no order in the chart, no results tracking. The UI does disclose "simulated in this sandbox environment," but the workflow dead-ends: an order placed during a visit leaves zero trace in the record.
**Fix:** real server action persisting an `Order` row + surface in chart/results; keep transmission stubbed behind an integration flag if needed.

### B2. Compliance form e-signature and submission are UI state only
`compliance/compliance-form.tsx:135-136,167,189`
"Sign electronically" and "Submit form" mutate local `useState` only — reload and the signature, status, and generated form are gone. Nothing is written to the DB; no signed document artifact exists. For a cannabis EMR, the certification signature is *the* legal artifact of the visit.
**Fix:** server action persisting signature event (who/when/what payload hash) + immutable document record, with audit log.

### B3. State registry submission returns fake confirmations
`lib/integrations/state-registries/ca.ts:12-16`, `client.ts:33-46`
For CA/CO/MI, "Submit to registry" instantly fabricates a confirmation number via `buildManualSuccess`/`buildStubSuccess` unless `STATE_REGISTRY_<CODE>_API_URL/KEY` env vars are set. The physician sees a green success screen; the state has no record — and per B2 the "confirmation" isn't persisted either.
**Fix:** label stub mode explicitly in the UI ("manual submission required — print packet"), persist the submission attempt, and gate the success UI on a real response.

### B4. Charges are auto-created before the physician reviews coding — no approval checkpoint
`lib/orchestration/workflows.ts` (encounter-charge-extraction on `encounter.completed`), `lib/agents/billing/encounter-intelligence-agent.ts`
On finalize, `encounter.completed` fires and the encounter-intelligence agent creates charges immediately (`requiresApproval: false`) — before the coding-readiness suggestions even render. Coding suggestions are read-only in the note (`note-editor.tsx:675-736`): no accept/modify action, no `coding.approved` event, and `releaseVisitCompletion` never forwards coding decisions to billing. The physician's "approval" of codes is recorded nowhere.
**Fix:** add a Review & Approve Codes step in the visit-completion panel wired to `codingSuggestion`, emit `coding.approved`, and gate (or reconcile) charge creation on it.

---

## Major issues

| # | Issue | Where | Physician experience |
|---|-------|-------|----------------------|
| M1 | **Recommendation never persisted.** Generated recommendation lives only in React state; reload = gone. No audit trail of decision support used. | `recommend/actions.ts` (reads prisma, never writes) | Regenerates the same recommendation every time; can't compare or cite it later. |
| M2 | **Recommendation → prescription handoff carries no data.** "Apply to prescription" is a bare `<Link>` to `/prescribe`. | `recommend-form.tsx:121` | Re-types product type, dose, frequency they were just shown. Pure documentation waste. |
| M3 | **Pharmacy selection silently dropped.** Form posts `pharmacyId`/`pharmacyName` hidden inputs; server schema has no such fields. Submission also isn't blocked when pharmacy is empty. | `prescribe-form-v2.tsx:476,511-515`; `prescribe/actions.ts:13-41` | Picks a pharmacy, signs, Rx saves with no routing info. |
| M4 | **Diagnosis codes not captured on Rx.** Server accepts optional `diagnosisCodes`, but the form never serializes them — no ICD-10 linkage on the prescription. | `prescribe-form-v2.tsx`, `prescribe/actions.ts:214-224` | Rx lacks the indication; downstream reimbursement documentation weakened. |
| M5 | **Practice Readiness card is a mock.** Items are `mvp_mock`/heuristic placeholders; "coding_review" action opens a drawer, not a real coding flow; never reads actual `codingSuggestion` data. | `lib/domain/visit-completion.ts:367-395`, `visit-completion-panel.tsx:152-158` | Clicks "coding review," gets the same mock text — trust erosion. |
| M6 | **Duplicate post-visit patient messages.** Visit-completion release creates a draft message AND the patient-outreach agent creates a second one on `encounter.completed`; no deconfliction. | `notes/[noteId]/actions.ts:816-848`; `lib/agents/patient-outreach-agent.ts` | Two competing drafts to the same patient thread in the approvals queue. |
| M7 | **Compliance form validation is alert()-only, client-only.** Required-field check doesn't block state transitions; no server-side validation exists (there's no server submit at all — see B2). | `compliance-form.tsx:172-187` | Can "generate" a certification missing the ICD-10 code. |

---

## Minor issues / polish

1. **No note autosave.** Only the manual "Save draft" persists; a crashed tab loses the whole encounter's documentation. Add debounced autosave. (`note-editor.tsx:267-273`)
2. **Modality hard-coded.** `startVisit` creates ad-hoc encounters as `in_person` even when the appointment is telehealth. (`patients/[id]/actions.ts:94-105`)
3. **Misleading finalize message for mid-levels.** Cosign path shows "Note finalized and signed" while status is `pending_cosign`. (`note-editor.tsx:312`, `actions.ts:328`)
4. **"Open to edit" on signed notes** opens read-only view; label should be "View." (`notes-tab.tsx:135-139`)
5. **Unreachable `needs_review` note status** — defined, filtered on, never set anywhere. Remove or implement. (`scribe-agent.ts:592`, `note-editor.tsx:184`)
6. **No agent feedback after finalize.** Coding/outreach/outcome agents run invisibly; failures are silent. A small "agents running ✓" strip post-finalize closes the loop.
7. **Follow-up isn't one-click.** Release creates a free-text front-desk task; no "book in 3 weeks" pre-filled booking from the note. (`notes/[noteId]/actions.ts:799-814`)
8. **Leaflet (AVS) is off-path.** Useful AI-drafted after-visit summary exists but requires separate navigation; offer it inside the release flow. (`patients/[id]/leaflet/`)
9. **Server doesn't re-check drug interactions for custom (non-formulary) products.** (`prescribe/actions.ts:139-163`)
10. **Recommendation corpus load has no fallback** — missing `data/cannabis-research-corpus.json` throws a generic error. (`recommend/actions.ts:58-60`)
11. **"Draft a note" button** on the Notes tab actually starts a visit; relabel "Start visit." (`notes-tab.tsx:70-72`)
12. **Saved-message inconsistency:** save toast auto-clears, finalize toast persists forever. (`note-editor.tsx:295-318`)
13. **Demographics don't pre-fill from intake answers** (insurance/email re-typed). (`patients/[id]/page.tsx:1234-1335`)
14. **Messaging-assistant workflow is dead code** — `message.draft.requested` is never emitted on this path. (`workflows.ts`)

**Audited and cleared (false positives ruled out):** referrals *do* persist — `referral-form.tsx:178` calls `createReferralAction`, which writes a `Referral` row and supports packet generation (`referrals/actions.ts:51,278`).

---

## Recommended fix order

1. **B2 + B3** — persist compliance signature/submission; honest registry stub UX. (Legal artifact of the practice.)
2. **B4 + M5** — coding approval checkpoint before/with charge creation; wire Practice Readiness to real `codingSuggestion` data. (Physician control of billing.)
3. **B1** — persist lab/imaging orders. (Orders must leave a trace in the record.)
4. **M1–M4** — persist recommendations, pre-fill prescribe from recommendation, save pharmacy + diagnosis codes on Rx. (Kills the worst re-typing waste.)
5. **M6/M7 + minors** — message deconfliction, autosave, labels, agent-status feedback.

---

*Produced by a code-level audit; every blocker and major finding was verified against source before inclusion. Line numbers reflect the state of the repo on the audit date.*
