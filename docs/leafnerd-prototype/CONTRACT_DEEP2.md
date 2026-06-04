# Leafnerd — Deep Build Contract (Phase 3) — READ FIRST

Phase 1 = SPA shell + Overview/FHIR/AI/Cohort/Claims. Phase 2 = 6 real Clinical surfaces.
Phase 3 turns the last two Intelligence placeholders real, makes the FHIR Explorer show
genuinely-mapped real FHIR, and wires "Ask Leafnerd".

Read `docs/leafnerd-prototype/BUILD_CONTRACT.md` first (TSX rules, `.ln-root` CSS scoping,
"use client", `useId` not Math.random, reuse existing theme classes, never add CSS files).
The CARDINAL RULE still holds: **every surface renders fully with zero props** (curated fallback).

Data contract: `src/lib/leafnerd/types.ts` — now includes `QualityMeasureRow` and `quality?`
on `LeafnerdAppProps`. The existing `FhirResource` type is reused for real FHIR. Import these.

Reuse: `.page/.page-head/.eyebrow/.page-title/.page-lede`, `.tbl/.tbl-wrap`, `.card/.card-pad`,
`.norm-section/.norm-card/.kv`, `.grid/.g-3/.g-2`, `.badge`, `.between`, `.wrap-gap`,
`.sec-title`, `.headline`, `.fresh`. Import `Icon, Badge, Conf, Sparkline, Gauge, BarsH,
AreaChart` from `./primitives`. The orchestrator does all LeafnerdApp/page.tsx wiring — just
expose the exact exports below.

---

## Agent FR — real FHIR resources (server module)
`src/lib/leafnerd/fhir-real.ts` (server-only, NO "use client"):
- `export async function getRealFhirResources(): Promise<FhirResource[]>`
- Lazy-import prisma (try/catch like server-data.ts) + import the mappers from
  `@/lib/platform/fhir.ts` (READ it for the exact function names/signatures:
  `toFhirPatient`, `toFhirEncounter`, `toFhirObservation`, `toFhirMedicationStatement`).
- Resolve the `leafnerd-demo` org; pull ~6–10 patients and, for each, build genuinely-mapped
  FHIR R4 resources from their real Encounter / ClinicalObservation / PatientMedication /
  PastMedicalCondition rows. Map each into the `FhirResource` contract shape (id, type,
  label, patient, status, mapping (0..1), valid ("pass"|"warn"|"err"), profile, code, date,
  json (the real mapper output), related[], provenance[]). Derive `valid`/`mapping`
  honestly: meds with an unmapped local code → valid "err", low mapping; everything cleanly
  coded → "pass". Provenance steps should reflect the real pipeline (recorded → ingested →
  mapped → validated).
- Return ~20–40 resources across Patient/Condition/Observation/MedicationRequest/Encounter.
- NEVER throw; on any failure return `[]` (the explorer keeps its curated resources).
- Do NOT run typecheck/build. Report the function, the mappers used, and how you derive valid/mapping.

## Agent Q — Quality surface
`src/components/leafnerd/fhir-intelligence/QualitySurface.tsx` ("use client"):
- `export function QualitySurface({ rows, toast }: { rows?: QualityMeasureRow[]; toast?: (m: string) => void })`
- `.page` header (eyebrow "Intelligence", title "Quality measures", lede about HEDIS/CMS gap
  closure). Then a measures view: per measure show a `.card` with the measure name + steward
  `Badge`, a `Gauge` or rate-vs-target bar (use `BarsH`/`Conf`/`Gauge` primitives), gap count,
  reachable count, a `Sparkline` trend, and a status `Badge` (ahead→green, near→amber, behind→rose).
  Include a header strip of summary stats (open gaps total, measures behind, reachable for outreach).
  Add a row/card action "Generate outreach list" → `toast?.("Queued outreach for N patients…")`.
- Curated FALLBACK of ~6 believable measures (CDC-HbA1c, CDC-Eye, CBP controlling BP,
  COL colorectal screen, SUPD statin, AMM antidepressant adherence) with realistic
  rate/target/gaps/trend. Renders fully with zero props.

## Agent AN — Analytics workbench
`src/components/leafnerd/fhir-intelligence/AnalyticsSurface.tsx` ("use client"):
- `export function AnalyticsSurface({ toast }: { toast?: (m: string) => void })` — fully
  self-contained (define its own internal types + curated data in-file).
- `.page` header (eyebrow "Intelligence", title "Analytics Workbench", lede:
  "population → measure → trend → anomaly → save"). Build an INTERACTIVE workbench:
  a control row of `<select>`/chips to pick a Population (e.g. All, Diabetes, CHF·CKD, COPD,
  Rising-risk) and a Measure (e.g. Avg HbA1c, ED visits / 1k, Med adherence %, Care-gap rate,
  Cost PMPM). On change, render an `AreaChart` (use the primitive) of a deterministic series
  for that population×measure, plus a one-line AI-style insight and a delta `Badge`. Keep all
  series deterministic (a small in-file function of population/measure indices — NO Math.random
  affecting render; use `useId` for chart gradient ids if needed). Add a "Save cohort" button
  → `toast?.(...)`. It must look like a real analytics tool and never be empty.

## Agent CHAT — Ask Leafnerd panel
`src/components/leafnerd/fhir-intelligence/AskLeafnerdPanel.tsx` ("use client"):
- `export function AskLeafnerdPanel({ open, onClose }: { open: boolean; onClose: () => void })`
- A right-side slide-in panel (reuse the `.drawer`/`.scrim` classes from the theme, or a
  similar `.card` panel) titled "Ask Leafnerd". A scrollable message thread + an input box +
  send button + a few suggestion chips ("Which cohort has the most open HbA1c gaps?",
  "Summarize Riverside Lab anomaly", "Who needs medication review?").
- On send, POST to `/api/leafnerd/chat` with `{ message }` (READ
  src/app/api/leafnerd/chat/route.ts for the exact request/response shape) and append the
  reply. Handle loading + errors gracefully (the endpoint already has a deterministic mock
  fallback, so it always returns something). Seed the thread with a friendly greeting.
- Close on Escape and on scrim click. Renders nothing heavy when `open` is false.

All four: faithful to the botanical look, existing theme classes only, no new CSS, "use client",
no Math.random in render. Do NOT run typecheck/build. Report exact export + file path.
