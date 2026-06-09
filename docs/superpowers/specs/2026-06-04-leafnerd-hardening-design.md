# LeafNerd Hardening Swarm Design Spec

**Date:** 2026-06-04
**Epic:** LeafNerd Hardening Swarm
**Status:** Approved

## Goal
To harden and deepen the LeafNerd single-page application experience across 10 distinct, conflict-free tracks. This sweep enhances both technical functionality (US-Core FHIR schema validation, real agent logs, secure route checks, E2E test suites) and visual depth (sparklines, SVG Monte Carlo density charts, and an interactive K-Means population clustering map in the risk stratification panel).

---

## 10 Conflict-Free Tracks

### Track 1: Overview & Metrics Dashboard (`sprint-ln-overview`)
* **Files**: 
  - `src/components/leafnerd/fhir-intelligence/Overview.tsx`
  - `src/components/leafnerd/fhir-intelligence/widgets.tsx`
* **Changes**:
  - Replace mockup sparklines with custom inline SVG path indicators.
  - Implement dynamic hovering tooltips on the clinical data volume chart and completeness breakdown.
  - Fix the click handler for metric cards to trigger the slide-out provenance drawer.

### Track 2: FHIR Explorer & Interoperability (`sprint-ln-fhir`)
* **Files**: 
  - `src/components/leafnerd/fhir-intelligence/FhirExplorer.tsx`
  - `src/lib/leafnerd/fhir-real.ts`
* **Changes**:
  - Add interactive JSON expand/collapse and styling to the Raw JSON tab.
  - Build out dynamic US-Core profile validation checks showing warning/error badges per resource.
  - Implement full graph traversal when clicking related-resource chips (Observation ↔ Patient ↔ Encounter).

### Track 3: AI Insights & Ask LeafNerd Chat (`sprint-ln-chat`)
* **Files**: 
  - `src/components/leafnerd/fhir-intelligence/AskLeafnerdPanel.tsx`
  - `src/app/api/leafnerd/chat/route.ts`
* **Changes**:
  - Add premium botanical slide-in transitions and glassmorphism styling to the chat panel.
  - Enable markdown rendering (bullets, bold, code snippets, tables) in the response stream.
  - Ground chatbot responses to cite live patient, encounter, and medication counts.

### Track 4: Cohort Monte Carlo Simulator (`sprint-ln-cohorts`)
* **Files**: 
  - `src/components/leafnerd/fhir-intelligence/CohortSurface.tsx`
* **Changes**:
  - Replace the static Monte Carlo distribution mockup with an interactive SVG density chart.
  - Shade the confidence interval boundaries dynamically on hover.
  - Add preset filters for high-risk diabetic and asthmatic patient groups.

### Track 5: Claims Auditor & Revenue Spines (`sprint-ln-claims`)
* **Files**: 
  - `src/components/leafnerd/fhir-intelligence/ClaimsSurface.tsx`
* **Changes**:
  - Add smooth CSS card expansion transitions.
  - Audit procedural/diagnosis codes matching (modifier-25, NCCI bundling, MUE limits) with detailed warnings.
  - Wire up a "Re-audit Claim" trigger showing simulated processing.

### Track 6: Quality Measures (CMS/HEDIS) (`sprint-ln-quality`)
* **Files**: 
  - `src/components/leafnerd/fhir-intelligence/QualitySurface.tsx`
* **Changes**:
  - Upgrade progress indicators with premium radial gauges for target compliance rates.
  - Build out a clinical gaps roster drawer within each measure showing patients who need screening.
  - Support outreach dispatch actions (SMS/email nudges) with stateful load/success markers.

### Track 7: Risk Stratification & Population Clustering (`sprint-ln-risk`)
* **Files**: 
  - `src/components/leafnerd/fhir-intelligence/RiskSurface.tsx`
* **Changes**:
  - Build an interactive SVG patient clustering plot projecting 150+ patients into a 2D space.
  - Render color-coded clusters (e.g. Uncontrolled Diabetes, High Utilization) inside soft glow contour hulls.
  - Implement hover-active patient node tooltips showing ID initials, risk score, and active conditions.
  - Support toggling grouping parameters between Risk Tier, Demographics, and Service Line.

### Track 8: Agent Workbench & DB Logging (`sprint-ln-workbench`)
* **Files**: 
  - `src/components/leafnerd/fhir-intelligence/AgentWorkbenchSurface.tsx`
  - `src/lib/leafnerd/agent-workbench.ts`
  - `src/app/api/leafnerd/job-action/route.ts`
* **Changes**:
  - Format live execution logs for active `AgentJob` items.
  - Add visual workbench controls to pause, retry, and cancel active jobs.
  - Generate database audit logs (`AuditLog`) for every dispatched job action.

### Track 9: Security Boundaries & Tenant Isolation (`sprint-ln-security`)
* **Files**: 
  - `src/app/leafnerd/page.tsx`
  - `docs/security/route-auth.yaml`
* **Changes**:
  - Restrict all population and clinical DB queries to organization scope (no cross-tenant leaks).
  - Verify and register new LeafNerd API endpoints under `routes` in `route-auth.yaml`.

### Track 10: Playwright E2E Test Suite (`sprint-ln-e2e`)
* **Files**: 
  - `e2e/leafnerd-hardening.spec.ts`
* **Changes**:
  - Create a new Playwright test suite to verify page load, tab navigation, chat activation, simulator run, and logout flow.

---

## Technical Constraints & Quality Gates
1. **Zero PHI**: No patient health information must be hardcoded or logged. Use patient initials or synthetic IDs.
2. **Scoping**: All styling changes must stay scoped inside the `.ln-root` selector or target pages.
3. **Validation**: Every branch must run `npm run typecheck` and `npm test` successfully before merging.
