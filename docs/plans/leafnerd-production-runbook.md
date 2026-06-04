# Leafnerd — Production Deploy Runbook (`leafnerd.leafjourney.com`)

## How it ships
- **Render deploys only from `main`.** The `leafnerd-web` service builds from `main` and
  serves **`leafnerd.leafjourney.com`** (its `startCommand` is just `npm run start` — it does
  **not** run migrations). **Merging the PR into `main` triggers an auto-deploy.**
- ⚠️ Merging to `main` ALSO redeploys `emr-web`, `emr-agent-worker`, and `emr-scheduler`
  (all pinned to `main`). `emr-web`'s start runs `prisma migrate deploy`; if the prod DB has
  migration drift that service can fail to boot — but **`leafnerd-web` is independent and will
  still serve the demo** (no migrate on start).

## Pre-merge checklist
- [x] Isolated production build verified green locally (separate worktree, didn't touch the running server).
- [x] `/leafnerd` access gate enforced in production (requires `leafnerd`/`super_admin` role).
- [x] Typecheck clean (0 errors); every surface browser-verified.
- [ ] PR opened into `main` (link added on creation).
- [ ] Render env vars set for `leafnerd-web` (below).

## Render dashboard — env vars for `leafnerd-web`
`render.yaml` marks these `sync: false`, so set them in the dashboard:
- **`DATABASE_URL`** — prod Supabase pooled connection string.
- **`OPENROUTER_API_KEY`** — powers "Ask Leafnerd". *(If unset, the chat endpoint falls back to
  a deterministic mock that still answers with real DB counts — so the demo never breaks.)*
- **Clerk (prod instance)** — `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` + `CLERK_SECRET_KEY`
  (the prod `pk_live…`/`sk_live…`). Not in `render.yaml`; set manually. **The dev `Dr. Lena`
  account does NOT carry to prod** — provision her in prod below.
- Already declared in `render.yaml`: `AUTH_PROVIDER=clerk`, `AGENT_MODEL_CLIENT=openrouter`,
  `OPENROUTER_MODEL`, `NODE_ENV=production`.

## After deploy — provision the demo on the PROD database
Open a **Render shell on `leafnerd-web`** and run (Render injects env, so no `dotenv` flag):
1. **Seed the synthetic population** (idempotent, isolated to the `leafnerd-demo` org —
   ~1,200 patients + encounters/observations/conditions/meds + ~40 flagged claims):
   ```
   npx tsx --conditions=react-server scripts/seed-leafnerd-demo.ts
   ```
2. **Provision the demo login** (creates `Dr. Lena Reyes` in the prod DB **and** prod Clerk,
   with the `leafnerd` role) — **REQUIRED**, or the prod gate sends `/leafnerd` → `/forbidden`:
   ```
   npx tsx --conditions=react-server scripts/leafnerd-demo-login.ts
   ```

## Smoke test (the live URL)
1. `https://leafnerd.leafjourney.com/sign-in` → log in `lena.reyes@leafjourney.com` / `Longbeach2026!`
2. Land on `/leafnerd`. Click **every** rail surface: Overview, Patients, Encounters,
   Observations, Conditions, Medications, Labs, Quality, Risk, Analytics, AI Insights, FHIR Explorer.
3. Open a metric → provenance drawer. Open **Ask Leafnerd** (button or ⌘K) → send a prompt.
4. Confirm **Cohort ≈ 1,209 active** and **Claims shows real flagged claims** (proves the seed ran),
   and the **FHIR Explorer leads with real patients** (Raw JSON shows real FHIR R4).

## Rollback
Revert the merge commit on `main`; Render redeploys the prior `main`. `leafnerd-web` is
independent of `emr-web`, so a Leafnerd issue never requires touching the rest of the EMR.

## Gotchas
- **Prod Clerk is a separate instance** from dev — Lena must be created there (the login script
  does it when `CLERK_SECRET_KEY` is the prod key).
- Pre-login before the demo so you never touch the sign-in screen on stage.
- Honesty framing for what's curated vs. real: see `docs/plans/leafnerd-demo-walkthrough.md`.
