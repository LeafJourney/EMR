# Practice Onboarding — Clinical Go-Live Pressure Test

**Date:** 2026-06-13
**Scope:** The EMR-420/EMR-409/EMR-435 practice-onboarding pipeline — org/practice
creation → clinical config (specialty, care model, modalities, workflows, charting)
→ roles → shells → patient-data migration → preview → **publish / go-live**.
**Method:** 6 parallel read-only audit agents (one per pipeline slice) + repo
typecheck + onboarding unit tests. Every high-impact finding below was
**re-verified by hand against the source** before being assigned a severity;
several agent-reported "P0s" were downgraded after verification (see *Corrections*).

> **Safety boundary:** this was a code + local-build audit against synthetic
> assumptions. No production system was loaded and no real PHI was touched.
> Pressure-testing against a live instance must use a staging tenant with
> synthetic data only.

---

## VERDICT: 🚫 NO-GO for actual clinical usage

The onboarding pipeline can take a practice **live with clinically incomplete
configuration** — no charting templates, no workflows, **zero providers**, and no
NPI — because the publish gate validates only three fields. That alone blocks
go-live. Several supporting data-integrity and access bugs compound it.

**Objective signals:** `tsc --noEmit` clean (exit 0); onboarding unit tests 13/13
pass — but coverage is thin (only `phone` + `wizard-steps`; **no tests** exist for
the creation routes, the publish gate, migration, or access scoping).

---

## P0 — Blocks go-live

### P0-1 — Publish gate accepts clinically incomplete practices *(verified)*
`src/app/api/configs/[id]/publish/route.ts:36-51` — `findMissing()` checks only
`selectedSpecialty`, `careModel`, and a non-empty `enabledModalities`. It does
**not** require:
- `chartingTemplateIds` / `workflowTemplateIds` (a practice can go live with **no
  charting templates** → clinicians cannot document care)
- at least one **Provider** (go live with nobody to assign encounters to; billing
  and claims fail)
- practice **NPI** or required **consent forms**

Found independently by the clinical-config and publish slices, and confirmed
against source. `enabledModalities` "min 1" intent in
`src/lib/practice-config/schema.ts` is also never enforced at publish time.

**Fix:** expand `findMissing()` to require non-empty charting/workflow template
arrays, ≥1 Provider for the org, and a practice NPI; reuse `practiceConfigSchema`
for the structural checks. Add a test that publish 409s when any is missing.

### P0-2 — Published config is mutable after go-live *(verified)*
`src/app/api/configs/[id]/route.ts:71-91` (PATCH) blocks the *protected* fields
(`status`/`version`/`publishedAt`/`publishedBy`) but has **no `status === 'draft'`
guard**. The content fields (specialty, modalities, templates) of a row whose
status is already `published` can be PATCHed in place. Because
`/api/configs/by-practice/[practiceId]` reads the latest *published* row
(`route.ts:32-46`) and the cache tag is only revalidated by publish/archive, a
post-publish PATCH mutates the live source-of-truth without a new version snapshot
or cache bust.

**Fix:** reject PATCH unless `existing.status === 'draft'` (409
`cannot_edit_published_config`); edits to a live practice should fork a new draft.

---

## P1 — Serious (fix before go-live)

