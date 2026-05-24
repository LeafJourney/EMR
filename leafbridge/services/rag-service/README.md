# rag-service

**Module 7.** Patient-context retrieval. FHIR resource retrieval, document
chunking, vector index, time + specialty filters, consent-aware retrieval.

## Principles

- **No naked prompts.** Every output cites patient-specific source data.
- **Minimum necessary context.** Retrieval is filtered by the agent's
  `allowed_data_classes` *before* it hits the index.
- **Structured beats embeddings.** When the structured FHIR answer exists,
  return it. Embeddings only when freeform text retrieval is needed.
- **Consent-aware.** Every retrieval call passes through the policy-gateway.
  An unauthorized agent's request is provably blocked.

## Indexes

- `fhir_resources` — Postgres + pg_trgm + JSONB
- `documents` — chunks in Qdrant, embedding model swappable
- `notes` — clinician-authored notes, separate sensitive-data namespace

## Filters

- Tenant
- Patient
- Time window
- Resource types
- Data classes (allowed only)
- Sensitive-data segmentation (drop unless explicit consent)
