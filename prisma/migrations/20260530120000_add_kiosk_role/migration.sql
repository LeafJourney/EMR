-- EMR kiosk login: a per-organization front-desk account scoped to the
-- self-service /kiosk surface. Added as a Role so it slots into the existing
-- Membership-based RBAC (org scoping + route guards) with zero PHI grants.
ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'kiosk';
