/**
 * Leafnerd Agent Workbench — SERVER-ONLY data access over the REAL governed
 * orchestration tables (AgentJob + AgentReasoning). This is the surface that
 * proves the agentic spine is real, not a slide.
 *
 * Lazy-imports prisma (like server-data.ts) so a missing DB never crashes a
 * render; falls back to curated rows when the demo org has no jobs yet.
 */
import type {
  AgentWorkbenchData,
  AgentJobRow,
  AgentJobStatusLite,
  AgentJobAction,
  AgentJobActionResult,
  AgentLogLine,
  SourceFreshnessRow,
} from "./types";

const DEMO_ORG_SLUG = "leafnerd-demo";

// Pause parks a job's `runAfter` far in the future (the worker only claims
// `pending` rows whose runAfter <= now), so "paused" is a derived view over the
// existing schema — no new enum value. A job is "paused" when it is `pending`
// but parked more than a year out.
const PAUSE_PARK_AT = new Date("2999-01-01T00:00:00.000Z");
const PAUSE_THRESHOLD_MS = 365 * 24 * 60 * 60 * 1000;

function isParked(runAfter: Date | null | undefined): boolean {
  return !!runAfter && runAfter.getTime() - Date.now() > PAUSE_THRESHOLD_MS;
}

/** Lazily resolve the prisma client; null if unavailable so renders never crash. */
async function getPrisma(): Promise<typeof import("@/lib/db/prisma").prisma | null> {
  try {
    return (await import("@/lib/db/prisma")).prisma ?? null;
  } catch {
    return null;
  }
}

/** Coerce an AgentJob.logs Json blob into client-safe log lines (tail-capped). */
function coerceLogLines(raw: unknown): AgentLogLine[] {
  if (!Array.isArray(raw)) return [];
  const out: AgentLogLine[] = [];
  for (const e of raw) {
    if (!e || typeof e !== "object") continue;
    const o = e as Record<string, unknown>;
    const message = typeof o.message === "string" ? o.message : null;
    if (!message) continue;
    const level = o.level === "warn" || o.level === "error" ? o.level : "info";
    const at = typeof o.at === "string" ? o.at : "";
    out.push({ at, level, message });
  }
  return out.slice(-40); // keep the tail so chatty jobs stay small over the wire
}

/**
 * Coerce an AgentReasoning.sources Json blob into evidence-chip labels. The
 * schema default is an object-of-arrays map (e.g. `{ memories: [...] }`) whose
 * keys read as labels, but a row may instead store a top-level array of label
 * strings. Arrays are objects in JS, so `Object.keys` on an array yields bare
 * indices ("0","1","2") — handle the array shape explicitly so chips stay
 * readable, and fall back to keys only for the documented map shape.
 */
function reasoningSources(raw: unknown): string[] {
  if (Array.isArray(raw)) return raw.map(String);
  if (raw && typeof raw === "object") return Object.keys(raw);
  return [];
}

