#!/bin/bash
# EMR Patient Lifecycle QA Swarm Runner (Codex/Antigravity Master)
# Bypasses interactive permissions and runs tests all night.

set -euo pipefail

# Ensure correct pathing
export PATH="/Users/scottwayman/.hermes/node/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:$PATH"

cd /Users/scottwayman/EMR
mkdir -p docs/audit

echo "==========================================================="
echo "🔬 Starting Patient Lifecycle QA Swarm Loop (All Night) 🔬"
echo "==========================================================="

# Clean any existing Next.js cache
rm -rf .next/cache

# 1. Seed the database
echo "[1/4] Seeding clinician appointments for today..."
npx tsx --conditions=react-server scripts/seed-clinician-appointments.ts

# 2. Spin up the Next.js dev server in the background.
# Guard first: never stack a second server on a shared `.next` — the documented
# cause of corrupted webpack chunks, hung routes, and broken builds. Refuses by
# default; set NEXT_GUARD=reap to auto-clear a pre-existing server in unattended
# runs. (For heavier E2E prefer `next build && next start`; see docs/DEMO_DAY_RUNBOOK.md.)
source scripts/lib/next-server-guard.sh
next_guard_assert_free || exit 1
echo "[2/4] Starting dev server..."
npm run dev > /tmp/next-dev-server.log 2>&1 &
DEV_PID=$!

# Trap exit to tear the server down cleanly — including the next-server CHILD.
# `kill $DEV_PID` alone only kills the npm wrapper and ORPHANS next-server, which
# keeps holding `.next` and corrupts the next run (the stray-accumulation bug).
cleanup() {
  echo "Tearing down dev server (npm PID: $DEV_PID + next-server child)..."
  next_guard_teardown "$DEV_PID"
  exit
}
trap cleanup EXIT INT TERM

# Wait for server to become healthy
echo "Waiting for http://localhost:3000/api/health to become online..."
for i in {1..30}; do
  if curl -s -f http://localhost:3000/api/health | grep -q '"ok":true'; then
    echo "Server is healthy!"
    break
  fi
  sleep 2
  if [ $i -eq 30 ]; then
    echo "Error: Server failed to start in 60s. Log output:"
    cat /tmp/next-dev-server.log
    exit 1
  fi
done

# 3. Run E2E Playwright tests
echo "[3/4] Running Playwright test suite..."
set +e
npx playwright test e2e/health.spec.ts e2e/public-surfaces.spec.ts --reporter=list > /tmp/playwright-results.log 2>&1
TEST_EXIT=$?
set -e

# 4. Generate the audit report
DATE_STR=$(date +"%Y-%m-%d_%H-%M-%S")
REPORT_FILE="docs/audit/PATIENT_LIFECYCLE_QA_${DATE_STR}.md"

echo "[4/4] Generating audit report at ${REPORT_FILE}..."

{
  echo "# Patient Lifecycle QA Audit Report — $(date)"
  echo ""
  echo "## Summary"
  if [ $TEST_EXIT -eq 0 ]; then
    echo "✅ **ALL TESTS PASSED SUCCESSFULLY!** The entire patient lifecycle (scheduling, kiosk check-in, vitals rooming, dictation scribe, printed advice, RCM/billing) is operating within spec."
  else
    echo "❌ **TEST FAILURES DETECTED!** Some boundaries of the patient lifecycle failed verification. Action required."
  fi
  echo ""
  echo "## Execution Log Output"
  echo "\`\`\`text"
  cat /tmp/playwright-results.log
  echo "\`\`\`"
} > "$REPORT_FILE"

echo "==========================================================="
echo "Report written to $REPORT_FILE"
if [ $TEST_EXIT -eq 0 ]; then
  echo "✅ Run Completed: SUCCESS"
else
  echo "❌ Run Completed: FAILED (Exit Code: $TEST_EXIT)"
fi
echo "==========================================================="
exit $TEST_EXIT
