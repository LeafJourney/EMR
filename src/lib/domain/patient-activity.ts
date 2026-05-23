// Per-patient activity timeline loader.
//
// Pulls a chronological feed of meaningful events for a single patient
// (encounters, messages, notes, lab results, refill requests, tasks) and
// returns them as a uniform `PatientActivityEvent[]` ready for the
// `<PatientActivityTimeline />` chart tab.
//
// Designed to be tolerant of partially-migrated schemas: every source
// query is wrapped so a missing table or migration drift cannot blank
// the whole feed — the timeline degrades gracefully to whatever the
// database actually exposes today.

import type { PrismaClient } from "@prisma/client";

export type PatientActivityKind =
  | "visit"
  | "message"
  | "note"
  | "lab"
  | "refill"
  | "task"
  | "system";

export interface PatientActivityEvent {
  id: string;
  kind: PatientActivityKind;
  /** ISO-8601 timestamp; events are sorted descending on this field. */
  occurredAt: string;
  title: string;
  description?: string;
  /** Display-ready label for the person (or agent) that produced the event. */
  actorLabel: string;
  /** Optional deep-link target — usually a chart tab or sign-off page. */
  href?: string;
}

export interface LoadPatientActivityOptions {
  /** Lower-bound cutoff (inclusive). Events older than this are dropped. */
  since?: Date;
  /** Upper-bound cutoff (inclusive). Events newer than this are dropped. */
  until?: Date;
  /**
   * Restrict to the listed event kinds. `undefined` (or empty array)
   * returns everything. Unknown kinds are silently ignored.
   */
  kinds?: ReadonlyArray<PatientActivityKind | string>;
  /** Soft cap on returned events. Defaults to 200. */
  limit?: number;
}

const DEFAULT_LIMIT = 200;
const PER_SOURCE_TAKE = 60; // most-recent-N from each source before global merge

/**
 * Best-effort fetch from a Prisma model that may not exist (yet) in the
 * connected schema. Returns `[]` on any failure (missing table, RBAC
 * filter mismatch, transient driver error) so the timeline still renders.
 */
async function safeFind<T>(fn: () => Promise<T[]>): Promise<T[]> {
  try {
    return await fn();
  } catch {
    return [];
  }
}

function actorFromUser(u?: { firstName?: string | null; lastName?: string | null } | null): string {
  if (!u) return "System";
  const name = `${u.firstName ?? ""} ${u.lastName ?? ""}`.trim();
  return name.length > 0 ? name : "System";
}

function withinWindow(iso: string, since?: Date, until?: Date): boolean {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return false;
  if (since && t < since.getTime()) return false;
  if (until && t > until.getTime()) return false;
  return true;
}

/**
 * Load a unified activity feed for `patientId`. Always returns most-
 * recent-first. Soft-fails per source so a single broken table never
 * collapses the whole timeline.
 */