// --- Curated fallback (representative governed actions) --------------------
const FALLBACK_JOBS: AgentJobRow[] = [
  {
    id: "fb-job-1", workflowName: "patient-outreach", agentName: "patientOutreach",
    eventName: "leafnerd.action:quality", status: "needs_approval", requiresApproval: true,
    label: "Generate outreach list for 184 reachable HbA1c-overdue patients",
    createdAt: "8m ago", completedAt: null,
    reasoning: { steps: 4, sources: ["QualityMeasure: CDC", "Encounter ×2,180", "Observation gaps ×1,083"], confidence: 0.91, summary: "Identified 184 reachable patients across Northbay, Riverside, Cedar; drafted outreach grouped by site and overdue interval." },
  },
  {
    id: "fb-job-2", workflowName: "source-anomaly-investigation", agentName: "anomalyInvestigator",
    eventName: "leafnerd.action:data", status: "needs_approval", requiresApproval: true,
    label: "Open interface incident — Riverside Lab volume −41%",
    createdAt: "21m ago", completedAt: null,
    reasoning: { steps: 3, sources: ["Observation throughput", "Source: Riverside HL7v2", "Baseline ×30d"], confidence: 0.74, summary: "Throughput fell 41% vs. stable 30-day baseline, isolated to one endpoint; recommends interface incident + integration-team notify." },
  },
  {
    id: "fb-job-3", workflowName: "terminology-remap", agentName: "mappingAssistant",
    eventName: "leafnerd.action:mapping", status: "running", requiresApproval: false,
    label: "Re-map 312 Northbay MedicationRequest codes to RxNorm",
    createdAt: "2m ago", completedAt: null,
    reasoning: { steps: 2, sources: ["MedicationRequest ×312", "RxNorm crosswalk"], confidence: 0.66, summary: "Matching local vocabulary (e.g. MTF1000) against RxNorm; 188/312 auto-mapped ≥0.8, remainder queued for steward review." },
    logs: [
      { at: "15:02:11", level: "info", message: "Claimed job · worker pool=mapping-2" },
      { at: "15:02:12", level: "info", message: "Loaded 312 unmapped MedicationRequest codes from Northbay EHR" },
      { at: "15:02:18", level: "info", message: "RxNorm crosswalk warm · 161,402 concepts indexed" },
      { at: "15:02:31", level: "info", message: "Auto-mapped 188/312 at ≥0.80 confidence" },
    ],
  },
  {
    id: "fb-job-4", workflowName: "adherence-drift-check", agentName: "adherenceDriftDetector",
    eventName: "leafnerd.action:risk", status: "succeeded", requiresApproval: false,
    label: "Review 42 diabetes-cohort patients with missing refill events",
    createdAt: "1h ago", completedAt: "52m ago",
    reasoning: { steps: 5, sources: ["MedicationRequest ×312", "Encounter ×1,044", "DoseLog"], confidence: 0.88, summary: "Flagged 42 patients with refill gaps + incomplete follow-up; produced a prioritized review list with last-fill recency." },
  },
  {
    id: "fb-job-5", workflowName: "quality-measure-analysis", agentName: "qualityImprovement",
    eventName: "scheduled.daily", status: "succeeded", requiresApproval: false,
    label: "Recompute HEDIS CDC measure across active panel",
    createdAt: "6h ago", completedAt: "6h ago",
    reasoning: { steps: 6, sources: ["QualityMeasure: CDC", "Patient ×48,210", "Observation: HbA1c ×640"], confidence: 0.95, summary: "Refreshed numerator/denominator per site; surfaced 3-site concentration of overdue HbA1c." },
  },
  {
    id: "fb-job-6", workflowName: "identity-resolution", agentName: "mpiResolver",
    eventName: "scheduled.hourly", status: "needs_approval", requiresApproval: true,
    label: "Review 58 candidate duplicate patient identities (≥0.85 match)",
    createdAt: "3h ago", completedAt: null,
    reasoning: { steps: 3, sources: ["Patient match engine", "58 candidate pairs"], confidence: 0.86, summary: "Probabilistic match surfaced 58 high-similarity pairs above the 0.85 auto-link floor; routed to steward for merge/keep-separate." },
  },
  {
    id: "fb-job-7", workflowName: "source-freshness-monitor", agentName: "sourceFreshness",
    eventName: "scheduled.hourly", status: "succeeded", requiresApproval: false,
    label: "Hourly ingestion freshness sweep across 4 sources",
    createdAt: "14m ago", completedAt: "14m ago",
    reasoning: { steps: 2, sources: ["Ingestion monitor", "4 active feeds"], confidence: 0.97, summary: "All feeds within SLA except Riverside HL7v2 (gap detected at 15:00); emitted anomaly." },
  },
  {
    id: "fb-job-8", workflowName: "claims-scrub", agentName: "chargeIntegrity",
    eventName: "claim.created", status: "failed", requiresApproval: false,
    label: "Scrub claim CLM-48217 (dx/procedure mismatch)",
    createdAt: "2h ago", completedAt: "2h ago",
    reasoning: { steps: 3, sources: ["Claim CLM-48217", "NCCI edits", "ICD-10 F41.1"], confidence: 0.59, summary: "Blocked: ICD-10 F41.1 does not support the billed level-3 E/M; returned to coder." },
    logs: [
      { at: "13:41:02", level: "info", message: "Claimed claim CLM-48217 for scrub" },
      { at: "13:41:03", level: "info", message: "Loaded NCCI edit set + ICD-10 linkage rules" },
      { at: "13:41:05", level: "error", message: "ICD-10 F41.1 does not support billed level-3 E/M — returned to coder" },
    ],
  },
];

