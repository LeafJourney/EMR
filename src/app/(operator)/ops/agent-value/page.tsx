import { requireUser } from "@/lib/auth/session";
import { PageHeader, PageShell } from "@/components/shell/PageHeader";
import { MetricTile } from "@/components/ui/metric-tile";
import { getOrgUsageSummary } from "@/lib/db/llm-usage";
import { getOrgOutcomeSummary } from "@/lib/ai/agent-outcomes";
import { formatUsdFromMicroCents } from "@/lib/ai/pricing";

export const metadata = { title: "Agent Value" };
export const dynamic = "force-dynamic";

// Phase 0 telemetry — the Agent Value surface.
//
// Mission Control answers "what is the fleet doing?". This page answers the
// question that proves the harness earns its keep: "is the fleet creating real
// workflow advantage, and what does it cost to run?". It joins two ledgers that
// were dark until Phase 0 — LlmUsage (now priced from the byok catalog) and
// AgentOutcome (acceptance + minutes saved) — into one operator view.

function formatHoursSaved(minutes: number): string {
  if (minutes <= 0) return "0h";
  const hours = minutes / 60;
  if (hours < 1) return `${minutes}m`;
  return `${hours.toFixed(1)}h`;
}

function formatRate(rate: number | null): string {
  if (rate === null) return "—";
  return `${Math.round(rate * 100)}%`;
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

export default async function AgentValuePage() {
  const user = await requireUser();
  const organizationId = user.organizationId;

  if (!organizationId) {
    return (
      <PageShell>
        <PageHeader
          eyebrow="Agent value"
          title="Agent value"
          description="No organization in context."
        />
      </PageShell>
    );
  }

  const [usage, outcomes] = await Promise.all([
    getOrgUsageSummary(organizationId),
    getOrgOutcomeSummary(organizationId),
  ]);

  const hasOutcomes = outcomes.totals.decisions > 0;
  const hasUsage = usage.totals.calls > 0;

  return (
    <PageShell maxWidth="max-w-[1200px]">
      <PageHeader
        eyebrow="Agent value"
        title="Agent value"
        description="What the agent fleet saved your team and what it cost to run, over the last 30 days."
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricTile
          label="Time saved (est.)"
          value={formatHoursSaved(outcomes.totals.minutesSaved)}
          accent="forest"
          hint="From accepted agent output × per-task baseline"
        />
        <MetricTile
          label="Acceptance rate"
          value={formatRate(outcomes.totals.acceptanceRate)}
          accent="forest"
          hint={`${outcomes.totals.accepted} accepted · ${outcomes.totals.rejected} rejected`}
        />
        <MetricTile
          label="LLM spend (30d)"
          value={formatUsdFromMicroCents(usage.totals.costMicroCents)}
          accent="amber"
          hint={`${formatTokens(usage.totals.tokensTotal)} tokens · ${usage.totals.calls} calls`}
        />
        <MetricTile
          label="Decisions logged"
          value={outcomes.totals.decisions}
          hint={`${outcomes.totals.autoApplied} auto-applied · ${outcomes.totals.dismissed} dismissed`}
        />
      </div>

      {/* Value by agent */}
      <section className="mt-8">
        <h2 className="mb-3 text-sm font-medium uppercase tracking-[0.14em] text-text-subtle">
          Value by agent
        </h2>
        {hasOutcomes ? (
          <div className="overflow-hidden rounded-xl border border-border bg-surface-raised">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-text-subtle">
                  <th className="px-4 py-3 font-medium">Agent</th>
                  <th className="px-4 py-3 font-medium tabular-nums">Decisions</th>
                  <th className="px-4 py-3 font-medium tabular-nums">Accepted</th>
                  <th className="px-4 py-3 font-medium tabular-nums">Acceptance</th>
                  <th className="px-4 py-3 font-medium tabular-nums">Time saved</th>
                </tr>
              </thead>
              <tbody>
                {outcomes.byAgent.map((a) => (
                  <tr key={a.agentName} className="border-b border-border/60 last:border-0">
                    <td className="px-4 py-3 font-medium text-text">{a.agentName}</td>
                    <td className="px-4 py-3 tabular-nums text-text-muted">{a.decisions}</td>
                    <td className="px-4 py-3 tabular-nums text-text-muted">{a.accepted}</td>
                    <td className="px-4 py-3 tabular-nums text-text-muted">{formatRate(a.acceptanceRate)}</td>
                    <td className="px-4 py-3 tabular-nums text-text">{formatHoursSaved(a.minutesSaved)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="rounded-xl border border-dashed border-border bg-surface-raised px-4 py-8 text-center text-sm text-text-subtle">
            No agent outcomes recorded yet. Approve or reject a job in Mission
            Control and it will show up here.
          </p>
        )}
      </section>

      {/* Spend by model */}
      <section className="mt-8">
        <h2 className="mb-3 text-sm font-medium uppercase tracking-[0.14em] text-text-subtle">
          Spend by model
        </h2>
        {hasUsage ? (
          <div className="overflow-hidden rounded-xl border border-border bg-surface-raised">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-text-subtle">
                  <th className="px-4 py-3 font-medium">Model</th>
                  <th className="px-4 py-3 font-medium tabular-nums">Calls</th>
                  <th className="px-4 py-3 font-medium tabular-nums">Tokens</th>
                  <th className="px-4 py-3 font-medium tabular-nums">Cost</th>
                </tr>
              </thead>
              <tbody>
                {usage.byModel.map((m) => (
                  <tr key={m.key} className="border-b border-border/60 last:border-0">
                    <td className="px-4 py-3 font-medium text-text">{m.key}</td>
                    <td className="px-4 py-3 tabular-nums text-text-muted">{m.calls}</td>
                    <td className="px-4 py-3 tabular-nums text-text-muted">{formatTokens(m.tokensTotal)}</td>
                    <td className="px-4 py-3 tabular-nums text-text">{formatUsdFromMicroCents(m.costMicroCents)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="rounded-xl border border-dashed border-border bg-surface-raised px-4 py-8 text-center text-sm text-text-subtle">
            No model usage recorded yet.
          </p>
        )}
      </section>
    </PageShell>
  );
}
