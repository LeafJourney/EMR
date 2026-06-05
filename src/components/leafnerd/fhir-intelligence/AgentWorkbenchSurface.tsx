"use client";
/* LEAFNERD — Governed Execution · Agent Workbench
 *
 * The screen that proves the agentic spine is real: every AI action is a
 * bounded, audited AgentJob. Default posture is autonomy OFF, dry-run ON, and
 * human approval required for anything that touches a patient. A reviewer sees
 * the reasoning + evidence behind each pending job and approves or rejects it;
 * the recent-activity log and source monitor make the whole loop auditable.
 *
 * Cardinal resilience rule: renders fully with ZERO props via the curated
 * fallback below (mirrors src/lib/leafnerd/agent-workbench.ts). Jobs are held
 * in React state so approve/reject can optimistically update.
 */
import React from "react";
import { Icon, Badge, Conf } from "./primitives";
import type {
  AgentWorkbenchData,
  AgentJobRow,
  AgentJobStatusLite,
  AgentJobAction,
  AgentLogLine,
  SourceFreshnessRow,
} from "@/lib/leafnerd/types";

// --- Curated fallback (mirrors agent-workbench.ts FALLBACK_*) --------------
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

// --- tone / label maps -----------------------------------------------------
const STATUS_TONE: Record<AgentJobStatusLite, string> = {
  succeeded: "green",
  running: "indigo",
  needs_approval: "amber",
  failed: "rose",
  pending: "gray",
  claimed: "gray",
  cancelled: "gray",
};

const STATUS_LABEL: Record<AgentJobStatusLite, string> = {
  succeeded: "Succeeded",
  running: "Running",
  needs_approval: "Needs approval",
  failed: "Failed",
  pending: "Pending",
  claimed: "Claimed",
  cancelled: "Cancelled",
};

const SOURCE_STATE: Record<SourceFreshnessRow["state"], { tone: string; label: string }> = {
  ok: { tone: "green", label: "Healthy" },
  stale: { tone: "amber", label: "Stale" },
  gap: { tone: "rose", label: "Gap" },
};

function statusTone(s: AgentJobStatusLite): string {
  return STATUS_TONE[s] ?? "gray";
}

function statusLabel(s: AgentJobStatusLite): string {
  return STATUS_LABEL[s] ?? s;
}

// --- execution log streaming ----------------------------------------------
// Active jobs (running/claimed, not paused) stream a live console. Real jobs
// poll the governed endpoint for authoritative AgentJob.logs; curated demo rows
// (ids prefixed "fb-") reveal a scripted continuation so the board feels live
// even with ZERO real jobs (the cardinal resilience rule).

const EMPTY_LOGS: AgentLogLine[] = [];

const DEMO_STREAM: Record<string, string[]> = {
  "terminology-remap": [
    "Built steward queue for 124 sub-0.80 matches",
    "Applying RxNorm SCD/SBD normal-form heuristics…",
    "Auto-mapped 14 more via ingredient + strength match",
    "Checkpoint flushed · 202/312 resolved",
    "Holding remaining 110 codes for steward review",
  ],
};

function demoStreamFor(job: AgentJobRow): string[] {
  return (
    DEMO_STREAM[job.workflowName] ?? [
      `Executing ${job.workflowName} · step in progress`,
      "Gathering evidence from bound sources…",
      "Intermediate checkpoint persisted",
      "Continuing under dry-run guard",
    ]
  );
}

/** A job is actively executing (and therefore streaming) when running/claimed and not paused. */
function isLive(job: AgentJobRow): boolean {
  return (job.status === "running" || job.status === "claimed") && !job.paused;
}

function shortTime(at: string): string {
  if (!at) return "";
  // ISO timestamps → HH:MM:SS; curated rows already carry a clock string.
  const t = at.indexOf("T");
  if (t >= 0) return at.slice(t + 1, t + 9);
  return at;
}

function logColor(level: AgentLogLine["level"]): string {
  return level === "error" ? "var(--rose)" : level === "warn" ? "var(--amber)" : "var(--ink-2)";
}