### P1-1 — Practice admins can't see their own published config *(verified)*
`src/app/api/configs/by-practice/[practiceId]/route.ts:79` calls
`canViewPracticeConfig(user, params.practiceId)`, but that helper
(`src/lib/auth/super-admin.ts:101-111`) looks up
`Membership.organizationId === practiceId`. A `Practice.id` is not an
`Organization.id`, so the membership check **never matches** and every
practice_admin is silently downgraded to the thin summary — their dashboard config
view is broken. Fails *closed* (denies, doesn't leak), hence P1 not P0.
**Fix:** resolve `practice.organizationId` first and pass that; rename the helper
param `organizationId` to kill the trap.

### P1-2 — Migration jobs can be tagged with the wrong organization *(agent-reported, code-consistent)*
`src/app/api/migration-jobs/route.ts:60` and `src/app/api/connectors/csv/route.ts:85`
resolve org as `config?.organizationId ?? admin.organizationId ?? "pending"` with
**no check that the admin owns the referenced migration profile**. A profile from
another org (or a missing config) can land imported records under the wrong org or
an invalid `"pending"` id. **Mitigating:** v1 is a *dry-run/validating* engine — it
parses and stages but does **not** create `Patient` rows yet — so this is a
foundation bug to fix **before** a real importer is plugged in, not an active leak.
**Fix:** validate `profile → configuration.organizationId === admin.organizationId`;
hard-error if org can't be resolved (drop the `"pending"` fallback).

### P1-3 — Re-applying the same specialty silently clobbers customizations *(agent-reported)*
`src/app/api/configs/[id]/apply-specialty/route.ts:93-96` unconditionally overwrites
`enabledModalities`/`disabledModalities`/template arrays with manifest defaults.
Re-selecting the *same* specialty (no "override" warning, since it isn't a change)
wipes modality customizations made in steps 4–5. **Fix:** no-op or require explicit
acknowledgement when the selected specialty is unchanged.

### P1-4 — No duplicate / atomicity guards on org+practice creation *(agent-reported)*
`Organization`/`Practice` have no uniqueness constraint, so the same legal entity or
NPI can be onboarded twice (`prisma/schema.prisma`). Creation is also two sequential
client calls (`step-1-org-practice.tsx`) — if practice creation fails after the org
is created, an **orphaned org** is left behind. **Fix:** add
`@@unique` (e.g. legalName+state, and org+npi), wrap creation in a single
server-side transaction, and 400 on conflict.

### P1-5 — CSV import data-integrity gaps *(agent-reported)*
`src/lib/migration/csv-connector.ts` does not error on **unclosed quotes** (silently
truncates the file at EOF), and `connectors/csv/route.ts` accepts a `category` slug
not present in the profile, passing rows through **unmapped** while reporting
success. **Fix:** reject malformed CSV (unterminated quote) and unknown categories
with explicit 400s; cap rows/job.

### P1-6 — Onboarding NPI accepts invalid numbers *(agent-reported)*
`/api/orgs` and `/api/practices` validate NPI as 10 digits only, while
`src/lib/billing/identifiers.ts` enforces the CMS Luhn checksum. Invalid NPIs persist
and fail at first claim. **Fix:** reuse `isValidNpi()` in the onboarding schemas.

---

## P2 — Defense-in-depth / polish

- **Unrestricted-admin blast radius** *(reframed — see Corrections):* the
  `/api/configs/[id]*` and `/api/migration-profiles/[id]` routes are gated by
  `requireImplementationAdmin()`, which is **unrestricted by design**. Not an IDOR,
  but there's no org-scoping, so a compromised internal admin account exposes all
  tenants. Consider optional org-scoping + per-action audit for least privilege.
- **Thin-summary disclosure:** `by-practice` returns specialty + modality list to
  *any* signed-in user for *any* practiceId (`route.ts:88-91`). Low-sensitivity, but
  add an org/relationship check.
- **Middleware coverage:** `/api/orgs` and `/api/practices` are protected in-handler
  but not by the `isControllerSurface` matcher in `src/middleware.ts`, so they 403
  raw instead of redirecting — cosmetic inconsistency.
- **PHI at rest:** migration `sourcePayload` JSON stores patient fields in plaintext
  with no TTL/cleanup (`prisma/schema.prisma`). Encrypt + expire staged data before
  the real importer ships.
- **Step completion checks** (`src/lib/onboarding/wizard-steps.ts:132,143`) accept
  empty template arrays as "complete."
- **Imaging store** (`src/lib/domain/medical-imaging-store.ts`) is a process-global
  in-memory store with no org field — currently demo data, but unsafe to populate
  with real studies. Outside the onboarding path; flagged for awareness.

---

## Corrections to agent findings (verified against source)

Two slices reported cross-tenant **P0 IDORs** on `/api/configs/[id]*` and
`/api/migration-profiles/[id]`. **Downgraded to P2.** `requireImplementationAdmin`
accepts `super_admin`/`implementation_admin`, documented in
`src/lib/auth/super-admin.ts:11-17` as *"LeafJourney internal — unrestricted… they
steward all practices."* Cross-org access by that role is **intended**, not a
boundary break. The residual concern is blast radius of a compromised internal
account (defense-in-depth), not a tenant-isolation bug. The step-8 "role-override
privilege-escalation" finding was likewise speculative (the actor is already an
unrestricted admin; roles are applied via invitation, not the draft) — noted, not a
blocker.

---

## Recommended sequencing

1. **P0-1** publish-gate hardening (providers + templates + NPI) — *the* blocker.
2. **P0-2** PATCH draft-only guard.
3. **P1-1** practice-admin config view (org-id fix).
4. **P1-2** migration org-ownership check (before any real importer).
5. **P1-4/P1-6** uniqueness + atomic creation + NPI Luhn (schema migration).
6. Remaining P1s, then P2 hardening.
7. **Backfill tests** for the publish gate, creation routes, and access scoping —
   none exist today.

Items 4–5 involve schema migrations and product decisions (what's *mandatory* to go
live) and should not be auto-applied without sign-off.
