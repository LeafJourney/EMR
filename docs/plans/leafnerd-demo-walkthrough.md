# Leafnerd — FHIR Intelligence · Investor Demo Walkthrough

**Branch:** `leafnerd-fhir-intelligence-demo`
**Route:** `/leafnerd` (single-page app — all surfaces switch in-page via the left rail)
**Positioning (one-liner):** *Leafnerd is a population-health intelligence layer over
FHIR — a single aperture across the whole patient panel, with provenance on every
number and AI findings that always show their receipts.*

---

## Pre-demo checklist (do this 10 min before)

1. **Run exactly ONE dev server.** Concurrent `next dev` instances share `.next` and
   cause "vendor-chunks" 500s. Kill strays, then start fresh:
   ```bash
   pkill -f "next dev"            # clear any other instances
   npm run dev                    # serves on :3000 (or next free port)
   ```
   Confirm the port in the startup log. (During build it came up on **:3001** because
   another server held :3000.)
2. **Open `/leafnerd` once and dismiss the cookie banner** ("Accept All"). It's a
   global site banner; accepting persists via cookie so it won't reappear on stage.
3. **Full-screen the browser** at ≥1280px wide. The FHIR Explorer is a 3-pane layout
   with a 1180px min width — give it room.
4. **(Optional) Confirm the seed ran** so the Cohort + Claims surfaces show real
   volume (see "Data: real vs. curated" below):
   ```bash
   npx tsx --conditions=react-server -r dotenv/config scripts/seed-leafnerd-demo.ts
   ```
   It's idempotent and isolated to a `leafnerd-demo` org — safe to re-run.

---

## The demo flow (≈6–8 minutes)

### 1. Overview — "the single aperture" (open here)
- Land on the **Executive Overview**. Read the **headline banner**: completeness rose
  to 92.4%, but a new feed left 312 meds unmapped and a lab interface dropped 41%.
  → *"One AI-written paragraph that synthesizes five signals into what a population-health
  lead actually needs to act on today."*
- Point at the **5 metric cards** (48,210 patients, data completeness, FHIR mapping
  health, open care gaps, high-risk cohort) — each with its own sparkline.
- **Click any metric card** → the **provenance drawer** slides in. Show the trend, the
  plain-language "what this means," and the **Provenance tab** (source → aggregated →
  baseline → published).
  → *"Every number on this screen is one click from its lineage. No black boxes."*
- Scroll: **clinical data volume** chart, **completeness by domain**, **AI Insights**
  preview, **recent anomalies**, **data freshness** (note the red 15:00 ingestion gap),
  and the **high-risk patient table** (sortable; click a row → patient intelligence drawer).

### 2. FHIR Explorer — "this is real interoperability" (rail → FHIR Explorer)
- The flagship technical surface. **Left:** the resource tree (Patient / Condition /
  Observation / MedicationRequest / Encounter) with live counts + a colored validity dot
  per resource. **Center:** the normalized, human-readable view with a **mapping-confidence
  meter**. **Right:** the **raw FHIR R4 JSON**, **Provenance**, and **Validation** tabs.
- Click the **Metformin (MedicationRequest)** item — it's the red one. Show the
  **"Action needed"** block: an unmapped local code `MTF1000`, RxNorm match below
  threshold, excluded from measures until mapped.
  → *"This is the data-quality story investors care about: we don't just ingest FHIR,
  we score every mapping and surface exactly what's blocking a record from analytics."*
- Click a **related-resource chip** to jump across the graph (Observation → Patient → Encounter).

### 3. AI Insights — "a smart analyst, with receipts" (rail → AI Insights)
- Three insight cards (Risk / Quality / Data integrity). Each shows the **finding**,
  **why it matters**, the **evidence** (cited FHIR resource groups), a **recommended
  action**, and a **calibrated confidence**.
- Click **"Show receipts"** on any card → the lineage drawer (signals → model reasoning →
  evidence → ranked recommendation).
  → *"The differentiator isn't that we have AI — it's that every recommendation is
  grounded in named FHIR resources with a confidence you can audit."*

### 4. Cohort Simulator — "model the population" (rail → Risk)
- Pick a cohort segment + dosing regimen, set a confidence interval, **Run Monte Carlo**.
  → *"Synthetic-profile simulation of efficacy, adverse-event probability, and optimal
  dosage — the research/reimbursement story."*

### 5. Claims Auditor — "revenue intelligence" (rail → Claims)
- Flagged billing claims (modifier-25, NCCI bundling, dx/procedure mismatch, MUE) caught
  **before the clearinghouse**, each with one-click review.
  → *"The same FHIR/clinical spine drives the money side — clean claims, fewer denials."*

### Closer
Return to **Overview**. → *"One shell, one aperture, provenance everywhere — population
health, data quality, AI, simulation, and revenue, all over a real FHIR spine."*

---

## Data: real vs. curated (so you can answer "is this real?" honestly)

**Genuinely real / live:**
- The FHIR R4 mappers (`src/lib/platform/fhir.ts`) really convert internal records to
  Patient / Encounter / Observation / MedicationStatement with LOINC / RxNorm / SNOMED / ICD-10.
- The **Cohort** segment counts and **Claims** flagged items are driven by a real,
  queryable seeded population (`scripts/seed-leafnerd-demo.ts`, ~1,200 patients + claims
  in the `leafnerd-demo` org). Patient counts are live DB queries.
