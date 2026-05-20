# ADR-013: LeafBridge open-source license (Apache-2.0)

- **Status:** Accepted
- **Date:** 2026-05-20
- **Owners:** @scwayman1

## Context
LeafBridge is the substrate (FHIR, terminology, agents, orchestrator,
policy, workbench) that we intend to release as open source. The
LeafJourney-branded clinical / commercial surfaces built on top remain
proprietary. We need a license that:

1. Permits commercial use, including derivative commercial EMRs.
2. Grants explicit patent rights so adopters are protected.
3. Survives the merge of contributions from outside contributors.
4. Plays cleanly with the dependency licenses we already pull in
   (Next.js MIT, Prisma Apache-2.0, React MIT, Clerk EULA, etc.).
5. Does not impose copyleft obligations on the commercial surface.

## Decision
Use **Apache License 2.0** for the LeafBridge open-source release.

- Add `LICENSE` (Apache-2.0 text) and `NOTICE` (attribution) at the
  repository root.
- Boundary between open-source and proprietary code is documented in
  `docs/commercial-boundary.md`.
- Trademarks ("LeafJourney", "LeafBridge", the LeafJourney logo) are
  reserved per LICENSE §6 — descriptive use only.

## Consequences
- Pro: permissive, well understood by enterprise adopters.
- Pro: explicit patent grant + retaliation clause.
- Pro: compatible with the rest of our dependency graph.
- Con: derivative commercial EMRs can compete with us using LeafBridge —
  this is intentional; the moat is the LeafJourney clinical surface,
  not the substrate.

## Alternatives considered
- MIT. Rejected: no explicit patent grant.
- GPL / AGPL. Rejected: copyleft would either infect the commercial
  surface or force a dual-license posture we don't want to operate.
- BSL (Business Source License). Rejected: hostile to adopters; not
  a true OSS license.
