#!/bin/bash
# LeafNerd Hardening Swarm Orchestrator
# Dispatches 10 parallel conflict-free Claude agents using Git worktrees.

export PATH="/Users/scottwayman/.hermes/node/bin:/usr/local/bin:$PATH"
mkdir -p .agents/logs

echo "===================================================================="
echo "🌱 Dispatched LeafNerd Hardening Swarm (10 Tracks, YOLO mode) 🌱"
echo "===================================================================="

cd /Users/scottwayman/EMR

# Track 1: Overview & Metrics Dashboard
echo "Dispatching Track 1 (Overview & Metrics)..."
nohup claude --permission-mode auto --worktree sprint-ln-1 -p "You are assigned to LeafNerd Hardening Track 1. Enhance the Overview surface:
- Target files: src/components/leafnerd/fhir-intelligence/Overview.tsx, src/components/leafnerd/fhir-intelligence/widgets.tsx
- Goal: Replace the static mockup sparklines with inline SVG paths. Add interactive hovering tooltips to the clinical volume and completeness graphs showing exact numbers. Ensure clicking any metric card correctly triggers the global slide-out provenance drawer.
Verify typecheck and tests pass before committing, then commit and push to origin/sprint-ln-1." < /dev/null > .agents/logs/sprint_ln_1.log 2>&1 &

# Track 2: FHIR Explorer US-Core Validation
echo "Dispatching Track 2 (FHIR Explorer)..."
nohup claude --permission-mode auto --worktree sprint-ln-2 -p "You are assigned to LeafNerd Hardening Track 2. Enhance the FHIR Explorer surface:
- Target files: src/components/leafnerd/fhir-intelligence/FhirExplorer.tsx, src/lib/leafnerd/fhir-real.ts
- Goal: Deepen R4 resource representation by rendering US-Core validation passes, warnings, and error badges. Implement code folding/expansion inside the Raw JSON tab. Enforce dynamic traversal/node hopping when clicking on related resource chips.
Verify typecheck and tests pass before committing, then commit and push to origin/sprint-ln-2." < /dev/null > .agents/logs/sprint_ln_2.log 2>&1 &

# Track 3: Ask LeafNerd AI & Chat
echo "Dispatching Track 3 (Ask LeafNerd Chat)..."
nohup claude --permission-mode auto --worktree sprint-ln-3 -p "You are assigned to LeafNerd Hardening Track 3. Enhance Ask LeafNerd Chat:
- Target files: src/components/leafnerd/fhir-intelligence/AskLeafnerdPanel.tsx, src/app/api/leafnerd/chat/route.ts
- Goal: Style the Chat panel with premium botanical slide-in transitions and glassmorphism. Render full markdown (bold, lists, tables) in streams. Ground response outputs in real DB counts (citing live patient/encounter numbers).
Verify typecheck and tests pass before committing, then commit and push to origin/sprint-ln-3." < /dev/null > .agents/logs/sprint_ln_3.log 2>&1 &

# Track 4: Cohort Monte Carlo Simulator
echo "Dispatching Track 4 (Cohort Simulator)..."
nohup claude --permission-mode auto --worktree sprint-ln-4 -p "You are assigned to LeafNerd Hardening Track 4. Enhance Cohort Simulator:
- Target files: src/components/leafnerd/fhir-intelligence/CohortSurface.tsx, src/components/leafnerd/CohortSimulator.tsx
- Goal: Replace static curves with an interactive SVG chart showing bell curves, shaded confidence boundaries on hover, and preset cohort controls (e.g. high-risk diabetics).
Verify typecheck and tests pass before committing, then commit and push to origin/sprint-ln-4." < /dev/null > .agents/logs/sprint_ln_4.log 2>&1 &

# Track 5: Claims Auditor & Procedural Checks
echo "Dispatching Track 5 (Claims Auditor)..."
nohup claude --permission-mode auto --worktree sprint-ln-5 -p "You are assigned to LeafNerd Hardening Track 5. Enhance Claims Auditor:
- Target files: src/components/leafnerd/fhir-intelligence/ClaimsSurface.tsx
- Goal: Add smooth CSS transitions to claim card expansions. Highlight procedure/diagnosis mismatches (modifier-25, NCCI bundling, MUE) with detailed warnings. Wire up a re-audit claim action with loading states.
Verify typecheck and tests pass before committing, then commit and push to origin/sprint-ln-5." < /dev/null > .agents/logs/sprint_ln_5.log 2>&1 &