- The headline metrics will overlay with live counts **when they exceed the baseline**
  (so the panel can only look bigger as real data grows).

**Curated / representative (the product vision, shown at fidelity):**
- The 48,210-patient / 2.4M-resource headline scale is illustrative of target scale.
- In the **FHIR Explorer**, the per-resource mapping-confidence %, US-Core validation
  pass/warn/error states, and provenance trails are a **presentation of the intended
  data-quality engine** — not yet output from a live validation service. Frame them as
  "this is the product," not "this is running in production today."
- The anomaly feed and AI-insight narratives are curated exemplars.

> Honest framing wins the room: "What you're seeing is the real FHIR spine and real
> queryable data, presented at the fidelity and scale we're building toward."

---

## Caveats / revert-before-production

- **Access gate is intentionally open** for the demo: `src/app/leafnerd/page.tsx` no
  longer redirects unauthenticated users (it greets a signed-in user by name if present).
  Re-enable the `leafnerd` / `super_admin` role gate before shipping.
- The route runs in **dev mode** for the demo (not a production build).
- `/leafnerd/cohorts` and `/leafnerd/claims` still exist as standalone routes from the
  earlier scaffold; the demo flow stays inside the `/leafnerd` SPA and never visits them.

## Architecture (for the curious)
- SPA shell + surfaces: `src/components/leafnerd/fhir-intelligence/` (ported from the
  prototype in `docs/leafnerd-prototype/`; scoped theme under `.ln-root` so it can't leak
  into the rest of the EMR).
- Data contract: `src/lib/leafnerd/types.ts`. Pure client-safe demo data:
  `analytics.ts` (`DEMO_DATA`). Server DB overlay: `server-data.ts` (`getLeafnerdData`).
- Server entry: `src/app/leafnerd/page.tsx` fetches data + real cohort/claims/clinical and
  mounts `<LeafnerdApp/>`.

---

## Logins for Thursday

**Login path:** `/sign-in` (e.g. `http://localhost:<PORT>/sign-in`). Clerk (dev instance),
email + password.

**Dedicated demo identity (created + Clerk-synced):**
- Email: `lena.reyes@leafjourney.com`   Password: `Longbeach2026!`
- Name: Dr. Lena Reyes · role `leafnerd` (lands on `/leafnerd`, matches the rail footer)
- Re-create / repair anytime (idempotent): `npx tsx --conditions=react-server -r dotenv/config scripts/leafnerd-demo-login.ts`

**Two ways to be logged in:**
1. **Real form (works on dev OR a `next start` prod server):** go to `/sign-in`, enter the
   credentials above, then navigate to `/leafnerd`.
2. **Dev quick-login (one click, no password — DEV server only):**
   `http://localhost:<PORT>/api/dev/login?email=lena.reyes@leafjourney.com&redirect=/leafnerd`
   Returns 403 on a production (`next start`) server — use method 1 there.

**Gotcha:** `/leafnerd` itself is open (no gate) for the demo, so it renders even when
signed out — but logging in as Dr. Lena makes the rail greet you correctly. The other
seeded accounts (`owner@demo.health` → `/ops`, `clinician@demo.health` → `/clinic`) all
use the same `Longbeach2026!` password if you want to show the wider EMR.

## Clinical rail is now LIVE (Phase 2)
The six Clinical rail surfaces are wired to the real seeded population (~1,200 patients):
- **Patients** — real roster, risk-scored, sortable, drill-in drawer
- **Encounters** — real visits w/ modality + status
- **Observations** — real obs, severity-triaged; detail drawer shows the **LOINC code + value**
- **Conditions** — real problem list
- **Medications** — real meds with the **unmapped-RxNorm** data-quality story ("N unmapped")
- **Labs** — curated fallback (the seed doesn't create lab rows), abnormal-flagged
Cohort Simulator now reads the full **~1,209 active patients**; Claims Auditor shows the
real seeded **flagged claims**. All clinical lists fall back to curated rows if the DB is
unavailable, so they never render empty.

## Intelligence depth (Phase 3)
- **FHIR Explorer** now **leads with genuinely-mapped FHIR R4** built from real seeded patients
  via `platform/fhir.ts` — the Raw JSON tab shows actual R4 output; mapping-confidence/validation
  is derived honestly (unmapped local codes → "err"). Curated resources follow.
- **Quality measures** — HEDIS/CMS measure cards (rate vs. target gauges, gap + reachable counts,
  trend sparklines, one-click outreach).
- **Analytics Workbench** — interactive population → measure → trend (live chart, insight, deltas).
- **Ask Leafnerd** — command-bar button or **⌘K** opens a chat panel wired to `/api/leafnerd/chat`,
  grounded in real counts (answers cite the live ~1,209-patient figure). Falls back to a
  deterministic mock if the model backend is unavailable, so it never dead-ends on stage.

## Production
This is built to ship to **`leafnerd.leafjourney.com`** (Render, from `main`). The `/leafnerd`
access gate is **enforced in production** (requires the `leafnerd` role — `Dr. Lena` carries it).
Full deploy steps (env vars, prod seed, prod-Clerk provisioning, smoke test) are in
**`docs/plans/leafnerd-production-runbook.md`**.
