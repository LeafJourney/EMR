#!/usr/bin/env bash
# Schema drift check — compares LIVE database schema(s) against prisma/schema.prisma.
#
# Why this exists (2026-06-11 audit, see docs/audit/SCHEMA_DRIFT_AUDIT_2026-06-11.md):
# prod syncs schema ONLY via `prisma migrate deploy` (render.yaml startCommand),
# which applies migrations over DIRECT_URL — while the app reads DATABASE_URL.
# If those ever point at different databases, migrations land in one DB and the
# app reads another: deploys stay green while runtime queries crash with
# "column does not exist". This script makes that state visible in one command.
#
# Usage (local, or Render shell on emr-web):
#   npm run db:drift-check
#
# Exit codes: 0 = everything in sync, 2 = drift found, 1 = misconfigured.
set -uo pipefail

DB_URL="${DATABASE_URL:-}"
DIR_URL="${DIRECT_URL:-}"

if [ -z "$DB_URL" ] && [ -z "$DIR_URL" ]; then
  echo "ERROR: set DATABASE_URL and/or DIRECT_URL first." >&2
  exit 1
fi

# Strip pgbouncer-style params that the diff engine's direct connection rejects.
clean() { printf '%s' "$1" | sed -E 's/([?&])(pgbouncer|pool_timeout|connection_limit)=[^&]*//g; s/[?&]$//'; }

FAIL=0

check_url() {
  local label="$1" url="$2"
  echo
  echo "── ${label}: diffing live schema against prisma/schema.prisma ──"
  local out
  out=$(npx prisma migrate diff \
    --from-url "$(clean "$url")" \
    --to-schema-datamodel prisma/schema.prisma \
    --script --exit-code 2>&1)
  local code=$?
  if [ $code -eq 0 ]; then
    echo "✓ ${label} is IN SYNC with prisma/schema.prisma."
  elif [ $code -eq 2 ]; then
    FAIL=2
    echo "✗ ${label} has DRIFTED. SQL needed to match the code's schema:"
    echo "$out"
  else
    FAIL=2
    echo "! Could not diff ${label} (connection/config error):"
    echo "$out"
  fi
}

[ -n "$DB_URL" ]  && check_url "DATABASE_URL (what the app reads)" "$DB_URL"
[ -n "$DIR_URL" ] && check_url "DIRECT_URL (where migrations apply)" "$DIR_URL"

# Split-brain check: migrations apply over DIRECT_URL but the app reads
# DATABASE_URL. If both are set, they MUST resolve to the same schema.
if [ -n "$DB_URL" ] && [ -n "$DIR_URL" ]; then
  echo
  echo "── Split-brain check: DATABASE_URL vs DIRECT_URL ──"
  out=$(npx prisma migrate diff \
    --from-url "$(clean "$DB_URL")" \
    --to-url "$(clean "$DIR_URL")" \
    --script --exit-code 2>&1)
  code=$?
  if [ $code -eq 0 ]; then
    echo "✓ Both URLs see the same schema."
  elif [ $code -eq 2 ]; then
    FAIL=2
    echo "✗ SPLIT-BRAIN: DATABASE_URL and DIRECT_URL are DIFFERENT databases/schemas."
    echo "  Migrations are landing somewhere the app does not read. Diff:"
    echo "$out"
  else
    FAIL=2
    echo "! Could not compare the two URLs:"
    echo "$out"
  fi
fi

echo
if [ "$FAIL" -eq 0 ]; then
  echo "RESULT: no drift detected."
else
  echo "RESULT: drift detected — see above. Fix the env wiring or apply the printed SQL via a migration."
fi
exit "$FAIL"
