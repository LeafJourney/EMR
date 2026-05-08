#!/bin/bash

# Setup Swarm Branches
# This script creates 30 perfectly isolated branches based on the SWARM_MATRIX.md
# and dumps an instruction prompt into each branch so the parallel agents know exactly what to do.

echo "🚀 Preparing 30-Agent Epic Swarm Environment..."

# Ensure we are on main and up to date
git checkout main
git pull origin main

TICKETS_TEXT="feat/swarm-01-disclaimer|Build the Platform Disclaimer component (EMR-027) in src/components/layout/platform-disclaimer.tsx.
feat/swarm-02-emojis|Create a set of custom Cannabis Emoji SVG icons (EMR-026) in src/components/ui/cannabis-icons.tsx.
feat/swarm-03-ambient|Build an Ambient Classical Music player component (EMR-041) in src/components/audio/ambient-player.tsx.
feat/swarm-04-vitals|Refactor the patient vitals card to use warmer, human-centric wording (EMR-011) in src/components/patient/vitals-card.tsx.
feat/swarm-05-print|Build a Patient Lab/Document Email & Print action menu (EMR-032) in src/components/patient/document-actions.tsx.
feat/swarm-06-affiliate|Build a Product Store Affiliate Link Card component (EMR-039) in src/components/store/affiliate-product-card.tsx.
feat/swarm-07-kander|Build the Justin Kander's Book & Resources education component (EMR-036) in src/components/education/kander-resources.tsx.
feat/swarm-08-roadmap|Build a Visual Health Roadmap component (EMR-010) in src/components/patient/health-roadmap.tsx.
feat/swarm-09-locator|Build a Dispensary Locator Map placeholder component (EMR-017) in src/components/dispensary/locator-map.tsx.
feat/swarm-10-dicom|Build a DICOM Viewer scaffold component (EMR-014) in src/components/dicom/dicom-viewer.tsx.
feat/swarm-11-plant|Build a Gamified Plant Companion visual component (EMR-022) in src/components/gamification/plant-companion.tsx.
feat/swarm-12-rings|Build Apple-style Health Rings for Gamify Health (EMR-023) in src/components/gamification/health-rings.tsx.
feat/swarm-13-positive|Build a Positive Input Requirement prompt component (EMR-024) in src/components/patient/positive-input-prompt.tsx.
feat/swarm-14-wheel|Build the Cannabis Combo Wheel shell component (EMR-001) in src/components/education/combo-wheel-shell.tsx.
feat/swarm-15-dosing|Build the Milligram-Based Dosing Display component (EMR-003) in src/components/prescription/dosing-display.tsx.
feat/swarm-16-sleep|Build the Lifestyle Care Plan: Sleep Hygiene card (EMR-006) in src/components/lifestyle/sleep-hygiene-card.tsx.
feat/swarm-17-meal|Build the Lifestyle Care Plan: Meal Plan card (EMR-006) in src/components/lifestyle/meal-plan-card.tsx.
feat/swarm-18-exercise|Build the Lifestyle Care Plan: Exercise Regimen card (EMR-006) in src/components/lifestyle/exercise-regimen-card.tsx.
feat/swarm-19-stress|Build the Lifestyle Care Plan: Stress Reduction card (EMR-006) in src/components/lifestyle/stress-reduction-card.tsx.
feat/swarm-20-habits|Build the Lifestyle Care Plan: Habit Formation card (EMR-006) in src/components/lifestyle/habit-formation-card.tsx.
feat/swarm-21-social|Build the Lifestyle Care Plan: Social Connectivity card (EMR-006) in src/components/lifestyle/social-connectivity-card.tsx.
feat/swarm-22-explainer|Create the 3rd-Grade Reading Level Explainer Agent logic (EMR-009) in src/lib/agents/patient-explainer.ts.
feat/swarm-23-mips|Create the MIPS Data Extrapolation calculator logic (EMR-042) in src/lib/billing/mips-calculator.ts.
feat/swarm-24-eligibility|Create the Insurance Eligibility Checker API client scaffold (EMR-046) in src/lib/billing/eligibility-client.ts.
feat/swarm-25-medicare|Create the Medicare CBD Reimbursement rules engine (EMR-047) in src/lib/billing/medicare-cbd-rules.ts.
feat/swarm-26-dose-rec|Create the Dosing Recommendation Engine agent stub (EMR-004) in src/lib/agents/dose-recommender.ts.
feat/swarm-27-leafly|Create the Leafly Strain Database Integration parser utility (EMR-018) in src/lib/integrations/leafly-parser.ts.
feat/swarm-28-plant101|Build the Cannabis Plant 101 front page marketing component (EMR-040) in src/components/marketing/plant-101.tsx.
feat/swarm-29-founders|Build the About Page - Founders & Mission component (EMR-048) in src/components/marketing/founders-story.tsx.
feat/swarm-30-pricing|Build the Pricing & Subscription Tiers marketing component (EMR-049) in src/components/marketing/pricing-table.tsx."

echo "$TICKETS_TEXT" | while IFS="|" read -r BRANCH TASK; do
    git checkout main
    
    # If branch already exists, delete it to ensure clean slate
    if git rev-parse --verify "$BRANCH" >/dev/null 2>&1; then
        git branch -D "$BRANCH"
    fi
    
    git checkout -b "$BRANCH"
    
    cat > .agent-prompt.md <<EOF
# AGENT INSTRUCTIONS

**Your Task:**
$TASK

**CRITICAL CONSTRAINTS:**
1. YOU ARE ONLY ALLOWED TO CREATE/EDIT THE FILE MENTIONED ABOVE. 
2. Do NOT edit any global layout files, schema files, or anything outside of your isolated scope. If you need a utility that doesn't exist, mock it locally within your file.
3. You must make the component beautiful, responsive, and aligned with Verdant Apothecary / Leafjourney styling.
4. When you are finished, you MUST run \`npm run typecheck\` and \`npm run lint\` and fix any errors.
5. Once tests pass, commit your code to this branch with \`git add . && git commit -m "feat: \$(your ticket)" && git push -u origin $BRANCH\`
6. Finally, use the \`gh pr create --auto\` to create a PR into main.

This is a parallelized swarm operation. Strict file isolation guarantees zero merge conflicts tomorrow morning. 
DO NOT FAIL YOUR ISOLATION PROTOCOL.
EOF

    git add .agent-prompt.md
    git commit -m "chore: setup swarm instructions for $BRANCH"
    
    echo "✅ Prepared $BRANCH"
done

git checkout main
echo "🎉 Swarm environment successfully generated!"
echo "Check out SWARM_MATRIX.md for the master plan."
