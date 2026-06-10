# Tech-Debt Workstreams — Physician Workflow Phase 2

Four parallel agent briefs. Each is self-contained: paste one brief into a fresh agent session.
They burn down the remaining items from `PHYSICIAN_WORKFLOW_AUDIT.md` (EMR-1103 rollup) plus
the loose ends left by the Phase 1 blocker/major fixes (commits `0186db9`, `7d40dd3`, `b33eb9d`, `d554500`).

## Shared rules (apply to every workstream)

- **Base branch:** branch off `claude/pensive-cerf-79lzwn` (it has the new Prisma models and the
  Phase 1 fixes). Name your branch `claude/ws-<letter>-<short-desc>`. Commit per task, push when green.
- **Read first:** `PHYSICIAN_WORKFLOW_AUDIT.md`, then the files in your territory. Follow existing
  conventions exactly (server actions: `requireUser` → permission check → org-scoped lookup →
  audit log → `revalidatePath`; structured `{ ok, error }` results; vitest with hoisted prisma mocks).
- **Territory discipline:** edit only inside your listed territory. If a fix genuinely requires an
  out-of-territory change, make the smallest possible edit and call it out in your report.
- **Definition of done per task:** code + test (where a sibling test pattern exists) + `npm run
  typecheck` clean + targeted `npx vitest run <files>` green. Run the full `npm test` before final push.
- **No new dependencies. No `prisma migrate` against live DBs** — schema/codegen only (`npx prisma
  generate` is fine; WS-D owns migration artifacts).
- Update your Linear epic (WS-A…D) as you complete tasks; move it to In Review when pushed.

---

## WS-A — Documentation Cockpit (note editor reliability & speed)

**Mission:** the note editor is where physicians live; make it lossless and honest. Zero wasted
keystrokes, zero misleading states.

**Linear:** epic WS-A; items 1, 3, 4, 5, 11, 12 of EMR-1103.

**Territory:** `src/app/(clinician)/clinic/patients/[id]/notes/[noteId]/**` *except*
`visit-completion-panel.tsx` (WS-B owns it; inside `actions.ts` stay out of the
`releaseVisitCompletion` region), plus `src/app/(clinician)/clinic/patients/[id]/notes-tab.tsx`.

**Tasks:**
1. **Autosave** (`note-editor.tsx`): debounced autosave (~3s after last block edit) via the existing
   `saveNoteBlocks` action; dirty-state indicator ("Unsaved changes…" → "Saved 12:04"); `beforeunload`
   guard while dirty. Respect the existing save-lock semantics (`actions.save-note-lock.test.ts`).
2. **Cosign-aware finalize messaging**: when the signer requires cosignature (`pending_cosign` path,
   `actions.ts` ~328), the success message must read "Note routed for physician co-signature", not
   "finalized and signed"; render a distinct "Awaiting co-signature" badge state in the editor.
3. **Status visibility**: surface the note status badge (draft / awaiting co-sign / signed / amended)
   in the note page header (`page.tsx`), not only below the fold.
4. **Honest labels**: notes-tab "Open to edit" → "View" for finalized/amended notes; "Draft a note"
   → "Start visit" (it creates an encounter).
5. **Toast consistency**: finalize success message auto-clears like the save toast does.
6. **Post-finalize agent strip**: after finalize, show a small strip listing the downstream agent jobs
   for this encounter (coding readiness, patient outreach, outcome tracker) with live status from
   `AgentJob` (pending/running/succeeded/failed + failure reason). Server-fetch on the note page;
   no polling infrastructure — a refresh button is fine.
7. **Cleanup**: remove the two `as any`/typed casts left in `actions.ts`/`page.tsx` pending prisma
   regeneration (client is now regenerated). Remove `needs_review` from the editor's editable-status
   set and notes filtering *within your territory only*; if references exist elsewhere, list them in
   your report — do not edit them.

---

## WS-B — Visit Wrap-Up & Follow-Through

**Mission:** the 60 seconds after "Sign" should finish the visit completely: follow-up booked,
patient summary out the door, no zombie queue entries.

**Linear:** epic WS-B; items 2, 6 (panel part), 7, 8, 14 of EMR-1103; outreach no-op queue entries
(Phase 1 leftover).

**Territory:** `src/app/(clinician)/clinic/patients/[id]/notes/[noteId]/visit-completion-panel.tsx`
(+ its test), the `releaseVisitCompletion` region of `notes/[noteId]/actions.ts`,
`src/lib/domain/visit-completion.ts` (+ test), `src/app/(clinician)/clinic/patients/[id]/leaflet/**`,
`src/app/(clinician)/clinic/scheduling/follow-up/**`, `src/lib/agents/patient-outreach-agent.ts`,
`src/lib/agents/messaging-assistant-agent.ts`, `src/lib/orchestration/workflows.ts` (messaging
workflow entry only), the approvals/sign-off queue page, and the `startVisit` function in
`src/app/(clinician)/clinic/patients/[id]/actions.ts`.

**Tasks:**
1. **One-click follow-up booking**: the Follow-Up card in the visit-completion panel gets a real
   "Book follow-up" action — derive the interval from the note/cadence config (follow-up cadence
   page logic), propose the slot, create the `Appointment` on release (provider, modality, patient
   pre-filled). Keep "Send to front desk" as the fallback for complex scheduling.
2. **Leaflet in the release flow**: add a "Patient leaflet" card/affordance to the completion panel —
   generate + preview without leaving the flow (link-out to the leaflet editor for edits is fine).
3. **Modality fidelity**: `startVisit` reads modality from the day's appointment when creating an
   ad-hoc encounter instead of hard-coding `in_person`.
