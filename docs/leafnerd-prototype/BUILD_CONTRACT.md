# Leafnerd "FHIR Intelligence" — Build Contract (READ FIRST)

We are porting a polished static React prototype into the live Next.js EMR at
the `/leafnerd` route, for an **investor demo**. The prototype is the pixel-exact
design spec. Your job is a **faithful port** — preserve the prototype's markup,
class names, and visual structure exactly; only adapt it to Next/TSX and swap the
mock `window.LN` data for the typed props described here.

## Prototype source (your reference — port from these)
- `docs/leafnerd-prototype/theme.css`   → design tokens + all component CSS
- `docs/leafnerd-prototype/ui.jsx`       → Icon, Badge, Conf, Sparkline, Gauge, BarsH, AreaChart
- `docs/leafnerd-prototype/widgets.jsx`  → RiskBadge, InsightCard, PatientTable
- `docs/leafnerd-prototype/drawer.jsx`   → Drawer, JsonView, ProvSteps, ValItem, buildDrawer
- `docs/leafnerd-prototype/overview.jsx` → OverviewPage (+ MetricCard, AnomalyRow, OppRow)
- `docs/leafnerd-prototype/fhir.jsx`     → FhirPage (split-pane explorer)
- `docs/leafnerd-prototype/app.jsx`      → App shell, Rail, CommandBar, AiPage, Placeholder
- `docs/leafnerd-prototype/data.jsx`     → the mock data object (window.LN)

## Data contract (single source of truth)
`src/lib/leafnerd/types.ts` — already written. Import types from
`@/lib/leafnerd/types`. Do **not** redefine these shapes.

---

## CARDINAL RESILIENCE RULE
**Every surface and the SPA must render beautifully with ZERO props / no DB.**
This is a live investor demo — nothing may ever render empty or throw.
- Each surface accepts its data as optional props and **falls back to internal
  demo data** when props are absent or empty.
- The server analytics layer always returns a full, believable payload even if
  every DB query fails (try/catch → deterministic demo data).
- No `Math.random()` for anything that affects render output (breaks SSR
  hydration). Use `React.useId()` for SVG gradient ids; use stable values
  everywhere else.

---

## File ownership (do not create files outside your list)

Target dirs (already created):
- `src/components/leafnerd/fhir-intelligence/`  (UI)
- `src/lib/leafnerd/`                            (data/types)
- `scripts/`                                     (seed)

All UI components are React client components: **first line must be** `"use client";`
(except `types.ts` and `analytics.ts`, which are server-safe / pure).

### Exact exports required (other agents import these by name — do not rename)
- `primitives.tsx`  → `Icon`, `Badge`, `Conf`, `Sparkline`, `Gauge`, `BarsH`, `AreaChart`
- `widgets.tsx`     → `RiskBadge`, `InsightCard`, `PatientTable`
- `Drawer.tsx`      → `Drawer`, `JsonView`, `ProvSteps`, `ValItem`, `buildDrawer`
- `Overview.tsx`    → `OverviewSurface`
- `FhirExplorer.tsx`→ `FhirExplorerSurface`
- `AiInsights.tsx`  → `AiInsightsSurface`
- `Rail.tsx`        → `Rail`;  `CommandBar.tsx` → `CommandBar`;  `Placeholder.tsx` → `Placeholder`
- `LeafnerdApp.tsx` → `LeafnerdApp` (also default export)
- `CohortSurface.tsx` → `CohortSurface`;  `ClaimsSurface.tsx` → `ClaimsSurface`
- `analytics.ts`    → `getLeafnerdData(): Promise<LeafnerdData>`, `DEMO_DATA: LeafnerdData`

### Import conventions
- Primitives:  `import { Icon, Badge, Conf, Sparkline, Gauge, BarsH, AreaChart } from "./primitives";`
- Widgets:     `import { InsightCard, PatientTable, RiskBadge } from "./widgets";`
- Drawer bits: `import { JsonView, ProvSteps, ValItem } from "./Drawer";`
- Types:       `import type { LeafnerdData, Metric, ... } from "@/lib/leafnerd/types";`

---

