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

  // Live stats derived from local state so approve/reject reflects immediately.
  const stats = {
    total: jobs.length,
    needsApproval: jobs.filter((j) => j.status === "needs_approval").length,
    running: jobs.filter((j) => j.status === "running").length,
    succeeded: jobs.filter((j) => j.status === "succeeded").length,
  };

  const pending = jobs.filter((j) => j.status === "needs_approval");

  const act = (job: AgentJobRow, action: "approve" | "reject") => {
    const nextStatus: AgentJobStatusLite = action === "approve" ? "succeeded" : "cancelled";
    // Optimistic local update.
    setJobs((prev) =>
      prev.map((j) =>
        j.id === job.id ? { ...j, status: nextStatus, completedAt: j.completedAt ?? "just now" } : j,
      ),
    );
    toast?.(
      action === "approve"
        ? `Approved — ${job.agentName} cleared to run: ${job.label ?? job.workflowName}`
        : `Rejected — ${job.agentName} cancelled: ${job.label ?? job.workflowName}`,
    );
    // Fire-and-forget to the governed-action endpoint; the optimistic update
    // stands regardless (curated rows aren't actionable in demo scope).
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
                    <td><Badge tone={statusTone(job.status)} dot={false}>{statusLabel(job.status)}</Badge></td>
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