4. **Queue hygiene**: outreach agent runs that skip (M6 dedup) currently complete as visible no-op
   jobs in the approvals queue — suppress or label them so the physician's inbox only shows
   actionable items.
5. **Messaging-assistant decision**: `message.draft.requested` is never emitted. Wire it from one
   real surface (e.g., a "Draft reply with AI" button in the comms/inbox thread view) OR delete the
   workflow + agent registration and document the removal. Pick based on how complete the agent is —
   justify in your report.

---

## WS-C — Prescribing Safety & Compliance Hardening

**Mission:** every safety check happens server-side, every compliance path ends in a real artifact.
The client is a convenience, never the enforcement point.

**Linear:** epic WS-C; items 9, 10 of EMR-1103; pharmacy server-enforcement + CURES coverage
(Phase 1 leftovers); compliance print packet.

**Territory:** `src/app/(clinician)/clinic/patients/[id]/prescribe/**`,
`src/app/(clinician)/clinic/patients/[id]/recommend/**`,
`src/app/(clinician)/clinic/patients/[id]/compliance/**`,
`src/lib/integrations/state-registries/**`, `src/lib/domain/state-registry.ts`,
and the pharmacology/interactions lib it already imports.

**Tasks:**
1. **Server-side pharmacy enforcement**: `pharmacyId`/`pharmacyName` were added optional-server-side
   (commit `b33eb9d`) to protect the legacy v1 form and batch flow. Make the v2 path require pharmacy
   server-side (reject with a structured error), and either bring the v1/batch flows up to the same
   contract or annotate precisely why they're exempt.
2. **Server-side interaction re-check for custom products**: `prescribe/actions.ts` (~139-163) only
   re-checks interactions when a formulary product is matched. Run the interaction check server-side
   for custom/free-text products too (best-effort match on cannabinoid profile/name); block on
   unacknowledged red interactions regardless of product source.
3. **High-risk attestation coverage**: the CURES attestation only renders for controlled substances.
   Extend the attestation gate to high-risk non-controlled scenarios (high-dose THC, age ≥65,
   documented psychiatric comorbidity — use whatever risk flags the safety-check engine already
   computes). Server validates the acknowledgment, not just the client.
4. **Corpus fallback**: `recommend/actions.ts` (~58-60) throws raw on missing
   `data/cannabis-research-corpus.json`. Add graceful fallback (clear user-facing error +
   template-path recommendation still works) and a startup-time log.
5. **Compliance print packet**: the manual_stub registry path tells the physician to "print the
   packet for manual filing" — make sure a print-ready view of the signed `StateComplianceForm`
   exists (follow the `notes/[noteId]/print/page.tsx` pattern) and link it from the amber notice.
6. **Cleanup**: `src/lib/domain/state-registry.ts#submitToRegistry` is now unused by the UI — remove
   it (or repoint remaining callers to `submitToStateRegistry`), keeping `getRegistryForState`.

---

## WS-D — Chart Data Reuse & Platform Plumbing

**Mission:** data entered once is data never re-typed; the new Phase 1 models become first-class
citizens (visible on the chart, seeded, migrated, e2e-covered).

**Linear:** epic WS-D; item 13 of EMR-1103; orders chart surfacing + imaging priority + lab
attachment honesty (Phase 1 leftovers); migration + e2e coverage.

**Territory:** `src/app/(clinician)/clinic/patients/[id]/page.tsx` and its tab components
(`*-tab.tsx` in that directory, excluding `notes-tab.tsx` which WS-A owns),
`src/app/(clinician)/clinic/patients/[id]/orders/**`,
`src/app/(clinician)/clinic/patients/[id]/demographics/**`, `prisma/` (migrations, `seed.ts`),
`e2e/**`, `src/lib/domain/golden-visit-harness*`.

**Tasks:**
1. **Orders on the chart**: surface `ClinicalOrder` rows on the patient chart (page.tsx) — an Orders
   tab or card consistent with the existing tab pattern (count + hover peek + link to the order
   pages). Pending orders should be visible during pre-visit chart review.
2. **Intake → demographics prefill**: demographics inline-edit fields and the insurance section
   pre-fill from `intakeAnswers` where the structured field is empty (audit minor 13). One-way,
   physician-editable, with a subtle "from intake" hint on prefilled values.
3. **Orders polish**: add the missing priority selector to the imaging form; make the lab form's
   attachment upload stub honest (either persist attachments using the existing Document upload
   pattern, or clearly label it not-yet-saved — prefer persisting if the Document flow supports it).
4. **Migration + seed**: create the Prisma migration artifacts for the Phase 1 schema additions
   (`ClinicalOrder`, `CannabisRecommendation`, `DosingRegimen.pharmacy*`, `CodingSuggestion`
   approval fields) consistent with how this repo manages migrations (`db:push` vs `migrate` — check
   and follow), and extend `prisma/seed.ts` with sample rows for each so demo orgs exercise the new
   surfaces.
5. **E2E coverage**: extend the golden-visit harness/e2e to cover the new control point: finalize →
   coding suggestions → approve codes → charge created (and NOT before approval). Follow
   `e2e/golden-visit-surfaces.spec.ts` + `golden-visit-harness.test.ts` patterns.

---

## Merge order & conflict notes

- WS-A and WS-B both touch `notes/[noteId]/actions.ts` in disjoint regions (casts/messaging vs
  release flow) — merge either order, trivial conflicts at worst.
- WS-D's chart page work is isolated from everyone else by design (nobody else may touch `page.tsx`).
- Suggested merge order: C → A → B → D (D rebases last so its migration + seed capture the final schema).
