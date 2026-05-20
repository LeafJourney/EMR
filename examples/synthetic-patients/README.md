# Synthetic Patient Exemplars

Hand-authored FHIR R4 `Bundle` documents used as canonical test fixtures
for LeafBridge.

These are deliberately small, readable, and clinically coherent. They are
the fixtures of record for unit + integration tests that need a complete
patient narrative; population-scale synthetic data is generated
out-of-band via Synthea (see [ADR-014](../../leafbridge/docs/architecture/adr/ADR-014-synthetic-data-strategy.md)).

## Bundles

| File | Narrative |
| --- | --- |
| [`patient-001-chronic-pain.json`](patient-001-chronic-pain.json) | 54-year-old female with chronic lumbar pain managed with a CBD-dominant regimen; weekly outcome scales captured. |
| [`patient-002-insomnia.json`](patient-002-insomnia.json) | 38-year-old male with sleep-onset insomnia using a THC + CBN nighttime formulation; tracked dose-response over 6 weeks. |

## Loading

```sh
pnpm run load:synthetic                 # both bundles, into the dev DB
pnpm run load:synthetic --file path.json # one bundle from disk
```

The loader is idempotent: running it twice does not produce duplicate
rows. Every row inserted is tagged with `bundle:patient-001-chronic-pain`
(or equivalent) so a teardown can target a single bundle.

## Authoring conventions

- Stable, descriptive `id` fields (`patient-001`, `obs-pain-001`, etc.).
- Cannabis-specific extensions live under
  `http://leafjourney.com/fhir/StructureDefinition/*`.
- Dates are anchored at `2026-01-01T00:00:00Z` — shift them at load time
  if you need recent data.
- Names, addresses, and identifiers are obviously synthetic and never
  match a real registry.
