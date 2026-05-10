# Index audit pass 2 — clinic dashboard hot paths

**Scope:** every \`findMany\`/\`findFirst\`/\`count\` invoked from
\`src/app/(clinician)/clinic/page.tsx\` (the mission-control
dashboard, ~17 fan-out queries per render). Pass 1 (PR #248)
covered the patient detail page; this is the second highest-traffic
clinician surface.

## Method

Same as pass 1: enumerate Prisma calls, identify their `where` /
`orderBy` shapes, compare against existing `@@index` declarations,
recommend additions where coverage is missing.

This audit was static — `EXPLAIN ANALYZE` against a live database
will refine the priority order. The 6 indexes added are conservative
covers of obvious gaps; further tuning waits for `pg_stat_statements`
data after deploy.

## Dashboard query inventory

| # | Query | Where | Order | Coverage |
|---|---|---|---|---|
| 1 | `encounter.findMany` (today) | org + scheduledFor range | scheduledFor asc | 🆕 add `(org, scheduledFor)` |
| 2 | `note.count` (drafts) | status + encounter.org | — | join through encounter; OK |
| 3 | `note.findMany` (review queue) | status IN + encounter.org | updatedAt desc | not addressed (low volume) |
| 4 | `agentJob.count` (approval queue) | org + status | — | covered by `(org, status)` |
| 5 | `messageThread.count` | patient.org + messages.some | — | covered |
| 6 | `patient.count` | org + status | — | covered by `(org, status)` |
| 7 | `encounter.count` (this week) | org + scheduledFor range | — | 🆕 same as #1 |
| 8 | `note.count` (finalized this week) | status + finalizedAt range + encounter.org | — | 🆕 covered by `(status, finalizedAt)` |
| 9 | `encounter.findMany` (recent complete) | org + status='complete' | completedAt desc | 🆕 add `(org, status, completedAt)` |
| 10 | `note.findMany` (recent finalized) | status='finalized' + encounter.org | finalizedAt desc | 🆕 covered by `(status, finalizedAt)` |
| 11 | `assessmentResponse.findMany` | patient.org | submittedAt desc | covered |
| 12 | `message.findMany` (recent) | status='sent' + thread.patient.org | createdAt desc | covered |
| 13 | `document.findMany` (recent) | org + deletedAt=null | createdAt desc | 🆕 add `(org, deletedAt, createdAt)` |
| 14 | `chartSummary.findMany` (avg readiness) | patient.org + patient.status='active' | — | 🆕 add `patientId` (model had ZERO indexes) |
| 15 | `encounter.count` ×7 (sparkline) | org + scheduledFor day-window | — | 🆕 same as #1 |
| 16 | `agentJob.findMany` (fleet bridge) | org + status IN + completedAt > 24h | completedAt desc | 🆕 add `(org, status, completedAt)` |
| 17 | `message.findMany` (pending drafts) | status='draft' + aiDrafted + thread.patient.org | — | covered |
| 18 | `clinicalObservation.findMany` (recent) | patient.org + acknowledgedAt=null + createdAt > 7d | createdAt desc | covered by pass-1 `(patientId, createdAt)` |

## Indexes added

```
Encounter_organizationId_scheduledFor_idx                        (organizationId, scheduledFor)
Encounter_organizationId_status_completedAt_idx                  (organizationId, status, completedAt)
Note_status_finalizedAt_idx                                      (status, finalizedAt)
AgentJob_organizationId_status_completedAt_idx                   (organizationId, status, completedAt)
ChartSummary_patientId_idx                                       (patientId)
Document_organizationId_deletedAt_createdAt_idx                  (organizationId, deletedAt, createdAt)
```

All six use `CREATE INDEX CONCURRENTLY` — no ACCESS EXCLUSIVE lock,
safe for prod deployment.

## Highlight: ChartSummary had ZERO indexes

The dashboard's avg-readiness widget reads every active patient's
score (capped at 500 by PR #228) and joins through `Patient`. Without
even a `patientId` index on `ChartSummary`, that join was a sequential
scan over the entire `ChartSummary` table on every dashboard render —
on a 10k-patient tenant, that's a 10k-row scan per dashboard load
multiplied by N concurrent clinicians.

This is the single biggest perf win in the audit.

## Cumulative: pass 1 + pass 2 indexes

Pass 1 (PR #248) added 5 indexes for the patient detail page.
Pass 2 adds 6 more for the clinic dashboard. **11 indexes total**
covering the two highest-traffic clinician surfaces.

## Follow-up

After this migration deploys:
1. Confirm `pg_stat_statements` enabled on the prod Postgres
2. Capture baseline mean / p95 for the 17 dashboard query shapes
3. Land migration during a low-traffic window
4. Compare 24h + 7d post-migration latency
5. Append actuals to this file
6. Move to next surface — likely `(operator)/ops/revenue/page.tsx` (938-line aggregate-heavy dashboard)