const FALLBACK_SOURCES: SourceFreshnessRow[] = [
  { id: "src-1", source: "Northbay EHR", kind: "FHIR R4 · US Core", lastSeen: "9m ago", state: "ok", recordsToday: 4120, note: "312 MedicationRequest codes unmapped" },
  { id: "src-2", source: "Riverside Lab", kind: "HL7v2 ORU", lastSeen: "2h ago", state: "gap", recordsToday: 710, note: "−41% vs. baseline · interface incident" },
  { id: "src-3", source: "Cedar Clinic EHR", kind: "FHIR R4", lastSeen: "14m ago", state: "ok", recordsToday: 2380, note: null },
  { id: "src-4", source: "Statewide HIE", kind: "CDA / CCD", lastSeen: "3h ago", state: "stale", recordsToday: 96, note: "CCDA documents pending parse" },
  { id: "src-5", source: "Payer 837/835", kind: "Claims / ERA", lastSeen: "41m ago", state: "ok", recordsToday: 1840, note: null },
  { id: "src-6", source: "Wearable gateway", kind: "Device feed", lastSeen: "6m ago", state: "ok", recordsToday: 12044, note: null },
];

function buildFallback(): AgentWorkbenchData {
  const jobs = FALLBACK_JOBS.map((j) => ({ ...j }));
  return {
    jobs,
    sources: FALLBACK_SOURCES.map((s) => ({ ...s })),
    stats: {
      total: jobs.length,
      needsApproval: jobs.filter((j) => j.status === "needs_approval").length,
      succeededToday: jobs.filter((j) => j.status === "succeeded").length,
      running: jobs.filter((j) => j.status === "running").length,
    },
  };
}

function rel(d: Date | null | undefined): string | null {
  if (!d) return null;
  const ms = Date.now() - d.getTime();
  const m = Math.round(ms / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}

/** Real AgentJob/AgentReasoning rows for the demo org, with curated fallback. Never throws. */
export async function getAgentWorkbenchData(): Promise<AgentWorkbenchData> {
  const fallback = buildFallback();
  let prisma: typeof import("@/lib/db/prisma").prisma | null = null;
  try {
    prisma = (await import("@/lib/db/prisma")).prisma;
  } catch {
    return fallback;
  }
  if (!prisma) return fallback;

  try {
    const org = await prisma.organization.findUnique({ where: { slug: DEMO_ORG_SLUG }, select: { id: true } });
    const where = org ? { organizationId: org.id } : {};
    const rows = await prisma.agentJob.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: 40,
    });
    if (!rows.length) return fallback;

    const reasonings = await prisma.agentReasoning
      .findMany({ where: { agentJobId: { in: rows.map((r) => r.id) } } })
      .catch(() => [] as Array<{ agentJobId: string | null; steps: unknown; sources: unknown; confidence: number | null; summary: string | null }>);
    const byJob = new Map<string, (typeof reasonings)[number]>();
    for (const r of reasonings) if (r.agentJobId && !byJob.has(r.agentJobId)) byJob.set(r.agentJobId, r);

    const jobs: AgentJobRow[] = rows.map((j) => {
      const input = (j.input ?? {}) as Record<string, unknown>;
      const label =
        (typeof input.label === "string" && input.label) ||
        (typeof input.action === "string" && input.action) ||
        null;
      const re = byJob.get(j.id);
      return {
        id: j.id,
        workflowName: j.workflowName,
        agentName: j.agentName,
        eventName: j.eventName,
        status: j.status as AgentJobStatusLite,
        requiresApproval: j.requiresApproval,
        label,
        createdAt: rel(j.createdAt),
        completedAt: rel(j.completedAt),
        reasoning: re
          ? {
              steps: Array.isArray(re.steps) ? (re.steps as unknown[]).length : 0,
              // sources may be an array of label strings (UI chip shape) or the
              // documented object-of-arrays map; keep array labels intact and
              // only fall back to keys for the map, never emit bare indices.
              sources: reasoningSources(re.sources),
              confidence: re.confidence ?? null,
              summary: re.summary ?? null,
            }
          : null,
        logs: coerceLogLines(j.logs),
        paused: j.status === "pending" && isParked(j.runAfter),
      };
    });

    // Merge: real jobs first, then enough curated history so the board never looks thin.
    const merged = [...jobs];
    if (merged.length < 6) {
      for (const f of fallback.jobs) {
        if (merged.length >= 8) break;
        merged.push(f);
      }
    }

    return {
      jobs: merged,
      sources: fallback.sources, // source freshness stays curated until integration metadata is wired
      stats: {
        total: merged.length,
        needsApproval: merged.filter((j) => j.status === "needs_approval").length,
        succeededToday: merged.filter((j) => j.status === "succeeded").length,
        running: merged.filter((j) => j.status === "running").length,
      },
    };
  } catch {
    return fallback;
  }
}

