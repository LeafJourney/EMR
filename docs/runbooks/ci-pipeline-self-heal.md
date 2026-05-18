# CI/CD pipeline — self-heal runbook

This is the operator's guide to the staging-to-production pipeline and the
triage layer that sits on top of it. Read this before you touch a
red main, before you mute a failing test, or before you wonder why a
deploy is "stuck."

## Pipeline shape

```
push to main
  └─ Staging & Production Pipeline   (.github/workflows/staging-to-prod.yml)
       ├─ verify              typecheck + lint           ~3 min
       ├─ deploy_staging      Render hook + /api/health   ~3 min
       ├─ test_staging        Playwright vs staging      ~5–15 min
       └─ deploy_production   Render hook + /api/health   ~3 min   ← only runs if all of the above passed
```

`deploy_production` has `needs: test_staging`. There is no parallel "deploy
on push" workflow. A red anywhere in the chain stops prod from shipping.

## What happens when the pipeline goes red

A second workflow — `staging-test-triage.yml` — fires on every completed
run of the main pipeline. If the conclusion is `success`, it does nothing.
If it's `failure` and the branch is `main`, it:

1. Identifies which job failed.
2. Parses the failed Playwright tests out of the run's log archive
   (`scripts/parse-playwright-failures.js`).
3. Reads the merge commit's touched paths.
4. Pipes all of that into `scripts/triage-staging-failure.ts`, which
   classifies the failure and returns one of three actions.

### Action: `rerun`

The failure signature matches a known transient pattern — Playwright
test-timeout, target-page-closed, `net::ERR_CONNECTION_RESET`,
`ECONNRESET`, `ETIMEDOUT`, `EAI_AGAIN`. Triage calls the GitHub API to
rerun just the failed jobs.

- Cap: `RERUN_BUDGET = 2` (in `scripts/triage-staging-failure.ts`).
- After the budget is spent on the same signature, triage upgrades the
  classification to `autofix` so we stop reflexively retrying.

### Action: `autofix`

The failure is real (not a flake) AND lives on a non-sensitive surface
(public marketing, leafmart storefront, education routes — and the diff
didn't touch auth / RBAC / Prisma / middleware / role-group pages).

Triage opens (or comments on) an issue labelled `autofix-needed`. The
issue body contains:
- A link to the failed pipeline run.
- The failed tests as JSON.
- The list of files the merge commit touched.
- A stable failure signature so a repeat of the same failure
  consolidates onto the same issue instead of spamming.

**You (or a follow-on Claude task) should:**
1. Read the issue.
2. Push a fix to `claude/autofix-<signature>`.
3. Open a PR against `main`.
4. When that PR merges, its pipeline run re-triggers triage. A green run
   closes the issue automatically (TODO: not wired yet — close manually
   for now).

### Action: `escalate`

The failure is on a sensitive surface, OR the merge touched a sensitive
path. Sensitive means any of:

**Test surface** — `/portal`, `/clinic`, `/ops`, `/admin`, `/onboarding`,
`/sign-in`, `/sign-up`. Or the failure trace mentions an API at `/api/auth`,
`/api/imaging`, `/api/billing`, `/api/configs`, `/api/webhooks`,
`/api/admin`, `/api/leafmart/checkout`.

**Diff** — any change under `src/lib/auth/**`, `src/lib/rbac/**`,
`src/lib/db/**`, `src/middleware.ts`, `prisma/schema.prisma`,
`prisma/migrations/**`, `src/app/api/(auth|admin|configs|webhooks|imaging|billing)/**`,
or any of the `(clinician)/`, `(operator)/`, `(patient)/`, `(super-admin)/`
route groups.

Triage opens (or comments on) an issue labelled `pipeline-escalate`. **No
autofix is attempted.** A human reviewer must:

1. Read the diff in the merge commit.
2. Decide: roll back, or land a forward-fix.
3. Drive the next pipeline to green.
4. Close the issue.

## Why two labels matter

`autofix-needed` is safe automation territory. A workflow or an agent that
auto-pushes a fix to a branch and opens a PR is fine for these — the PR
itself still has to pass the pipeline, so prod is never at risk.

`pipeline-escalate` is the opposite: the kind of failure where an
automated fix could cause real harm (silently weakening an auth gate,
masking a PHI leak by adjusting an assertion). These deserve a human read
of the diff before any code is written.

## Where the heuristics live

- Routing decisions: `scripts/triage-staging-failure.ts` — pure function,
  unit-tested in `scripts/triage-staging-failure.test.ts`.
- Workflow wiring: `.github/workflows/staging-test-triage.yml`.
- Log parsing: `scripts/parse-playwright-failures.js`.

Tweaking a heuristic is a code change with a test attached. If you find
a class of failure that's being mis-routed, add a case to the test file
first and watch it fail; then change the classifier.

## Required GitHub secrets

| Secret | Used by | Purpose |
|---|---|---|
| `RENDER_STAGING_DEPLOY_HOOK` | `deploy_staging` | trigger Render staging build |
| `RENDER_PRODUCTION_DEPLOY_HOOK` | `deploy_production` | trigger Render prod build |
| `STAGING_URL` | `deploy_staging`, `test_staging` | `/api/health` poll + Playwright base URL |
| `PRODUCTION_URL` | `deploy_production` | `/api/health` poll |
| `TEST_USER_EMAIL`, `TEST_USER_PASSWORD` | `test_staging` | authed E2E flows |
| `GITHUB_TOKEN` | triage workflow | (provided automatically) |

## Manual override

If you need to deploy to production despite a red pipeline (genuine
emergency, e.g. a security hotfix where a single test is the broken thing):

1. Hit the Render production deploy hook directly from the Render
   dashboard.
2. **Open an incident note** in `docs/incidents/` describing why the
   gate was bypassed.
3. File a follow-up to either fix the test or revert the bypass.

There is intentionally no "deploy anyway" button in the GitHub UI. We
want the override to feel deliberate.
