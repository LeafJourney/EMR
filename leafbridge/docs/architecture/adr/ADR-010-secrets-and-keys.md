# ADR-010: Secrets, encryption keys, and field-level encryption

- **Status:** Proposed
- **Date:** 2026-05-20
- **Owners:** @scwayman1

## Context
We store fields that are sensitive but must remain queryable (EIN, NPI),
fields that must be encrypted at rest beyond disk-level (tax IDs,
some patient identifiers), and fields the application must never see in
plaintext outside of redacted views.

## Decision
- Process secrets live in environment variables (Render, GitHub Actions,
  local `.env.local`). `.env.example` documents the contract.
- App-level field encryption uses AES-GCM with a key from
  `APP_DATA_ENCRYPTION_KEY`. Ciphertext is `iv||tag||ct`, base64.
- Encrypted fields are typed as ciphertext (`Bytes` or `String` of
  base64), never as plaintext. Decryption only happens in dedicated
  helpers (`decryptTaxId()`, etc.).
- Key rotation is supported by a `keyVersion` prefix on the ciphertext.

## Consequences
- Pro: a DB dump alone does not yield plaintext PII.
- Pro: rotation is non-breaking via `keyVersion`.
- Con: indexing/encrypted-equality requires deterministic encryption,
  which we explicitly do not use here — querying these fields requires
  decrypted in-memory comparison.

## Alternatives considered
- Whole-DB transparent encryption only. Rejected: insufficient against
  app-layer exfil.
- Vault / KMS-managed envelope encryption. Deferred: viable next step
  when we go through SOC 2 Type II.