# Track 6: Quality Measures (CMS/HEDIS) Gaps
echo "Dispatching Track 6 (Quality Measures)..."
nohup claude --permission-mode auto --worktree sprint-ln-6 -p "You are assigned to LeafNerd Hardening Track 6. Enhance Quality Measures:
- Target files: src/components/leafnerd/fhir-intelligence/QualitySurface.tsx
- Goal: Build actual radial SVG gauges for HEDIS compliance rates. Design a care-gap roster drawer nested inside measure cards to view patients missing screenings. Implement mock outreach triggers with loading indicators.
Verify typecheck and tests pass before committing, then commit and push to origin/sprint-ln-6." < /dev/null > .agents/logs/sprint_ln_6.log 2>&1 &

# Track 7: Risk Stratification & Population Clustering
echo "Dispatching Track 7 (Risk Stratification & Clustering)..."
nohup claude --permission-mode auto --worktree sprint-ln-7 -p "You are assigned to LeafNerd Hardening Track 7. Enhance Risk Stratification:
- Target files: src/components/leafnerd/fhir-intelligence/RiskSurface.tsx
- Goal: Add a gorgeous interactive K-Means patient clustering map using SVG (projecting 150+ patient dots, color-coded clusters with soft contour boundaries/hulls, hover tooltips showing patient initials, risk score, and comorbidities, and grouping toggles).
Verify typecheck and tests pass before committing, then commit and push to origin/sprint-ln-7." < /dev/null > .agents/logs/sprint_ln_7.log 2>&1 &

# Track 8: Agent Workbench governs-execution
echo "Dispatching Track 8 (Agent Workbench)..."
nohup claude --permission-mode auto --worktree sprint-ln-8 -p "You are assigned to LeafNerd Hardening Track 8. Enhance Agent Workbench:
- Target files: src/components/leafnerd/fhir-intelligence/AgentWorkbenchSurface.tsx, src/lib/leafnerd/agent-workbench.ts, src/app/api/leafnerd/job-action/route.ts
- Goal: Connect dynamic streaming execution logs for active AgentJobs. Add action controls (pause, retry, cancel). Write AuditLog entries on every job action dispatch.
Verify typecheck and tests pass before committing, then commit and push to origin/sprint-ln-8." < /dev/null > .agents/logs/sprint_ln_8.log 2>&1 &

# Track 9: Security Boundary Checks
echo "Dispatching Track 9 (Security Isolation)..."
nohup claude --permission-mode auto --worktree sprint-ln-9 -p "You are assigned to LeafNerd Hardening Track 9. Verify Security & Route Manifests:
- Target files: src/app/leafnerd/page.tsx, docs/security/route-auth.yaml
- Goal: Enforce secure Clerk user role checking. Ensure database queries are scoped exclusively to the demo/tenant org (no cross-tenant leaks). Document all new endpoints in route-auth.yaml.
Verify typecheck and tests pass before committing, then commit and push to origin/sprint-ln-9." < /dev/null > .agents/logs/sprint_ln_9.log 2>&1 &

# Track 10: Playwright E2E Tests
echo "Dispatching Track 10 (E2E Tests)..."
nohup claude --permission-mode auto --worktree sprint-ln-10 -p "You are assigned to LeafNerd Hardening Track 10. Add E2E tests:
- Target files: e2e/leafnerd-hardening.spec.ts
- Goal: Create a new Playwright test suite specifically targeting /leafnerd verifying rail navigation, metric card triggers, chat interactions, simulator runs, and logout flow.
Verify typecheck and tests pass before committing, then commit and push to origin/sprint-ln-10." < /dev/null > .agents/logs/sprint_ln_10.log 2>&1 &

echo "===================================================================="
echo "✅ All 10 parallel tracks successfully launched!"
echo "===================================================================="
