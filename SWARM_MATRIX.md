# Epic Swarm Matrix: 30-Agent Night Shift

This document outlines 30 perfectly isolated agent tasks designed to be executed concurrently. 

**CRITICAL RULE OF THE SWARM:** No two agents are allowed to edit the same file. All tasks have been specifically chosen and scoped to target separate components, utilities, or isolated pages. This guarantees 0 merge conflicts when combining the 30 PRs tomorrow morning.

## Swarm Dispatch Instructions

To execute this swarm:
1. Run `./night-shift-orchestrator.sh` or create the branches manually.
2. For each task, open a new terminal/Claude session.
3. Checkout the branch: `git checkout feat/swarm-01-disclaimer`
4. Use Claude to build the component according to the ticket requirements.
5. Claude must run `npm run typecheck && npm run lint` before creating the PR.
6. Move to the next tab.

---

## The 30 Swarm Tasks

### Wave 1: UI Components & Visual Polish (Safe, No DB Changes)

| ID | Ticket | Branch | Target Files |
|---|---|---|---|
| 01 | EMR-027: Platform Disclaimer | `feat/swarm-01-disclaimer` | `src/components/layout/platform-disclaimer.tsx` |
| 02 | EMR-026: Cannabis Emojis | `feat/swarm-02-emojis` | `src/components/ui/cannabis-icons.tsx` |
| 03 | EMR-041: Ambient Music | `feat/swarm-03-ambient` | `src/components/audio/ambient-player.tsx` |
| 04 | EMR-011: Vitals Warmer Wording | `feat/swarm-04-vitals` | `src/components/patient/vitals-card.tsx` |
| 05 | EMR-032: Document Print/Email | `feat/swarm-05-print` | `src/components/patient/document-actions.tsx` |
| 06 | EMR-039: Affiliate Links | `feat/swarm-06-affiliate` | `src/components/store/affiliate-product-card.tsx` |
| 07 | EMR-036: Kander Books | `feat/swarm-07-kander` | `src/components/education/kander-resources.tsx` |
| 08 | EMR-010: Health Roadmap | `feat/swarm-08-roadmap` | `src/components/patient/health-roadmap.tsx` |
| 09 | EMR-017: Dispensary Locator | `feat/swarm-09-locator` | `src/components/dispensary/locator-map.tsx` |
| 10 | EMR-014: DICOM Placeholder | `feat/swarm-10-dicom` | `src/components/dicom/dicom-viewer.tsx` |

### Wave 2: Gamification & Engagement (Isolated Feature Modules)

| ID | Ticket | Branch | Target Files |
|---|---|---|---|
| 11 | EMR-022: Plant Companion | `feat/swarm-11-plant` | `src/components/gamification/plant-companion.tsx` |
| 12 | EMR-023: Health Rings | `feat/swarm-12-rings` | `src/components/gamification/health-rings.tsx` |
| 13 | EMR-024: Positive Input | `feat/swarm-13-positive` | `src/components/patient/positive-input-prompt.tsx` |
| 14 | EMR-001: Combo Wheel Shell | `feat/swarm-14-wheel` | `src/components/education/combo-wheel-shell.tsx` |
| 15 | EMR-003: Dosing Display | `feat/swarm-15-dosing` | `src/components/prescription/dosing-display.tsx` |

### Wave 3: Lifestyle Care Plan (EMR-006 Sub-components)

| ID | Ticket | Branch | Target Files |
|---|---|---|---|
| 16 | Lifestyle: Sleep Hygiene | `feat/swarm-16-sleep` | `src/components/lifestyle/sleep-hygiene-card.tsx` |
| 17 | Lifestyle: Meal Plan | `feat/swarm-17-meal` | `src/components/lifestyle/meal-plan-card.tsx` |
| 18 | Lifestyle: Exercise | `feat/swarm-18-exercise` | `src/components/lifestyle/exercise-regimen-card.tsx` |
| 19 | Lifestyle: Stress Reduction | `feat/swarm-19-stress` | `src/components/lifestyle/stress-reduction-card.tsx` |
| 20 | Lifestyle: Habit Formation | `feat/swarm-20-habits` | `src/components/lifestyle/habit-formation-card.tsx` |
| 21 | Lifestyle: Social Connectivity | `feat/swarm-21-social` | `src/components/lifestyle/social-connectivity-card.tsx` |

### Wave 4: Agent Logic & API Utilities (Pure TypeScript)

| ID | Ticket | Branch | Target Files |
|---|---|---|---|
| 22 | EMR-009: 3rd Grade Explainer | `feat/swarm-22-explainer` | `src/lib/agents/patient-explainer.ts` |
| 23 | EMR-042: MIPS Calculator | `feat/swarm-23-mips` | `src/lib/billing/mips-calculator.ts` |
| 24 | EMR-046: Eligibility Checker | `feat/swarm-24-eligibility` | `src/lib/billing/eligibility-client.ts` |
| 25 | EMR-047: Medicare CBD Logic | `feat/swarm-25-medicare` | `src/lib/billing/medicare-cbd-rules.ts` |
| 26 | EMR-004: Dose Recommender | `feat/swarm-26-dose-rec` | `src/lib/agents/dose-recommender.ts` |
| 27 | EMR-018: Leafly Strain Parser | `feat/swarm-27-leafly` | `src/lib/integrations/leafly-parser.ts` |

### Wave 5: Marketing & Content Pages

| ID | Ticket | Branch | Target Files |
|---|---|---|---|
| 28 | EMR-040: Plant 101 Page | `feat/swarm-28-plant101` | `src/components/marketing/plant-101.tsx` |
| 29 | EMR-048: Founders About | `feat/swarm-29-founders` | `src/components/marketing/founders-story.tsx` |
| 30 | EMR-049: Pricing Tiers | `feat/swarm-30-pricing` | `src/components/marketing/pricing-table.tsx` |

---
*Note: Because none of these tasks edit shared layout files, `schema.prisma`, or global state stores, they will all merge cleanly into `main` regardless of the order they finish in.*
