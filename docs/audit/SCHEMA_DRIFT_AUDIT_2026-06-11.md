# Schema Drift Audit — 2026-06-11

**Trigger:** `/ops/settings/ai-config` crashes to the `/ops` error boundary in
production for the owner account, while the identical code path works in every
locally reproducible configuration (dev build, production build, seeded org,
fresh org with no practice config). The page's distinguishing feature is
unguarded Prisma reads of `PracticeConfiguration` / `Practice`. PR #638 made
the page degrade gracefully and log the real error tagged `[ai-config]`.

This audit answers: **is the production database schema in sync with the code,
and if not, what exactly is missing?**

## How production schema sync actually works (timeline)

| Era | Mechanism | Consequence |
|---|---|---|
| Until 2026-06-04 | Render dashboard-configured `startCommand` ran `prisma db push --accept-data-loss` on every boot (per README "Pipeline rules") | Schema always converged to `schema.prisma` of the deployed commit. No drift possible. |
| 2026-06-04 (`4f36da3`) | `render.yaml` created **with `startCommand: npx prisma migrate deploy`**, and 45 migration files (timestamps 2026-04-19 → 2026-06-01) batch-committed in the same commit | From the moment the dashboard/blueprint flipped, **only migration files reach production**. Any schema change without a migration file silently never ships. |
| 2026-06-06 → 2026-06-10 | 12 further migrations committed alongside features (`c78c97c`, `537971a`, `87fb003`, `7fcd3c2`, `1ffd873`, `8439a7d`, `6a7dec4`) | Applied by `migrate deploy` on each prod boot. |

Two structural facts worth knowing:

1. **The migration history cannot bootstrap an empty database.** The earliest
   migration (`20260419155934_add_charting_completed_at`) assumes `Encounter`
   already exists; no migration creates the pre-April baseline. Fresh
   environments must use `prisma db push` (as `prisma/seed.ts` workflows
   assume). This also means `prisma migrate dev`'s shadow-database replay
   fails — migrations here are hand-written, which is fine, but know it.
2. **Migrations apply over `DIRECT_URL`; the app reads `DATABASE_URL`**
   (render.yaml). If those ever point at different databases, deploys stay
   green while the app reads a stale schema. `render.yaml` still provisions a
   legacy Render Postgres (`emr-postgres`) even though comments say both URLs
   should be the same Supabase project — a standing foot-gun.

## Method

Reconstructed production locally and diffed it against the code:

1. **DB-A (prod reconstruction):** `prisma db push` of `schema.prisma` at the
   switchover commit `4f36da3` (the last state the db-push era guaranteed),
   then applied the 12 post-switchover migration SQL files in timestamp order.
   All 12 applied cleanly with zero errors — consistent with production's
   green deploys.
2. **DB-B (code expectation):** `prisma db push` of current `schema.prisma`.
3. `prisma migrate diff` between them, both directions.
4. Sanity check: DB-A *without* the 12 migrations vs DB-B shows 63 DDL
   statements — so the method detects drift when it exists.

## Findings

1. ✅ **No repo-level drift.** June-4 baseline + the 12 migrations reproduces
   the current `schema.prisma` **exactly** (empty diff both directions). Every
   schema change since the switchover has a correct migration. Migration
   discipline has been clean.
2. ✅ Therefore: **if** prod's `migrate deploy` runs against the same database
   the app reads, and the 45 batched migrations were correctly baselined at
   switchover, production's schema is in sync and the ai-config crash is NOT
   classic migration drift.
3. ⚠️ The remaining credible causes for the crash, in order of likelihood:
   - **Split-brain URLs** — `DATABASE_URL` (app, pooled) and `DIRECT_URL`
     (migrations) pointing at different databases (e.g., legacy `emr-postgres`
     vs Supabase). Symptom matches perfectly: green deploys, runtime
     "column does not exist".
   - **Bad switchover baselining** — if the first `migrate deploy` boot hit
     failures and someone ran `migrate resolve --applied` on a migration whose
     DDL had *not* actually been applied (e.g., on a DB that wasn't current),
     that DDL is permanently skipped on that database.
   - **Row-data problems** (NULL in a non-nullable column from manual SQL) or
     transient connection issues — less likely, but the `[ai-config]` log
     line will say so explicitly.

## How to settle it conclusively (runbook)

From the **Render shell on `emr-web`** (Dashboard → emr-web → Shell):

```bash
npm run db:drift-check
```

The script (`scripts/check-schema-drift.sh`) diffs the live schema behind
`DATABASE_URL` and `DIRECT_URL` against `prisma/schema.prisma`, **and** diffs
the two URLs against each other. Output is one of:

- `RESULT: no drift detected` → schema is fine; read the `[ai-config]` log
  line from the next page load for the real (data/connection-level) cause.
- `✗ SPLIT-BRAIN` → the two URLs are different databases. Fix: point both at
  the same Supabase project (DATABASE_URL = pooled :6543, DIRECT_URL = direct
  :5432) in the Render dashboard, redeploy, and re-run the check.
- `✗ ... has DRIFTED` + SQL → the printed SQL is exactly what the live DB is
  missing. Apply it via a new migration (preferred) or directly with psql,
  then re-run the check.

Also remember: any `/ops` crash now shows an **Error ID** (PR #638) that can
be matched to the server log line in Render.

## Resolution (2026-06-11, prod Render shell)

The runbook above was executed against production the same day. Findings:

- `prisma migrate status` on prod (database `postgres` at
  `aws-1-us-east-1.pooler.supabase.com:5432`): 42 migrations recorded applied,
  **15 pending, none failed** — proof that `migrate deploy` had **never run on
  boot** for this database. The effective start command was not running any
  schema sync; the last sync came from the old `db push` mechanism (~June 8).
- `prisma migrate diff` against the live DB matched the prediction: the DDL of
  9 pending migrations was already present (db-push era), while 6 were
  genuinely missing (`emr951` index, `emr724_llm_usage`,
  `emr456_migration_job_staging`, `emr1079_add_task_kind`,
  `emr1103_clinical_orders_and_coding_approval`,
  `emr1113_dose_capture_and_goals`). Until the fix, **every page reading
  `Task`, `DoseLog`, `DosingRegimen`, or `CodingSuggestion` crashed in prod** —
  all features shipped June 8–10.
- Heal: `prisma migrate resolve --applied` for the 9 already-present
  migrations, then `prisma migrate deploy` applied the 6 missing ones.
  `migrate status` now reports no pending migrations.
- Remaining operator action: set the Render dashboard **Start Command** for
  `emr-web` to `npx prisma migrate deploy && npm run start` so every future
  deploy self-heals (render.yaml already says this; the dashboard was not
  honoring it).

The staging-to-prod pipeline now carries a **Schema Drift Gate** job that
diffs staging's live schema against `prisma/schema.prisma` after every staging
deploy and blocks production on mismatch. It requires the
`STAGING_DIRECT_URL` GitHub Actions secret (staging DB direct connection
string); until that secret is set it warns and passes.

## Recommendations

1. Run `npm run db:drift-check` in the prod Render shell now (2 minutes) and
   either clear or confirm the split-brain hypothesis.
2. Remove the legacy `emr-postgres` database block from `render.yaml` once
   confirmed unused, so the two-database foot-gun goes away.
3. Consider running the drift check as a pipeline step against staging
   (post-deploy) so a desync fails loudly instead of surfacing as a page
   crash.
4. Keep the discipline that's already working: every schema change ships with
   a hand-written migration in the same PR.
