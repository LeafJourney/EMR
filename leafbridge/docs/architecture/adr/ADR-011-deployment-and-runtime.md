# ADR-011: Deployment topology, runtimes, edge boundary

- **Status:** Proposed
- **Date:** 2026-05-20
- **Owners:** @scwayman1

## Context
We need a deployment story that supports per-tenant SLAs, fast CI, and
HIPAA-friendly data residency without inventing custom infra.

## Decision
- Web + API: Next.js on Render. Two services: `prod` and `staging`.
- Workers: `src/workers/**` runs as a separate Render service consuming
  `AgentJob` rows.
- Crons: `src/app/api/cron/**` routes triggered by Render cron with a
  shared HMAC-signed token.
- Edge runtime: avoided for any path that touches Prisma or PHI. Edge
  is used only for static OG image generation and similar pure-render
  surfaces.

## Consequences
- Pro: one cloud provider, one IAM story, one billing line.
- Pro: predictable per-service scaling.
- Con: cold starts on Render's free-tier preview services.
- Con: cron drift is the operator's responsibility (no exact-once).

## Alternatives considered
- Vercel. Rejected: pricing + BAA posture vs. Render at our stage.
- AWS ECS/Fargate. Deferred: viable but unnecessary YAGNI right now.