export async function loadPatientActivity(
  prisma: PrismaClient,
  patientId: string,
  opts: LoadPatientActivityOptions = {},
): Promise<PatientActivityEvent[]> {
  const { since, until, kinds, limit = DEFAULT_LIMIT } = opts;
  const wantedKinds = kinds && kinds.length > 0 ? new Set(kinds) : null;
  const wants = (k: PatientActivityKind) => !wantedKinds || wantedKinds.has(k);

  const dateFilter: { gte?: Date; lte?: Date } | undefined = (() => {
    if (!since && !until) return undefined;
    const f: { gte?: Date; lte?: Date } = {};
    if (since) f.gte = since;
    if (until) f.lte = until;
    return f;
  })();

  const events: PatientActivityEvent[] = [];

  /* ── Visits (Encounter) ───────────────────────────────────── */
  if (wants("visit")) {
    const encounters = await safeFind(() =>
      (prisma as any).encounter.findMany({
        where: {
          patientId,
          ...(dateFilter
            ? {
                OR: [
                  { completedAt: dateFilter },
                  { startedAt: dateFilter },
                  { scheduledFor: dateFilter },
                ],
              }
            : {}),
        },
        orderBy: { scheduledFor: "desc" },
        take: PER_SOURCE_TAKE,
        include: { provider: { include: { user: true } } },
      }),
    );
    for (const e of encounters as any[]) {
      const ts =
        e.completedAt ?? e.startedAt ?? e.scheduledFor ?? e.createdAt;
      if (!ts) continue;
      const iso = new Date(ts).toISOString();
      if (!withinWindow(iso, since, until)) continue;
      const statusLabel =
        e.status === "complete"
          ? "Visit completed"
          : e.status === "in_progress"
            ? "Visit in progress"
            : e.status === "scheduled"
              ? "Visit scheduled"
              : e.status === "cancelled" || e.status === "no_show"
                ? "Visit cancelled"
                : "Visit";
      events.push({
        id: `visit:${e.id}`,
        kind: "visit",
        occurredAt: iso,
        title: statusLabel,
        description:
          [e.modality, e.reason].filter(Boolean).join(" · ") || undefined,
        actorLabel: actorFromUser(e.provider?.user),
        href: `/clinic/patients/${patientId}?tab=notes`,
      });
    }
  }

  /* ── Messages (MessageThread) ─────────────────────────────── */
  if (wants("message")) {
    const threads = await safeFind(() =>
      (prisma as any).messageThread.findMany({
        where: {
          patientId,
          ...(dateFilter ? { lastMessageAt: dateFilter } : {}),
        },
        orderBy: { lastMessageAt: "desc" },
        take: PER_SOURCE_TAKE,
        include: {
          messages: {
            orderBy: { createdAt: "desc" },
            take: 1,
            include: { sender: true },
          },
        },
      }),
    );
    for (const t of threads as any[]) {
      const ts = t.lastMessageAt ?? t.createdAt;
      if (!ts) continue;
      const iso = new Date(ts).toISOString();
      if (!withinWindow(iso, since, until)) continue;
      const last = t.messages?.[0];
      const preview = typeof last?.body === "string"
        ? last.body.slice(0, 140)
        : undefined;
      events.push({
        id: `message:${t.id}`,
        kind: "message",
        occurredAt: iso,
        title: t.subject || "Patient message",
        description: preview,
        actorLabel: last?.sender
          ? actorFromUser(last.sender)
          : last?.senderAgent
            ? `${last.senderAgent} (AI)`
            : "Patient",
        href: `/clinic/patients/${patientId}?tab=correspondence`,
      });
    }
  }

  /* ── Notes (Note via Encounter) ───────────────────────────── */
  if (wants("note")) {
    const notes = await safeFind(() =>
      (prisma as any).note.findMany({
        where: {
          encounter: { patientId },
          ...(dateFilter
            ? {
                OR: [
                  { finalizedAt: dateFilter },
                  { createdAt: dateFilter },
                ],
              }
            : {}),
        },
        orderBy: { createdAt: "desc" },
        take: PER_SOURCE_TAKE,
      }),
    );
    for (const n of notes as any[]) {
      const ts = n.finalizedAt ?? n.createdAt;
      if (!ts) continue;
      const iso = new Date(ts).toISOString();
      if (!withinWindow(iso, since, until)) continue;
      const blocks = n.blocks as { chiefComplaint?: unknown } | undefined;
      const chief =
        blocks && typeof blocks.chiefComplaint === "string"
          ? blocks.chiefComplaint.trim()
          : "";
      const title =
        n.status === "finalized"
          ? "Note finalized"
          : n.status === "amended"
            ? "Note amended"
            : n.status === "pending_cosign"
              ? "Note pending cosign"
              : "Note drafted";
      events.push({
        id: `note:${n.id}`,
        kind: "note",
        occurredAt: iso,
        title,
        description:
          chief ||
          (typeof n.narrative === "string"
            ? n.narrative.slice(0, 140)
            : undefined),
        actorLabel: n.aiDrafted && !n.finalizedAt ? "Scribe (AI)" : "Clinician",
        href: `/clinic/patients/${patientId}?tab=notes`,
      });
    }
  }

  /* ── Labs (LabResult) ─────────────────────────────────────── */
  if (wants("lab")) {
    const labs = await safeFind(() =>
      (prisma as any).labResult.findMany({
        where: {
          patientId,
          ...(dateFilter ? { receivedAt: dateFilter } : {}),
        },
        orderBy: { receivedAt: "desc" },
        take: PER_SOURCE_TAKE,
        include: { signedBy: true },
      }),
    );
    for (const l of labs as any[]) {
      const ts = l.signedAt ?? l.receivedAt ?? l.createdAt;
      if (!ts) continue;
      const iso = new Date(ts).toISOString();
      if (!withinWindow(iso, since, until)) continue;
      const title = l.signedAt
        ? `${l.panelName || "Lab"} signed off`
        : `${l.panelName || "Lab"} received`;
      events.push({
        id: `lab:${l.id}`,
        kind: "lab",
        occurredAt: iso,
        title,
        description: l.abnormalFlag ? "Abnormal markers flagged" : undefined,
        actorLabel: l.signedBy ? actorFromUser(l.signedBy) : "Lab system",
        href: `/clinic/patients/${patientId}?tab=labs`,
      });
    }
  }

  /* ── Refills (RefillRequest) ──────────────────────────────── */
  if (wants("refill")) {
    const refills = await safeFind(() =>
      (prisma as any).refillRequest.findMany({
        where: {
          patientId,
          ...(dateFilter ? { receivedAt: dateFilter } : {}),
        },
        orderBy: { receivedAt: "desc" },
        take: PER_SOURCE_TAKE,
        include: { signedBy: true, medication: true },
      }),
    );
    for (const r of refills as any[]) {
      const ts = r.signedAt ?? r.receivedAt ?? r.createdAt;
      if (!ts) continue;
      const iso = new Date(ts).toISOString();
      if (!withinWindow(iso, since, until)) continue;
      const medName = r.medication?.name ?? "medication";
      const title =
        r.status === "approved" || r.status === "sent"
          ? `Refill approved — ${medName}`
          : r.status === "denied"
            ? `Refill denied — ${medName}`
            : `Refill requested — ${medName}`;
      events.push({
        id: `refill:${r.id}`,
        kind: "refill",
        occurredAt: iso,
        title,
        description: r.pharmacyName ? `Pharmacy: ${r.pharmacyName}` : undefined,
        actorLabel: r.signedBy ? actorFromUser(r.signedBy) : "Pharmacy",
        href: `/clinic/patients/${patientId}?tab=rx`,
      });
    }
  }

  /* ── Tasks ────────────────────────────────────────────────── */
  if (wants("task")) {
    const tasks = await safeFind(() =>
      (prisma as any).task.findMany({
        where: {
          patientId,
          ...(dateFilter
            ? {
                OR: [
                  { completedAt: dateFilter },
                  { createdAt: dateFilter },
                ],
              }
            : {}),
        },
        orderBy: { createdAt: "desc" },
        take: PER_SOURCE_TAKE,
      }),
    );
    for (const t of tasks as any[]) {
      const ts = t.completedAt ?? t.createdAt;
      if (!ts) continue;
      const iso = new Date(ts).toISOString();
      if (!withinWindow(iso, since, until)) continue;
      const title = t.completedAt ? `Task completed — ${t.title}` : `Task opened — ${t.title}`;
      events.push({
        id: `task:${t.id}`,
        kind: "task",
        occurredAt: iso,
        title,
        description: t.description ?? undefined,
        actorLabel: t.assigneeRole ? String(t.assigneeRole) : "Care team",
        href: `/clinic/patients/${patientId}`,
      });
    }
  }

  // Global merge, most recent first.
  events.sort((a, b) => (a.occurredAt < b.occurredAt ? 1 : -1));
  return events.slice(0, limit);
}