/**
 * Returns the live log lines for a job. Demo rows append scripted lines on a
 * timer; real rows replace with the server's authoritative buffer via polling.
 * Streaming only runs while `live` so a paused/finished job freezes its console.
 */
function useExecutionLog(job: AgentJobRow, live: boolean): AgentLogLine[] {
  const [lines, setLines] = React.useState<AgentLogLine[]>(job.logs ?? EMPTY_LOGS);
  // Cursor into the demo continuation script (separate from the seed buffer).
  // Held in a ref so pausing/resuming continues rather than restarting.
  const demoIdx = React.useRef<number>(0);

  React.useEffect(() => {
    if (!live) return;
    const isDemo = job.id.startsWith("fb-");

    if (isDemo) {
      const script = demoStreamFor(job);
      let i = Math.max(0, demoIdx.current);
      const t = setInterval(() => {
        if (i >= script.length) {
          window.clearInterval(t);
          return;
        }
        const msg = script[i];
        i += 1;
        demoIdx.current = i;
        const at = new Date().toISOString();
        setLines((prev) => [...prev, { at, level: "info", message: msg }]);
      }, 1500);
      return () => window.clearInterval(t);
    }

    // Real job — poll the governed endpoint; server logs are authoritative.
    let stopped = false;
    const poll = async () => {
      try {
        const r = await fetch(`/api/leafnerd/job-action?jobId=${encodeURIComponent(job.id)}`);
        if (!r.ok) return;
        const data = (await r.json()) as { logs?: AgentLogLine[] };
        if (!stopped && Array.isArray(data.logs)) setLines(data.logs);
      } catch {
        /* transient — next tick retries */
      }
    };
    void poll();
    const t = window.setInterval(poll, 1800);
    return () => {
      stopped = true;
      window.clearInterval(t);
    };
    // job identity + live state drive (re)subscription; log content is internal.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [job.id, live]);

  return lines;
}

/** Monospace, auto-scrolling execution console. */
function LogConsole({ lines, live }: { lines: AgentLogLine[]; live: boolean }) {
  const ref = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    const el = ref.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [lines.length]);
  const shown = lines.slice(-40);
  return (
    <div
      ref={ref}
      style={{
        fontFamily: "var(--mono)",
        fontSize: 11.5,
        lineHeight: 1.75,
        background: "var(--cream-deep)",
        border: "1px solid var(--line-soft)",
        borderRadius: 10,
        padding: "9px 11px",
        maxHeight: 156,
        overflowY: "auto",
      }}
    >
      {shown.length === 0 ? (
        <span style={{ color: "var(--faint)" }}>No log output yet…</span>
      ) : (
        shown.map((l, i) => (
          <div key={i} style={{ display: "flex", gap: 8, alignItems: "baseline" }}>
            <span style={{ color: "var(--faint)", flex: "none" }}>{shortTime(l.at)}</span>
            <span style={{ color: logColor(l.level), textWrap: "pretty" }}>{l.message}</span>
          </div>
        ))
      )}
      {live && (
        <div style={{ color: "var(--indigo)", marginTop: 2 }}>▍ streaming…</div>
      )}
    </div>
  );
}

/** One active/failed job: header + live console + lifecycle controls. */
function ExecutionCard({ job, act }: { job: AgentJobRow; act: (j: AgentJobRow, a: AgentJobAction) => void }) {
  const live = isLive(job);
  const lines = useExecutionLog(job, live);
  const paused = !!job.paused;
  const failed = job.status === "failed";

  const badge = paused
    ? { tone: "amber", label: "Paused" }
    : { tone: statusTone(job.status), label: statusLabel(job.status) };

  return (
    <div className="card card-pad" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div className="between" style={{ alignItems: "flex-start", gap: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", minWidth: 0 }}>
          <span style={{ fontSize: 13.5, fontWeight: 600, letterSpacing: "-.01em" }}>{job.agentName}</span>
          <Badge tone="indigo" dot={false}>{job.workflowName}</Badge>
        </div>
        <Badge tone={badge.tone} dot={!failed}>{badge.label}</Badge>
      </div>

      {job.label && (
        <div style={{ fontSize: 13.5, fontWeight: 550, lineHeight: 1.35, textWrap: "pretty" }}>{job.label}</div>
      )}

      <LogConsole lines={lines} live={live} />

      <div className="between" style={{ paddingTop: 10, borderTop: "1px solid var(--line-soft)", gap: 10, marginTop: "auto" }}>
        <span className="m-prov"><Icon name="clock" size={11} />{job.completedAt ?? job.createdAt ?? "—"}</span>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {failed ? (
            <button className="insight-action" onClick={() => act(job, "retry")}>
              <Icon name="refresh" size={13} />Retry
            </button>
          ) : paused ? (
            <button className="insight-action" onClick={() => act(job, "retry")}>
              <Icon name="play" size={13} />Resume
            </button>
          ) : (
            <button className="chip" onClick={() => act(job, "pause")}>
              <Icon name="pause" size={13} />Pause
            </button>
          )}
          <button className="chip" onClick={() => act(job, "cancel")}>
            <Icon name="x" size={13} />Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

// --- summary stat tile -----------------------------------------------------
function StatTile({ label, value, icon, color }: { label: string; value: number; icon: string; color: string }) {
  return (
    <div className="card card-pad">
      <div className="between">
        <span style={{ fontSize: 12.5, color: "var(--muted)" }}>{label}</span>
        <span style={{ color }}><Icon name={icon} size={16} /></span>
      </div>
      <div className="tnum" style={{ fontSize: 28, fontWeight: 600, letterSpacing: "-.025em", marginTop: 6 }}>
        {value.toLocaleString()}
      </div>
    </div>
  );
}

export function AgentWorkbenchSurface({
  data,
  toast,
}: {
  data?: AgentWorkbenchData;
  toast?: (m: string) => void;
}) {
  const seed = data && data.jobs.length ? data : buildFallback();
  const [jobs, setJobs] = React.useState<AgentJobRow[]>(seed.jobs);
  const sources = seed.sources && seed.sources.length ? seed.sources : FALLBACK_SOURCES;

  // Live stats derived from local state so every action reflects immediately.
  const stats = {
    total: jobs.length,
    needsApproval: jobs.filter((j) => j.status === "needs_approval").length,
    running: jobs.filter((j) => j.status === "running" || j.status === "claimed").length,
    succeeded: jobs.filter((j) => j.status === "succeeded").length,
  };

  const pending = jobs.filter((j) => j.status === "needs_approval");
  // Execution monitor: jobs with a live lifecycle a human can drive.
  const active = jobs.filter(
    (j) => j.status === "running" || j.status === "claimed" || j.status === "pending" || j.status === "failed",
  );

  // Optimistic local patch for each action so the UI updates before the
  // round-trip. Mirrors the server transition in agent-workbench.ts.
  const optimisticPatch = (action: AgentJobAction): Partial<AgentJobRow> => {
    switch (action) {
      case "approve":
        return { status: "succeeded", completedAt: "just now", paused: false };
      case "reject":
        return { status: "cancelled", completedAt: "just now", paused: false };
      case "cancel":
        return { status: "cancelled", completedAt: "just now", paused: false };
      case "pause":
        return { paused: true }; // stays "running" underneath; parked server-side
      case "retry":
        return { status: "running", paused: false, completedAt: null };
    }
  };

  const ACTION_TOAST: Record<AgentJobAction, string> = {
    approve: "Approved",
    reject: "Rejected",
    pause: "Paused",
    retry: "Re-queued",
    cancel: "Cancelled",
  };

  const act = (job: AgentJobRow, action: AgentJobAction) => {
    // Optimistic local update.
    setJobs((prev) => prev.map((j) => (j.id === job.id ? { ...j, ...optimisticPatch(action) } : j)));
    toast?.(`${ACTION_TOAST[action]} — ${job.agentName}: ${job.label ?? job.workflowName}`);
    // Fire-and-forget to the governed-action endpoint; it writes the AuditLog
    // entry and applies the real transition. The optimistic update stands even
    // for curated demo rows (which the server audits but cannot transition).
    void fetch("/api/leafnerd/job-action", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jobId: job.id, action }),
    }).catch(() => {});
  };

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <div className="eyebrow">Governed Execution</div>
          <h1 className="page-title">Agent Workbench</h1>
          <p className="page-lede">
            Every AI action is a bounded, audited job. Default posture: autonomy off, dry-run on,
            human approval for anything that touches a patient.
          </p>
        </div>
      </div>

      {/* posture / summary strip */}
      <div className="grid g-3" style={{ marginTop: 8 }}>
        <StatTile label="Jobs (window)" value={stats.total} icon="git" color="var(--ink-2)" />
        <StatTile label="Awaiting approval" value={stats.needsApproval} icon="shield" color={stats.needsApproval > 0 ? "var(--amber)" : "var(--canopy)"} />
        <StatTile label="Running" value={stats.running} icon="activity" color="var(--indigo)" />
      </div>

      <div className="wrap-gap" style={{ marginTop: 14 }}>
        <span className="chip"><Icon name="shield" size={13} />Autonomy: off</span>
        <span className="chip"><Icon name="eye" size={13} />Dry-run: on</span>
        <span className="chip"><Icon name="check" size={13} />Approval: required</span>
        <span className="chip"><Icon name="clipboard" size={13} />Every action audited</span>
        <span className="chip"><Icon name="check" size={13} />Succeeded: {stats.succeeded.toLocaleString()}</span>
      </div>

      {/* needs-approval section */}
      <div className="sec-title">
        <h2>Awaiting human approval</h2>
        <span className="count">{pending.length} pending</span>
      </div>

      {pending.length === 0 ? (
        <div className="card card-pad" style={{ display: "flex", alignItems: "center", gap: 12, color: "var(--ink-2)" }}>
          <span style={{ color: "var(--canopy)" }}><Icon name="check" size={18} /></span>
          <span style={{ fontSize: 13.5 }}>Queue clear — no governed jobs are waiting on a human decision.</span>
        </div>
      ) : (
        <div className="grid" style={{ gridTemplateColumns: "1fr 1fr" }}>
          {pending.map((job) => {
            const conf = job.reasoning?.confidence ?? null;
            const srcs = job.reasoning?.sources ?? [];
            return (
              <div key={job.id} className="card card-pad" style={{ display: "flex", flexDirection: "column", gap: 11 }}>
                {/* agent + workflow header */}
                <div className="between" style={{ alignItems: "flex-start", gap: 10 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", minWidth: 0 }}>
                    <span style={{ fontSize: 13.5, fontWeight: 600, letterSpacing: "-.01em" }}>{job.agentName}</span>
                    <Badge tone="indigo" dot={false}>{job.workflowName}</Badge>
                  </div>
                  <Badge tone="amber">Needs approval</Badge>
                </div>

                {/* label */}
                {job.label && (
                  <div style={{ fontSize: 14, fontWeight: 550, lineHeight: 1.35, textWrap: "pretty" }}>{job.label}</div>
                )}

                {/* reasoning summary + confidence */}
                {job.reasoning?.summary && (
                  <p style={{ fontSize: 13, color: "var(--ink-2)", lineHeight: 1.5, margin: 0, textWrap: "pretty" }}>
                    {job.reasoning.summary}
                  </p>
                )}
                {conf !== null && (
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontSize: 11.5, color: "var(--muted)" }}>Confidence</span>
                    <Conf value={conf} />
                  </div>
                )}

                {/* evidence chips */}
                {srcs.length > 0 && (
                  <div>
                    <div className="m-prov" style={{ marginBottom: 6 }}>
                      <Icon name="layers" size={11} />Evidence · {job.reasoning?.steps ?? srcs.length} steps
                    </div>
                    <div className="wrap-gap">
                      {srcs.map((s, i) => (
                        <Badge key={i} tone="gray" mono dot={false}>{s}</Badge>
                      ))}
                    </div>
                  </div>
                )}

                {/* actions */}
                <div className="between" style={{ paddingTop: 10, borderTop: "1px solid var(--line-soft)", gap: 10, marginTop: "auto" }}>
                  <span className="m-prov"><Icon name="clock" size={11} />{job.createdAt ?? "—"}</span>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <button className="chip" onClick={() => act(job, "reject")}>
                      <Icon name="x" size={13} />Reject
                    </button>
                    <button className="insight-action" onClick={() => act(job, "approve")}>
                      <Icon name="check" size={14} />Approve
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* execution monitor — live logs + lifecycle controls for active jobs */}
      <div className="sec-title">
        <h2>Execution monitor</h2>
        <span className="count">{active.length} active</span>
      </div>

      {active.length === 0 ? (
        <div className="card card-pad" style={{ display: "flex", alignItems: "center", gap: 12, color: "var(--ink-2)" }}>
          <span style={{ color: "var(--muted)" }}><Icon name="activity" size={18} /></span>
          <span style={{ fontSize: 13.5 }}>No jobs executing — the worker queue is idle.</span>
        </div>
      ) : (
        <div className="grid" style={{ gridTemplateColumns: "1fr 1fr" }}>
          {active.map((job) => (
            <ExecutionCard key={job.id} job={job} act={act} />
          ))}
        </div>
      )}

      {/* recent activity log */}
      <div className="sec-title">
        <h2>Recent activity</h2>
        <span className="count">{jobs.length} jobs</span>
      </div>
      <div className="tbl-wrap">
        <div className="tbl-scroll">
          <table className="tbl">
            <thead>
              <tr>
                <th>Agent</th>
                <th>Workflow</th>
                <th>Event</th>
                <th>Confidence</th>
                <th>Status</th>
                <th>When</th>
              </tr>
            </thead>
            <tbody>
              {jobs.map((job) => {
                const conf = job.reasoning?.confidence ?? null;
                return (
                  <tr key={job.id}>
                    <td><div className="pt-name">{job.agentName}</div></td>
                    <td><span style={{ fontSize: 12.5, color: "var(--ink-2)" }}>{job.workflowName}</span></td>
                    <td><Badge tone="gray" mono dot={false}>{job.eventName}</Badge></td>
                    <td>
                      {conf !== null
                        ? <div style={{ display: "inline-flex" }}><Conf value={conf} /></div>
                        : <span className="muted" style={{ fontSize: 12.5 }}>—</span>}
                    </td>
                    <td>
                      {job.paused
                        ? <Badge tone="amber" dot={false}>Paused</Badge>
                        : <Badge tone={statusTone(job.status)} dot={false}>{statusLabel(job.status)}</Badge>}
                    </td>
                    <td><span className="muted" style={{ fontSize: 12.5 }}>{job.completedAt ?? job.createdAt ?? "—"}</span></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* source monitoring */}
      <div className="sec-title">
        <h2>Source monitoring</h2>
        <span className="count">{sources.length} feeds</span>
      </div>
      <div className="tbl-wrap">
        <div className="tbl-scroll">
          <table className="tbl">
            <thead>
              <tr>
                <th>Source</th>
                <th>Kind</th>
                <th style={{ textAlign: "right" }}>Records today</th>
                <th>Last seen</th>
                <th>State</th>
                <th>Note</th>
              </tr>
            </thead>
            <tbody>
              {sources.map((src) => {
                const st = SOURCE_STATE[src.state] ?? { tone: "gray", label: src.state };
                return (
                  <tr key={src.id}>
                    <td><div className="pt-name">{src.source}</div></td>
                    <td><span style={{ fontSize: 12.5, color: "var(--ink-2)" }}>{src.kind}</span></td>
                    <td style={{ textAlign: "right" }} className="tnum">{src.recordsToday.toLocaleString()}</td>
                    <td><span className="muted" style={{ fontSize: 12.5 }}>{src.lastSeen}</span></td>
                    <td><Badge tone={st.tone} dot={false}>{st.label}</Badge></td>
                    <td><span style={{ fontSize: 12.5, color: src.note ? "var(--ink-2)" : "var(--faint)" }}>{src.note ?? "—"}</span></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

export default AgentWorkbenchSurface;
