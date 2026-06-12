#!/usr/bin/env bash
# next-server-guard.sh — reusable guard against the dual-`next dev` / orphaned
# next-server failure class.
#
# WHY: Two Next servers rooted in the same repo share one `.next` directory and
# overwrite each other's webpack chunks. Symptoms: every fresh-compile route
# hangs (curl -> 000 after 30s), random 500s like
#   `Cannot find module './vendor-chunks/*.js'`
#   `Cannot read properties of null (reading 'useContext')`
# and corrupted `next build`. A second offender is teardown that kills only the
# `npm run dev` WRAPPER — the `next-server` grandchild survives, keeps holding
# `.next`, and collides with the next run. This guard closes both holes.
#
# See docs/DEMO_DAY_RUNBOOK.md and Claude memory
# project_concurrent_dev_servers_vendor_chunk_500.
#
# Usage (from a script that starts a dev/prod server):
#   source "$(dirname "$0")/lib/next-server-guard.sh"
#   next_guard_assert_free            # BEFORE starting; aborts (rc 1) if one exists
#   npm run dev > "$LOG" 2>&1 &
#   DEV_PID=$!
#   trap 'next_guard_teardown "$DEV_PID"' EXIT INT TERM   # set AFTER a successful start
#
# Default behavior is REFUSE (do not touch a server you didn't start). For
# unattended single-user loops, set NEXT_GUARD=reap to auto-kill pre-existing
# servers instead of refusing.

# Match the real next server processes. Tolerate "no match" under `set -e`.
_next_guard_pids() {
  pgrep -f 'next-server|\.bin/next dev|next/dist/bin/next' 2>/dev/null || true
}

# Returns 0 if no Next server is running (safe to start one), 1 otherwise.
next_guard_assert_free() {
  local pids
  pids="$(_next_guard_pids)"
  [ -z "$pids" ] && return 0

  if [ "${NEXT_GUARD:-}" = "reap" ]; then
    echo "[next-guard] NEXT_GUARD=reap — killing pre-existing next-server(s): $pids" >&2
    pkill -9 -f next-server 2>/dev/null || true
    sleep 2
    pids="$(_next_guard_pids)"
    [ -z "$pids" ] && return 0
  fi

  echo "[next-guard] REFUSING TO START — a Next server is already running (PIDs: $pids)." >&2
  echo "[next-guard] Two servers share .next and corrupt webpack chunks -> route hangs / broken build." >&2
  echo "[next-guard] Stop it first:  pkill -9 -f next-server     (or re-run with NEXT_GUARD=reap)" >&2
  return 1
}

# Tear down the server we started — the actual `next-server`, not just the npm
# wrapper. Pass the npm PID ($!) you captured at start.
next_guard_teardown() {
  local npm_pid="${1:-}"
  [ -n "$npm_pid" ] && pkill -9 -P "$npm_pid" 2>/dev/null || true  # the `next dev` node child
  pkill -9 -f next-server 2>/dev/null || true                      # the grandchild holding .next
  [ -n "$npm_pid" ] && kill -9 "$npm_pid" 2>/dev/null || true      # the wrapper itself
  return 0
}