// ---------------------------------------------------------------------------
// Governed job actions — the human lifecycle controls (approve / reject / pause
// / retry / cancel). Every dispatch writes an AuditLog row, applied or not, so
// the governed-execution invariant ("every AI action is bounded + audited")
// holds even when a click targets a curated/demo row or an invalid state.
// ---------------------------------------------------------------------------

export const AGENT_JOB_ACTIONS: readonly AgentJobAction[] = [
  "approve",
  "reject",
  "pause",
  "retry",
  "cancel",
] as const;

export function isAgentJobAction(v: unknown): v is AgentJobAction {
  return typeof v === "string" && (AGENT_JOB_ACTIONS as readonly string[]).includes(v);
}

/** Statuses an action may legally transition *from*. */
const ALLOWED_FROM: Record<AgentJobAction, AgentJobStatusLite[]> = {
  approve: ["needs_approval"],
  reject: ["needs_approval"],
  pause: ["pending", "claimed", "running"],
  retry: ["failed", "cancelled", "pending"],
  cancel: ["pending", "claimed", "running", "needs_approval", "failed"],
};

/** Dot-namespaced AuditLog action per dispatch (mirrors Mission Control). */
const AUDIT_ACTION: Record<AgentJobAction, string> = {
  approve: "agent.job.approved",
  reject: "agent.job.rejected",
  pause: "agent.job.paused",
  retry: "agent.job.retried",
  cancel: "agent.job.cancelled",
};

type JobForTransition = { id: string; status: string; runAfter: Date | null; logs: unknown };

/** The prisma `data` patch + the human-action log line for an action. */
function buildTransition(
  action: AgentJobAction,
  actorUserId: string,
): { data: Record<string, unknown>; logLine: AgentLogLine } {
  const now = new Date();
  const line = (level: AgentLogLine["level"], message: string): AgentLogLine => ({
    at: now.toISOString(),
    level,
    message,
  });
  switch (action) {
    case "approve":
      return {
        data: { status: "succeeded", approvedById: actorUserId, approvedAt: now, completedAt: now },
        logLine: line("info", "Approved by reviewer — cleared to run."),
      };
    case "reject":
      return {
        data: {
          status: "cancelled",
          approvedById: actorUserId,
          approvedAt: now,
          completedAt: now,
          lastError: "Rejected by reviewer",
        },
        logLine: line("warn", "Rejected by reviewer — job cancelled."),
      };
    case "pause":
      return {
        data: { status: "pending", runAfter: PAUSE_PARK_AT },
        logLine: line("warn", "Paused by operator — execution parked."),
      };
    case "retry":
      return {
        data: { status: "pending", runAfter: now, lastError: null, completedAt: null },
        logLine: line("info", "Re-queued by operator — awaiting worker claim."),
      };
    case "cancel":
      return {
        data: { status: "cancelled", completedAt: now },
        logLine: line("warn", "Cancelled by operator."),
      };
  }
}