## CSS scoping — CRITICAL (porting theme.css → `leafnerd-theme.css`)
The prototype's class names are generic (`.card`, `.search`, `.grid`, `.badge`,
`.page`, `.toast`, `.content`, `.main`). Imported globally they would collide
with the rest of the EMR in both directions. **Scope everything under `.ln-root`.**

Transform every rule in `theme.css`:
- `:root { --tokens }`           → `.ln-root { --tokens }`
- `html, body { ... }` / `body`  → `.ln-root { ...font/background/color... }`
- `* { box-sizing }`             → `.ln-root * { box-sizing: border-box; }`
- `#root { height:100vh }`       → `.ln-root { height: 100%; }`
- `::selection`                  → `.ln-root ::selection`
- `*::-webkit-scrollbar*`        → `.ln-root *::-webkit-scrollbar*`
- every component selector `.x`  → `.ln-root .x`  (prefix all of them)
- `@keyframes pulse|fade|slidein`→ rename to `ln-pulse|ln-fade|ln-slidein` and
  update the `animation:` references that use them
- media queries: keep, but prefix the inner selectors with `.ln-root`

The SPA's outermost element gets `className="ln-root"`. Inside it, keep the
prototype's class names unchanged. (`.ln-root .card` out-specifies any global
`.card`, so this both contains and protects the styles.)

---

## TSX conversion rules (apply to every ported component)
1. `"use client";` as the first line of every component file.
2. Replace `window.Icon` / `window.Badge` / etc. with proper imports.
3. Replace `window.LN` reads with the `data` prop (typed `LeafnerdData`).
4. SVG gradient ids: `const id = "ac" + Math.random()...` → `const id = React.useId();`
   (or `useId()` after `import { useId } from "react"`). Same for Sparkline/AreaChart.
5. Toast timeout in the shell: replace `window.__lnT` global with a `useRef`.
6. Type all props. Use the contract types. `style={{...}}` numeric values are fine
   in React. Keep inline styles as-is from the prototype.
7. The reference `.jsx` files already use correct Unicode (· — → ≥ ↓ × ⌘ … ▲▼↕).
   Preserve them; do not reintroduce HTML entities except where the prototype
   already uses them (`&amp;` inside JSON viewer escaping).
8. Match the prototype's output **exactly** — same DOM structure, same classes.

---

## SPA wiring (LeafnerdApp — agent building app.jsx)
Port `app.jsx`'s `App` into `LeafnerdApp(props: LeafnerdAppProps)`. State:
`active` (default `"overview"`), `drawer`, `toastMsg` (+ `toast()` via useRef).

`openDrawer` object (built in LeafnerdApp, passed to surfaces):
```ts
const openDrawer = {
  fhir:    (r) => setDrawer(buildDrawer.fhir(r)),
  patient: (p) => setDrawer(buildDrawer.patient(p, data)), // patient builder needs data
  metric:  (m) => setDrawer(buildDrawer.metric(m)),
  anomaly: (a) => setDrawer(buildDrawer.anomaly(a)),
  insight: (i) => setDrawer(buildDrawer.insight(i)),
};
```

**nav id → surface mapping** (replaces the prototype's overview/fhir/ai-only switch):
- `overview`            → `<OverviewSurface data={data} openDrawer={openDrawer} toast={toast} />`
- `fhir`                → `<FhirExplorerSurface data={data} toast={toast} />`
- `ai`                  → `<AiInsightsSurface data={data} openDrawer={openDrawer} toast={toast} />`
- `claims`             → `<ClaimsSurface anomalies={props.claims} />`
- `risk` and `analytics`→ `<CohortSurface statusCounts={props.cohortStatusCounts} />`
- anything else         → `<Placeholder id={active} />`

`fullBleed` (no padding / block layout) applies to `fhir`, `claims`, and `risk`/
`analytics` surfaces (they manage their own scroll), exactly like the prototype
does for `fhir`. Rail receives `nav={data.nav}`. Use the real `userName` prop in
the rail footer if provided (fall back to "Dr. Reyes / Population Health Lead").

## Drawer builder note (agent building drawer.jsx)
`buildDrawer.patient(p, data?)` must take optional `data: LeafnerdData` and use
`data?.fhirResources.find(x => x.type === "Patient")` instead of `window.LN`.
All other builders are unchanged from the prototype.
