# Clinical Golden Fixtures

This directory contains versioned reference SOAP-note exemplars used as the
acceptance fixtures for note-authoring features.

## What lives here

Each fixture is a Markdown file capturing a complete SOAP note in the exact
shape the EMR is expected to produce. The fixtures are intentionally
**hand-curated and frozen** — changing them is a semantic versioning event for
the note-authoring stack.

| File | Variant | Purpose |
| --- | --- | --- |
| `maya-reyes-pain-mgmt-v1.md` | Full (with cannabis meds) | Reference exemplar — all SOAP rules from EMR-704 are demonstrated. |
| `maya-reyes-pain-mgmt-v1-no-cannabis.md` | Stripped | Pain-Management-non-cannabis-only — the acceptance fixture for the Pain-Management v1 gate. |

## Features consuming these fixtures

- **EMR-697** — voice-chart `Draft Note` bubble must render the full fixture verbatim from spoken input.
- **EMR-704** — ICD-10 capture per problem, A+P merge for chronic, vitals
  `original >> (repeat) new` syntax, 5–10 word acute-issue assessment summary.
- **EMR-703** — `/blood pressure`, `/blood glucose`, `/shoulder pain`,
  `/cholesterol` slash-commands must produce the verbatim Plan paragraphs.
- **EMR-702** — `/labs` slash-pull must render the Objective lab section with
  the `Hemoglobin A1c: 7.4% (5/16). Previous: 7.1% (2/14).` trended format.
- **EMR-701** — medication category bubbles (Rx / cannabis / OTC / supplement /
  Controlled, stackable) must apply to every line in the medication list.
- **EMR-705** — health-maintenance items + follow-up scheduling must appear on
  the patient's preventive-care surface with the correct ICD-10 linkage.

## Updating a fixture

Treat any edit to a `vN.md` fixture as a breaking change. Bump to `vN+1` and
keep the prior version in place until every consumer is migrated. The
`-no-cannabis` variant must always be a strict subset of its parent (same
sections, fewer rows).
