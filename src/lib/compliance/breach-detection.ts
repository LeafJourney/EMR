/**
 * EMR-633 — HIPAA Privacy & Breach Notification: broad-access detector (pure).
 *
 * HIPAA's breach-notification posture requires surfacing potential
 * impermissible PHI access. A common signal is a single actor reading an
 * unusually large number of distinct patient charts in a short window — chart
 * snooping, a scripted scrape, or a compromised account. This detector groups
 * `patient.phi_accessed` audit events (see src/lib/domain/audit-logger.ts) by
 * (org, actor) inside a trailing window and flags actors whose distinct-patient
 * count crosses a threshold.
 *
 * Pure: no I/O, no Date.now(). The cron route (api/cron/breach-watch) fetches
 * the audit rows + supplies `now`, then turns each finding into a deduplicated
 * compliance Task + a `compliance.breach.suspected` audit row.
 */

export interface PhiAccessEvent {
  organizationId: string | null;
  actorUserId: string | null;
  /** The patient (AuditLog.subjectId) whose PHI was accessed. */
  subjectId: string | null;
  createdAt: Date;
}

export interface BroadAccessOptions {
  /** Reference time — the trailing window ends here. */
  now: Date;
  /** Window length in ms. Default 60 minutes. */
  windowMs?: number;
  /** Distinct patients accessed by one actor that trips an alert. Default 50. */
  distinctPatientThreshold?: number;
}

export interface BroadAccessFinding {
  organizationId: string;
  actorUserId: string;
  distinctPatients: number;
  totalReads: number;
  windowStartIso: string;
  windowEndIso: string;
  threshold: number;
}

const DEFAULT_WINDOW_MS = 60 * 60 * 1000;
const DEFAULT_THRESHOLD = 50;
const SEP = ":";

/**
 * Flag actors who accessed `>= threshold` distinct patients within the trailing
 * window. Events outside the window, or missing org/actor/subject, are ignored.
 * Findings are sorted by distinct-patient count desc for prioritized triage.
 */
export function detectBroadAccess(
  events: PhiAccessEvent[],
  opts: BroadAccessOptions,
): BroadAccessFinding[] {
  const windowMs = opts.windowMs ?? DEFAULT_WINDOW_MS;
  const threshold = opts.distinctPatientThreshold ?? DEFAULT_THRESHOLD;
  const end = opts.now.getTime();
  const start = end - windowMs;

  const byActor = new Map<
    string,
    { org: string; actor: string; patients: Set<string>; total: number }
  >();

  for (const e of events) {
    if (!e.organizationId || !e.actorUserId || !e.subjectId) continue;
    const t = e.createdAt.getTime();
    if (Number.isNaN(t) || t < start || t > end) continue;

    const key = `${e.organizationId}${SEP}${e.actorUserId}`;
    let g = byActor.get(key);
    if (!g) {
      g = { org: e.organizationId, actor: e.actorUserId, patients: new Set(), total: 0 };
      byActor.set(key, g);
    }
    g.patients.add(e.subjectId);
    g.total += 1;
  }

  const findings: BroadAccessFinding[] = [];
  for (const g of byActor.values()) {
    if (g.patients.size >= threshold) {
      findings.push({
        organizationId: g.org,
        actorUserId: g.actor,
        distinctPatients: g.patients.size,
        totalReads: g.total,
        windowStartIso: new Date(start).toISOString(),
        windowEndIso: new Date(end).toISOString(),
        threshold,
      });
    }
  }

  findings.sort(
    (a, b) =>
      b.distinctPatients - a.distinctPatients ||
      a.actorUserId.localeCompare(b.actorUserId),
  );
  return findings;
}
