# Visit Completion Card Detail Confirmation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make each AI Visit Completion card click into a trustworthy physician confirmation surface before Release Care Plan.

**Architecture:** Keep the behavior local to the existing visit-completion domain and panel files. The selection model remains the source of release readiness, while the panel explains what each explicit disposition will create after physician release.

**Tech Stack:** Next.js App Router, React server-action form flow, TypeScript, Vitest, Prisma-backed release action.

---

### Task 1: Truthful Release Payload Semantics

**Files:**
- Modify: `src/lib/domain/visit-completion-selection.test.ts`
- Modify: `src/lib/domain/visit-completion-selection.ts`

- [ ] **Step 1: Write the failing payload test**

Add assertions that a releasable payload with orders, follow-up, and patient communication included reports `mode: "physician_release_v1"` and marks only drafted/routed artifacts as enabled: `patientCommunication`, `staffAssignment`, and `scheduling`.

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/lib/domain/visit-completion-selection.test.ts`
Expected: FAIL because the current payload still says `review_only_mvp` and all side effects are false.

- [ ] **Step 3: Implement minimal domain change**

Update `VisitCompletionReleasePayload.mode` to allow and emit `"physician_release_v1"`. Compute side-effect flags from included sections:
- `clinical: false`
- `billing: false`
- `chartWrite: false`
- `patientCommunication: true` only when `patient_message` is included
- `staffAssignment: true` when `orders` or `follow_up` is included
- `scheduling: true` only when `follow_up` is included

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- src/lib/domain/visit-completion-selection.test.ts`
Expected: PASS.

### Task 2: Rich Card Detail Confirmation UI

**Files:**
- Modify: `src/app/(clinician)/clinic/patients/[id]/notes/[noteId]/visit-completion-panel.test.tsx`
- Modify: `src/app/(clinician)/clinic/patients/[id]/notes/[noteId]/visit-completion-panel.tsx`
- Modify: `src/lib/domain/visit-completion.ts`

- [ ] **Step 1: Write the failing panel test**

Assert that the card detail panel renders:
- `What release will do`
- a card-specific release outcome, such as back-office task creation for Suggested Orders
- item-level source/confidence/approval metadata
- truthful release copy saying draft messages/tasks are created only after physician release

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- 'src/app/(clinician)/clinic/patients/[id]/notes/[noteId]/visit-completion-panel.test.tsx'`
Expected: FAIL because the panel lacks the release impact block and still contains review-only copy.

- [ ] **Step 3: Implement minimal UI change**

Add card-specific release impact copy to the detail panel, render item metadata, and replace stale “review-only/no side effect” language with explicit safe-release language:
- release can create tasks and drafts
- release does not place orders, send portal messages, submit billing, book appointments, or overwrite chart data

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- 'src/app/(clinician)/clinic/patients/[id]/notes/[noteId]/visit-completion-panel.test.tsx'`
Expected: PASS.

### Task 3: Verification

**Files:**
- No new implementation files.

- [ ] **Step 1: Run focused tests**

Run:
`npm test -- src/lib/domain/visit-completion-selection.test.ts 'src/app/(clinician)/clinic/patients/[id]/notes/[noteId]/visit-completion-panel.test.tsx'`
Expected: PASS.

- [ ] **Step 2: Run broader checks**

Run:
`npm run lint`
`npm run typecheck`
Expected: PASS, allowing pre-existing lint warnings only.

- [ ] **Step 3: Commit**

Commit with:
`git commit -m "feat: enrich visit completion card confirmation"`
