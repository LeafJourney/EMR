import type { AuditEvent } from "./types";

/**
 * Append-only audit ledger. The interface is intentionally narrow so a
 * production deployment can swap the in-memory implementation for an
 * OpenTelemetry exporter, an immudb-style tamper-evident log, or a
 * write-once S3 bucket — without touching gateway / RAG / orchestrator
 * call sites.
 */
export interface AuditLedger {
  /** Record an event and return the assigned id. */
  write(event: Omit<AuditEvent, "id" | "at"> & Partial<Pick<AuditEvent, "id" | "at">>): AuditEvent;
  /** Read events for inspection. Implementations may paginate. */
  read(filter?: AuditFilter): readonly AuditEvent[];
}

export interface AuditFilter {
  subjectId?: string;
  patientId?: string;
  action?: string;
  outcome?: AuditEvent["outcome"];
  since?: string;
}

/**
 * Minimal in-process ledger. Append-only at the API level: events are
 * pushed onto an internal array and never mutated or removed. Returns
 * deep-frozen snapshots from `read()` so the caller cannot corrupt the
 * tail of the log by editing what they were handed back.
 */
export class InMemoryAuditLedger implements AuditLedger {
  private readonly events: AuditEvent[] = [];
  private seq = 0;

  write(event: Omit<AuditEvent, "id" | "at"> & Partial<Pick<AuditEvent, "id" | "at">>): AuditEvent {
    const id = event.id ?? `audit-${++this.seq}-${Date.now().toString(36)}`;
    const at = event.at ?? new Date().toISOString();
    const stored: AuditEvent = Object.freeze({ ...event, id, at });
    this.events.push(stored);
    return stored;
  }

  read(filter: AuditFilter = {}): readonly AuditEvent[] {
    return this.events.filter((e) => {
      if (filter.subjectId && e.subject.id !== filter.subjectId) return false;
      if (filter.patientId && e.patientId !== filter.patientId) return false;
      if (filter.action && e.action !== filter.action) return false;
      if (filter.outcome && e.outcome !== filter.outcome) return false;
      if (filter.since && e.at < filter.since) return false;
      return true;
    });
  }

  /** Returns a defensive copy. The internal log is never exposed. */
  snapshot(): readonly AuditEvent[] {
    return [...this.events];
  }
}