/** Is `action` legal from this job's current state? (paused/pending nuance included.) */
function transitionAllowed(action: AgentJobAction, job: JobForTransition): boolean {
  const from = job.status as AgentJobStatusLite;
  if (!ALLOWED_FROM[action].includes(from)) return false;
  if (from === "pending") {
    const parked = isParked(job.runAfter);
    // Only a *parked* (paused) pending job can be retried/resumed; a freshly
    // queued one is already on its way. And an already-parked job can't re-pause.
    if (action === "retry" && !parked) return false;
    if (action === "pause" && parked) return false;
  }
  return true;
}

/**
 * Dispatch a human lifecycle action against a governed job. Org-scoped (own org
 * or shared null-org system jobs) and status-guarded. ALWAYS writes an AuditLog
 * row — even when the row is missing (curated/demo id) or the state is invalid —
 * so every dispatch is auditable. Never throws.
 */
export async function dispatchJobAction(args: {
  jobId: string;
  action: AgentJobAction;
  actorUserId: string;
  organizationId: string | null;
}): Promise<AgentJobActionResult> {
  const { jobId, action, actorUserId, organizationId } = args;
  const result: AgentJobActionResult = {
    ok: true,
    action,
    jobId,
    applied: false,
    audited: false,
    status: null,
  };

  const prisma = await getPrisma();
  if (!prisma) return { ...result, ok: false, note: "db-unavailable" };

  const orgWhere = organizationId
    ? { OR: [{ organizationId }, { organizationId: null }] }
    : { organizationId: null };

  let fromStatus: AgentJobStatusLite | null = null;
  let toStatus: AgentJobStatusLite | null = null;

  try {
    const job = (await prisma.agentJob.findFirst({
      where: { id: jobId, ...orgWhere },
      select: { id: true, status: true, runAfter: true, logs: true },
    })) as JobForTransition | null;

    if (!job) {
      result.note = "not-found"; // curated/demo id or outside caller's org
    } else {
      fromStatus = job.status as AgentJobStatusLite;
      result.status = fromStatus;
      if (!transitionAllowed(action, job)) {
        result.note = "invalid-state";
      } else {
        const { data, logLine } = buildTransition(action, actorUserId);
        const nextLogs = [...coerceLogLines(job.logs), logLine];
        const updated = await prisma.agentJob.update({
          where: { id: jobId },
          data: { ...data, logs: nextLogs as never },
          select: { status: true },
        });
        toStatus = updated.status as AgentJobStatusLite;
        result.applied = true;
        result.status = toStatus;
      }
    }
  } catch {
    result.note = "transition-error";
  }

  // Audit EVERY dispatch — the governed-execution invariant.
  try {
    await prisma.auditLog.create({
      data: {
        actorUserId,
        action: AUDIT_ACTION[action],
        subjectType: "AgentJob",
        subjectId: jobId,
        organizationId: organizationId ?? undefined,
        metadata: {
          action,
          applied: result.applied,
          fromStatus,
          toStatus,
          note: result.note ?? null,
        },
      },
    });
    result.audited = true;
  } catch {
    result.audited = false;
  }

  return result;
}

/** Latest status + streamed logs for one job (org-scoped). Powers the live console poll. */
export async function getAgentJobLogs(
  jobId: string,
  organizationId: string | null,
): Promise<{ jobId: string; status: AgentJobStatusLite | null; logs: AgentLogLine[] }> {
  const prisma = await getPrisma();
  if (!prisma) return { jobId, status: null, logs: [] };
  try {
    const orgWhere = organizationId
      ? { OR: [{ organizationId }, { organizationId: null }] }
      : { organizationId: null };
    const job = await prisma.agentJob.findFirst({
      where: { id: jobId, ...orgWhere },
      select: { status: true, logs: true },
    });
    if (!job) return { jobId, status: null, logs: [] };
    return { jobId, status: job.status as AgentJobStatusLite, logs: coerceLogLines(job.logs) };
  } catch {
    return { jobId, status: null, logs: [] };
  }
}
