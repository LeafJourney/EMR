# Security tests

Phase 0 stub. Planned tests:

- `tenant-isolation-rls.spec.ts` — Postgres RLS smoke
- `tenant-isolation-schema.spec.ts` — cross-schema access rejected
- `tenant-isolation-namespace.spec.ts` — cross-namespace traffic dropped
- `audit-chain-replay.spec.ts` — Merkle chain verifies end-to-end
- `policy-denies-out-of-policy-write.spec.ts` — write-back outside
  `writeback_policy.allowed_resources` is denied
- `agent-modality-bleed.spec.ts` — a cannabis-medicine-gated agent does
  not appear in a Pain Management practice with the modality disabled
