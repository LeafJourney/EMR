/**
 * Mock incident + maintenance history for the public `/status` page.
 *
 * Real history will land once we either:
 *   (a) add an Incidents model + ops console to author postmortems, or
 *   (b) wire to a hosted status provider (Statuspage, Instatus) and proxy.
 *
 * Keep this file small and edit-friendly — until (a) or (b) lands, ops
 * updates copy here by PR.
 */

export type IncidentSeverity = "minor" | "major" | "critical";

export interface IncidentTimelineEntry {
  /** ISO timestamp, oldest first. */
  at: string;
  /** Short label: "Investigating", "Identified", "Monitoring", "Resolved". */
  label: string;
  /** One-sentence update. */
  note: string;
}

export interface Incident {
  id: string;
  date: string; // YYYY-MM-DD, for grouping/sort
  title: string;
  severity: IncidentSeverity;
  resolved: boolean;
  /** One-line summary shown collapsed. */
  summary: string;
  /** Optional postmortem link (rendered as "Read postmortem"). */
  postmortemUrl?: string;
  /** Ordered timeline of operator updates. */
  timeline: IncidentTimelineEntry[];
}

export interface Maintenance {
  id: string;
  startsAt: string;
  endsAt: string;
  title: string;
  impact: string;
}

export const INCIDENTS: Incident[] = [
  {
    id: "inc-0412",
    date: "2026-04-12",
    title: "Elevated latency on analytics queries",
    severity: "minor",
    resolved: true,
    summary:
      "A long-running analytics query saturated read replicas for ~18 minutes. Dashboards loaded slowly; no data loss.",
    postmortemUrl: "/status/postmortems/inc-0412",
    timeline: [
      { at: "2026-04-12T14:02:00Z", label: "Investigating", note: "Dashboards reporting >5s loads. Looking at replica CPU." },
      { at: "2026-04-12T14:11:00Z", label: "Identified", note: "Single tenant analytics export pinning CPU. Killing the query." },
      { at: "2026-04-12T14:20:00Z", label: "Resolved", note: "Replicas back to normal. Query rewritten and re-queued for off-hours." },
    ],
  },
  {
    id: "inc-0331",
    date: "2026-03-31",
    title: "Payabli webhook delivery delays",
    severity: "minor",
    resolved: true,
    summary:
      "Payabli's upstream queue backed up; webhook delivery delayed ~45m. No data loss; all events replayed.",
    timeline: [
      { at: "2026-03-31T09:14:00Z", label: "Investigating", note: "Charge webhooks not arriving. Reaching out to Payabli." },
      { at: "2026-03-31T09:58:00Z", label: "Monitoring", note: "Payabli confirmed their queue was backed up. Receiving events again." },
      { at: "2026-03-31T10:30:00Z", label: "Resolved", note: "Backlog cleared. All charges reconciled." },
    ],
  },
  {
    id: "inc-0318",
    date: "2026-03-18",
    title: "AI agent timeouts",
    severity: "major",
    resolved: true,
    summary:
      "Model provider upstream had a partial outage. Agents fell back to queued mode; all jobs completed once service resumed.",
    postmortemUrl: "/status/postmortems/inc-0318",
    timeline: [
      { at: "2026-03-18T18:42:00Z", label: "Investigating", note: "Charge integrity and denial triage agents timing out." },
      { at: "2026-03-18T18:55:00Z", label: "Identified", note: "Upstream model provider degraded. Engaging fallback queue." },
      { at: "2026-03-18T19:33:00Z", label: "Monitoring", note: "Provider recovered. Draining the queue at normal rate." },
      { at: "2026-03-18T20:10:00Z", label: "Resolved", note: "All queued jobs completed. No data loss." },
    ],
  },
];

export const MAINTENANCE: Maintenance[] = [
  {
    id: "mx-1",
    startsAt: "2026-06-04 03:00 UTC",
    endsAt: "2026-06-04 03:30 UTC",
    title: "Database minor version upgrade",
    impact: "Read-only mode for ~5 minutes during cutover",
  },
  {
    id: "mx-2",
    startsAt: "2026-06-12 02:00 UTC",
    endsAt: "2026-06-12 04:00 UTC",
    title: "Scheduled retrospective reindex",
    impact: "No user-visible impact expected",
  },
];