/**
 * Group an event list by calendar day (using the viewer's local zone via
 * `toDateString`). Returns ordered groups, most-recent day first.
 *
 * Exposed so the timeline component (and any future export view) share
 * the same bucketing logic.
 */
export function groupActivityByDay(
  events: PatientActivityEvent[],
): Array<{ dayKey: string; label: string; items: PatientActivityEvent[] }> {
  const groups = new Map<string, PatientActivityEvent[]>();
  for (const e of events) {
    const d = new Date(e.occurredAt);
    const key = d.toDateString(); // e.g. "Tue May 21 2026" — stable per day in local tz
    const bucket = groups.get(key);
    if (bucket) bucket.push(e);
    else groups.set(key, [e]);
  }

  const today = new Date().toDateString();
  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toDateString();

  return Array.from(groups.entries())
    .sort((a, b) => (new Date(a[0]).getTime() < new Date(b[0]).getTime() ? 1 : -1))
    .map(([key, items]) => {
      let label: string;
      if (key === today) label = "Today";
      else if (key === yesterday) label = "Yesterday";
      else {
        const d = new Date(key);
        const sameYear = d.getFullYear() === new Date().getFullYear();
        label = d.toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
          ...(sameYear ? {} : { year: "numeric" }),
        });
      }
      return { dayKey: key, label, items };
    });
}
