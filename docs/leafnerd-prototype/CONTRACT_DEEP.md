# Leafnerd — Deep Build Contract (Phase 2) — READ FIRST

Phase 1 shipped the SPA shell + Overview / FHIR Explorer / AI Insights / Cohort / Claims.
Phase 2 makes the **six Clinical rail surfaces real** (they currently render a
`<Placeholder/>`) and **fully re-skins Cohort + Claims** to the botanical theme.

Read `docs/leafnerd-prototype/BUILD_CONTRACT.md` first (TSX rules, `.ln-root` CSS
scoping, "use client", `useId` not Math.random, faithful markup). All of it still applies.

Data contract: `src/lib/leafnerd/types.ts` — now includes `EncounterRow`,
`ObservationRow`, `ConditionRow`, `MedicationRow`, `LabRow`, `LabMarker`, and
`LeafnerdClinicalData`. Import these; do not redefine.

## CARDINAL RULE (unchanged)
Every surface renders beautifully with **zero props** — default each list to a small
curated fallback so the demo can never look empty or throw.

## Reuse, don't reinvent
- The theme already defines `.page`, `.page-head`, `.eyebrow`, `.page-title`,
  `.page-lede`, `.tbl-wrap`, `.tbl`, `.tbl-tools`, `.badge`, `.norm-section`,
  `.norm-card`, `.kv`, `.chip`, `.between`, `.wrap-gap`. **Use these classes** — do
  NOT add new CSS files.
- Import primitives from `./primitives` (`Icon`, `Badge`, `Conf`), and
  `JsonView`, `ProvSteps`, `ValItem`, and the `DrawerPayload` type from `./Drawer`.
- Mirror the table markup in `widgets.tsx` `PatientTable` (`.tbl-wrap` → `.tbl-tools`
  → `<table className="tbl">` with sortable `<th>` and clickable `<tr>`).

## The drawer for new surfaces — `openRecord`
LeafnerdApp will pass `openRecord: (payload: DrawerPayload) => void` to each new
surface. A surface builds its own detail payload and calls `openRecord(payload)`:
```ts
openRecord({
  kind: "record",                 // unknown kind → Drawer shows a single "Detail" tab
  tag: "Encounter",
  title: row.reason ?? "Office visit",
  sub: <>{row.patientName}<span className="dotsep">·</span>{row.modality}</>,
  render: () => (<div className="norm-section"><div className="nh">…</div>
                  <div className="norm-card"><dl className="kv">…</dl></div></div>),
});
```
(The `Drawer` already falls back to a single `[["summary","Detail"]]` tab for unknown
kinds — no change to `buildDrawer` needed.)

---

## File ownership (create ONLY your files)

### Agent A — server data module
`src/lib/leafnerd/clinical-surfaces.ts` (server-only, NO "use client"; mirror the
lazy-prisma + try/catch pattern in `server-data.ts`):
- `export async function getLeafnerdClinicalData(): Promise<LeafnerdClinicalData>`
- Resolve the demo org by slug `leafnerd-demo`. Query, scoped to it, with `take` limits
  (patients ~60, others ~40), mapping each Prisma row → the contract row type:
  - **patients** → `PatientRow[]` — map `patient.intakeAnswers` JSON
    (`cohort`, `riskScore`→score, `riskLevel`→risk, `hcc`, `openGaps`→gaps,
    `identityMatch`→match, `source`) + computed age from `dateOfBirth`. Compute
    `lastEnc` from the patient's latest encounter (e.g. "3d") or "—".
  - **encounters** → `EncounterRow[]` (include patient name + provider name if present)
  - **observations** → `ObservationRow[]` (pull `loinc`/`value`/`unit` from `evidence` JSON)
  - **conditions** → `ConditionRow[]` (from `PastMedicalCondition`)
  - **medications** → `MedicationRow[]` — set `unmapped=true` when `notes` contains an
    unmapped local code (e.g. mentions "local vocab" / "MTF1000" / "unmapped")
  - **labs** → `LabRow[]` from `LabResult` (likely EMPTY — the seed does not create
    LabResult rows; **provide a curated fallback of ~8 believable lab rows** so the
    surface is never empty)
