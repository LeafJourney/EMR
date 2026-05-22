// EMR-726 — Boot-time audit for SUPER_ADMIN_BOOTSTRAP_EMAILS rotation.
//
// Why this exists: changing the bootstrap allowlist is a security-relevant
// event. Today the only signal is reading the env var in Render — a silent
// expansion (e.g. an attacker adding their address) would go unnoticed
// until someone manually diffed two deploys. This helper closes that gap:
//
//   - On first call per Node process, compute a SHA-256 over the
//     sorted/lowercased/trimmed allowlist.
//   - If it differs from the most-recent BootstrapAllowlistSnapshot row
//     (or no prior row exists), insert a new snapshot and emit (a) a
//     ControllerAuditLog entry via logControllerAction() and (b) a
//     structured error-level log line so log-aggregator alerts can fire.
//   - Idempotent: a redeploy with the same env produces no new row and
//     no alarm.
//
// The "first-boot" path uses a distinct action name
// (super_admin.bootstrap_allowlist_initialised) so SIEM rules can
// differentiate "fresh install" from "the allowlist changed".

import "server-only";

import { createHash } from "node:crypto";

import type { Role } from "@prisma/client";

import { prisma } from "@/lib/db/prisma";
import { logger } from "@/lib/observability/log";

import { logControllerAction } from "./audit-stub";

/**
 * Parse + normalise the allowlist exactly the same way
 * `bootstrapAllowlist()` in super-admin-bootstrap.ts does, but without
 * the env-flag gating — we want to observe the raw rotation even when
 * SUPER_ADMIN_BOOTSTRAP_ENABLED is off. (The kill-switch governs *use*,
 * not visibility.)
 */
export function normaliseAllowlist(raw: string | undefined | null): string[] {
  const value = raw ?? "";
  const seen = new Set<string>();
  for (const part of value.split(",")) {
    const cleaned = part.trim().toLowerCase();
    if (cleaned.length > 0) seen.add(cleaned);
  }
  return [...seen].sort();
}

/**
 * SHA-256 hex over the canonical comma-joined form.
 */
export function hashAllowlist(emails: string[]): string {
  return createHash("sha256").update(emails.join(",")).digest("hex");
}

export interface AllowlistDiff {
  added: string[];
  removed: string[];
}

/**
 * Set-diff of two sorted email arrays. Output arrays are sorted for
 * deterministic logging/audit payloads.
 */
export function diffAllowlists(
  prev: string[],
  next: string[],
): AllowlistDiff {
  const prevSet = new Set(prev);
  const nextSet = new Set(next);
  const added = next.filter((e) => !prevSet.has(e)).sort();
  const removed = prev.filter((e) => !nextSet.has(e)).sort();
  return { added, removed };
}

function resolveDeploySha(): string | null {
  return (
    process.env.RENDER_GIT_COMMIT ||
    process.env.GIT_SHA ||
    null
  );
}

/**
 * System actor used for the audit row. The bootstrap-diff event is
 * synthesised by the app at boot — there's no human actor. Using a
 * stable synthetic id makes these rows easy to filter out (or in) when
 * querying ControllerAuditLog.
 */
const SYSTEM_ACTOR: {
  id: string;
  email: string;
  roles: Role[];
  organizationId: string | null;
} = {
  id: "system:bootstrap-diff",
  email: "system@leafjourney.local",
  roles: ["system"],
  organizationId: null,
};

/**
 * Memoise so the audit runs once per Node process, not per request — the
 * snapshot table only needs the boot-time observation, and re-running on
 * every request would burn DB round-trips for zero added signal.
 */
let auditPromise: Promise<void> | null = null;

export function runBootstrapAllowlistAudit(): Promise<void> {
  if (auditPromise !== null) return auditPromise;
  auditPromise = doAudit().catch((err) => {
    // Don't poison the cache on failure — let a subsequent call retry
    // (e.g. transient DB unavailability at cold-start).
    auditPromise = null;
    logger.error({
      event: "super_admin.bootstrap_allowlist_audit_failed",
      err: err instanceof Error ? err.message : String(err),
    });
  });
  return auditPromise;
}

async function doAudit(): Promise<void> {
  const emails = normaliseAllowlist(process.env.SUPER_ADMIN_BOOTSTRAP_EMAILS);
  const hash = hashAllowlist(emails);
  const deploySha = resolveDeploySha();

  const previous = await prisma.bootstrapAllowlistSnapshot.findFirst({
    orderBy: { createdAt: "desc" },
    select: { hash: true, emails: true },
  });

  if (previous && previous.hash === hash) {
    // Idempotent reboot — no change, no row, no alarm.
    return;
  }

  await prisma.bootstrapAllowlistSnapshot.create({
    // The Prisma column is non-null String (we want every snapshot to
    // identify the deploy that produced it). `resolveDeploySha()` returns
    // null when both RENDER_GIT_COMMIT and GIT_SHA are unset (local dev /
    // unstamped builds). Coalesce to "unknown" so the column is satisfied
    // and ops can grep for that sentinel.
    data: { hash, emails, deploySha: deploySha ?? "unknown" },
  });

  if (!previous) {
    // First-boot path: record the baseline but don't alarm. There's
    // nothing to diff against yet, and treating cold-start as a
    // "change" would just create noise.
    await logControllerAction({
      actor: SYSTEM_ACTOR,
      action: "super_admin.bootstrap_allowlist_initialised",
      targetId: "bootstrap-allowlist",
      after: { emails, hash, deploySha },
      reason: "Baseline snapshot captured at first boot.",
    });
    logger.info({
      event: "super_admin.bootstrap_allowlist_initialised",
      deploySha,
      size: emails.length,
    });
    return;
  }

  const { added, removed } = diffAllowlists(previous.emails, emails);

  await logControllerAction({
    actor: SYSTEM_ACTOR,
    action: "super_admin.bootstrap_allowlist_changed",
    targetId: "bootstrap-allowlist",
    before: { emails: previous.emails, hash: previous.hash },
    after: { emails, hash, deploySha },
    reason:
      `Allowlist rotated between deploys — ` +
      `+${added.length} / -${removed.length}.`,
  });

  // Error-level so log-aggregator alarms fire. Emails appear only inside
  // the structured payload, never as a raw logger.info line.
  logger.error({
    event: "super_admin.bootstrap_allowlist_changed",
    added,
    removed,
    fromHash: previous.hash,
    toHash: hash,
    deploySha,
  });
}

/**
 * Reset the memoised audit — exported for tests only. Production code
 * relies on the once-per-process semantics.
 */
export function __resetBootstrapAllowlistAuditForTests(): void {
  auditPromise = null;
}