- EVERY query in its own try/catch; on any failure return a curated demo fallback for
  that list. The function NEVER throws and ALWAYS returns a full `LeafnerdClinicalData`.
- READ `prisma/schema.prisma` for exact field names/enums and `scripts/seed-leafnerd-demo.ts`
  for what was actually seeded before writing queries. Do not guess field names.

### Agent B — three list surfaces
`src/components/leafnerd/fhir-intelligence/PatientsSurface.tsx`,
`EncountersSurface.tsx`, `ObservationsSurface.tsx` (each "use client"):
- `PatientsSurface({ rows, openDrawer }: { rows?: PatientRow[]; openDrawer: { patient:(p:PatientRow)=>void } })`
  — render a `.page` header (eyebrow "Clinical", title "Patients", lede) then the
  existing `PatientTable` (`import { PatientTable } from "./widgets"`) with
  `patients={rows ?? FALLBACK}` and `onOpen={openDrawer.patient}`.
- `EncountersSurface({ rows, openRecord }: { rows?: EncounterRow[]; openRecord:(p:DrawerPayload)=>void })`
  and `ObservationsSurface({ rows, openRecord }: { rows?: ObservationRow[]; openRecord })`
  — `.page` header + a `.tbl` table; clicking a row calls `openRecord(...)` with a
  detail payload (use `.norm-section`/`.kv`). Observations: color severity with `Badge`
  (urgent/concern→rose, notable→amber, info→green); show LOINC + value when present.

### Agent C — three more list surfaces
`ConditionsSurface.tsx`, `MedicationsSurface.tsx`, `LabsSurface.tsx` (each "use client",
same `({ rows, openRecord })` shape as B's table surfaces):
- Conditions: columns Patient / Condition / Onset / Source; detail shows notes.
- Medications: columns Patient / Medication / Type / Dosage / Prescriber / Mapping.
  When `unmapped`, show a rose `Badge` "unmapped" and in the detail drawer add a
  ValItem-style "Action needed — map to RxNorm" block (this is the data-quality story).
- Labs: columns Patient / Panel / Received / Flag / Review. Detail lists `markers`
  (name / value / unit, abnormal in rose). Always has the curated fallback from Agent A
  (and its own internal fallback too).

### Agent D — deep re-skin of Cohort + Claims
Improve `CohortSurface.tsx` and `ClaimsSurface.tsx` so the embedded
`CohortSimulator` / `ClaimsWorkbench` fully match the botanical look (not just the
variable bridge). Read those two components and the current wrappers. Prefer mapping the
leafmart CSS variables the components actually consume to botanical hex values from
`leafnerd-theme.css` (cream/paper/forest/canopy/ink/line/amber/rose). If specific
controls (buttons, inputs, result cards) still look off-theme, override them with scoped
`.ln-root` rules added to `leafnerd-theme.css` (append a clearly-commented section;
keep everything under `.ln-root`). Do NOT edit `CohortSimulator.tsx`/`ClaimsWorkbench.tsx`
themselves — only the wrappers (+ optionally appended scoped CSS). Keep the existing
demo fallbacks. Goal: a viewer can't tell these were a different theme.

---

## What the orchestrator wires (do NOT do this yourself)
The orchestrator will: extend `LeafnerdApp` nav→surface mapping (`patients`/`encounters`/
`observations`/`conditions`/`medications`/`labs` → the new surfaces, passing
`openRecord` + the clinical lists), add `openRecord` to LeafnerdApp, and extend
`page.tsx` to fetch `getLeafnerdClinicalData()`. Just expose the exact exports/signatures
above.
