"use client";

import { useMemo, useState } from "react";
import {
  AGENT_CATALOG,
  CATEGORY_LABELS,
  PROVIDERS,
  TIER_LABELS,
  allModels,
  findModel,
  getDefaultConfig,
  leafjourneyMonthlyPrice,
  leafjourneyPriceBasis,
  monthlyCostForAgent,
  LEAFJOURNEY_PRICE_FLOOR_USD,
  type AgentCatalogEntry,
  type AgentCategory,
  type ModelOption,
  type ModelTier,
} from "@/lib/domain/byok";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils/cn";

// Use the practice default if no per-agent override is set.
const DEFAULT_MODEL_ID = getDefaultConfig().modelId;

type FleetState = Record<string, { enabled: boolean; modelId: string | null }>;

const TIER_ORDER: ModelTier[] = ["budget", "balanced", "premium", "open-source"];
const CATEGORY_ORDER: AgentCategory[] = ["clinical", "safety", "patient", "billing", "operations", "commerce", "research", "pharmacology"];

const TIER_SWATCH: Record<ModelTier, string> = {
  "budget": "bg-emerald-500",
  "balanced": "bg-sky-500",
  "premium": "bg-amber-500",
  "open-source": "bg-purple-500",
};

const CATEGORY_EMOJI: Record<AgentCategory, string> = {
  clinical: "🩺",
  safety: "🛡️",
  patient: "🌱",
  billing: "💳",
  operations: "⚙️",
  commerce: "🛒",
  research: "🔬",
  pharmacology: "💊",
};

import { saveAiConfigAction } from "./actions";

export function AgentFleetPanel({ initialAiConfig }: { initialAiConfig: any }) {
  const [fleet, setFleet] = useState<FleetState>(() => {
    const savedFleet = initialAiConfig?.fleet ?? {};
    return Object.fromEntries(
      AGENT_CATALOG.map((a) => {
        const saved = savedFleet[a.id] ?? { enabled: true, modelId: null };
        return [a.id, saved];
      }),
    );
  });
  const [tierFilter, setTierFilter] = useState<"all" | ModelTier>("all");
  const [categoryFilter, setCategoryFilter] = useState<"all" | AgentCategory>("all");
  const [saved, setSaved] = useState(false);

  const catalog = useMemo(() => {
    return AGENT_CATALOG.filter((a) => {
      if (categoryFilter !== "all" && a.category !== categoryFilter) return false;
      if (tierFilter !== "all") {
        const effective = fleet[a.id]?.modelId ?? DEFAULT_MODEL_ID;
        const model = findModel(effective);
        if (!model || model.tier !== tierFilter) return false;
      }
      return true;
    });
  }, [fleet, tierFilter, categoryFilter]);

  const grouped = useMemo(() => {
    const map = new Map<AgentCategory, AgentCatalogEntry[]>();
    for (const agent of catalog) {
      const list = map.get(agent.category) ?? [];
      list.push(agent);
      map.set(agent.category, list);
    }
    return CATEGORY_ORDER
      .filter((c) => map.has(c))
      .map((c) => ({ category: c, agents: map.get(c)! }));
  }, [catalog]);

  const fleetTotals = useMemo(() => {
    let rawMonthly = 0;
    let enabledCount = 0;
    for (const agent of AGENT_CATALOG) {
      const state = fleet[agent.id];
      if (!state?.enabled) continue;
      enabledCount += 1;
      const model = findModel(state.modelId ?? DEFAULT_MODEL_ID);
      if (!model) continue;
      rawMonthly += monthlyCostForAgent(agent, model);
    }
    return {
      rawMonthly,
      leafjourney: leafjourneyMonthlyPrice(rawMonthly),
      basis: leafjourneyPriceBasis(rawMonthly),
      enabledCount,
    };
  }, [fleet]);

  function setAgent(agentId: string, patch: Partial<FleetState[string]>) {
    setFleet((prev) => ({
      ...prev,
      [agentId]: { ...prev[agentId], ...patch },
    }));
    setSaved(false);
  }

  function resetToDefaults() {
    setFleet(
      Object.fromEntries(
        AGENT_CATALOG.map((a) => [a.id, { enabled: true, modelId: null }]),
      ),
    );
    setSaved(false);
  }

  const handleSave = async () => {
    try {
      await saveAiConfigAction({
        fleet,
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (e) {
      console.error(e);
      alert("Failed to save fleet configuration");
    }
  };


  const defaultModel = findModel(DEFAULT_MODEL_ID);

  return (
    <div className="space-y-6">
      {/* Header + pricing explainer */}
      <Card tone="ambient">
        <CardContent className="py-4 px-6">
          <p className="text-sm text-text-muted leading-relaxed">
            Assign a different model to each of the {AGENT_CATALOG.length} agents in the fleet. Agents without
            an override use the practice default ({defaultModel?.name ?? "—"}). Disable any agent you don&apos;t use.
          </p>
        </CardContent>
      </Card>

      {/* Fleet totals */}
      <Card tone="raised">
        <CardContent className="py-5">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-6 items-end">
            <div>
              <p className="text-xs font-medium uppercase tracking-wider text-text-subtle mb-1">Active agents</p>
              <p className="text-2xl font-display text-text tabular-nums">
                {fleetTotals.enabledCount}<span className="text-sm text-text-muted font-sans">/{AGENT_CATALOG.length}</span>
              </p>
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-wider text-text-subtle mb-1">Estimated cost</p>
              <p className="text-2xl font-display text-accent tabular-nums">
                ${fleetTotals.leafjourney.toFixed(2)}<span className="text-sm text-text-muted font-sans">/mo</span>
              </p>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="secondary" size="sm" onClick={resetToDefaults}>
                Reset
              </Button>
              {saved && <span className="text-sm text-emerald-600 font-medium self-center">Saved!</span>}
              <Button size="sm" onClick={handleSave}>Save fleet</Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-center">
        <span className="text-xs font-medium uppercase tracking-wider text-text-subtle">Category</span>
        <FilterChip active={categoryFilter === "all"} onClick={() => setCategoryFilter("all")}>All</FilterChip>
        {CATEGORY_ORDER.map((c) => (
          <FilterChip key={c} active={categoryFilter === c} onClick={() => setCategoryFilter(c)}>
            {CATEGORY_EMOJI[c]} {CATEGORY_LABELS[c]}
          </FilterChip>
        ))}
        <span className="w-px h-4 bg-border-strong mx-1" />
        <span className="text-xs font-medium uppercase tracking-wider text-text-subtle">Tier</span>
        <FilterChip active={tierFilter === "all"} onClick={() => setTierFilter("all")}>All</FilterChip>
        {TIER_ORDER.map((t) => (
          <FilterChip key={t} active={tierFilter === t} onClick={() => setTierFilter(t)}>
            <span className={cn("inline-block h-2 w-2 rounded-full mr-1.5", TIER_SWATCH[t])} />
            {TIER_LABELS[t]}
          </FilterChip>
        ))}
      </div>

      {/* Grouped agent rows */}
      {grouped.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-text-muted">
            No agents match those filters.
          </CardContent>
        </Card>
      ) : (
        grouped.map(({ category, agents }) => (
          <Card key={category}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <span>{CATEGORY_EMOJI[category]}</span>
                <span>{CATEGORY_LABELS[category]}</span>
                <Badge tone="neutral">{agents.length}</Badge>
              </CardTitle>
              <CardDescription>
                {category === "safety"
                  ? "Guardrail agents — default to premium models for quality-sensitive decisions."
                  : category === "billing"
                  ? "Revenue-cycle fleet. Appeals + coding benefit from premium models; routine triage is fine on budget."
                  : category === "patient"
                  ? "Voice-sensitive agents. Nurse Nora and Wellness Coach meaningfully improve on balanced+ models."
                  : category === "operations"
                  ? "Supporting staff — budget models are usually enough."
                  : category === "commerce"
                  ? "Marketplace fleet. Compliance + fraud benefit from premium models; catalog hygiene is fine on budget."
                  : category === "research"
                  ? "Research + insights fleet. RWE and protocol recommendations benefit from premium models; cohort math is fine on budget."
                  : category === "pharmacology"
                  ? "Cannabis pharmacology fleet. Interaction checkers + perinatal framing want premium models; route + terpene work is fine on balanced."
                  : "Core clinical agents that shape the physician's daily workflow."}
              </CardDescription>
            </CardHeader>
            <CardContent className="divide-y divide-border">
              {agents.map((agent) => {
                const state = fleet[agent.id] ?? { enabled: true, modelId: null };
                const effectiveModelId = state.modelId ?? DEFAULT_MODEL_ID;
                const model = findModel(effectiveModelId);
                const raw = model ? monthlyCostForAgent(agent, model) : 0;
                return (
                  <AgentRow
                    key={agent.id}
                    agent={agent}
                    model={model}
                    rawMonthly={raw}
                    enabled={state.enabled}
                    usingDefault={state.modelId === null}
                    onToggle={() => setAgent(agent.id, { enabled: !state.enabled })}
                    onModelChange={(modelId) => setAgent(agent.id, { modelId })}
                  />
                );
              })}
            </CardContent>
          </Card>
        ))
      )}
    </div>
  );
}

function FilterChip({
  children,
  active,
  onClick,
}: {
  children: React.ReactNode;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex items-center px-3 py-1.5 rounded-full text-xs font-medium border transition-all",
        active
          ? "bg-accent text-accent-ink border-accent"
          : "bg-surface-raised text-text-muted border-border hover:border-border-strong hover:text-text",
      )}
    >
      {children}
    </button>
  );
}

function AgentRow({
  agent,
  model,
  rawMonthly,
  enabled,
  usingDefault,
  onToggle,
  onModelChange,
}: {
  agent: AgentCatalogEntry;
  model: (ModelOption & { providerLabel: string }) | undefined;
  rawMonthly: number;
  enabled: boolean;
  usingDefault: boolean;
  onToggle: () => void;
  onModelChange: (modelId: string | null) => void;
}) {
  const leafjourney = leafjourneyMonthlyPrice(rawMonthly);
  return (
    <div className={cn("py-4 grid grid-cols-12 gap-4 items-center", !enabled && "opacity-50")}>
      {/* Enabled toggle + agent info */}
      <div className="col-span-12 md:col-span-5 flex items-start gap-3">
        <Toggle enabled={enabled} onToggle={onToggle} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-medium text-text">{agent.displayName}</span>
            {agent.qualitySensitive && (
              <Badge tone="accent">Quality-sensitive</Badge>
            )}
          </div>
          <p className="text-xs text-text-muted mt-0.5 leading-relaxed">{agent.description}</p>
          <p className="text-[10px] text-text-subtle mt-1 tabular-nums">
            ~{(agent.estimatedTokensPerMonth / 1000).toFixed(0)}k tokens/mo &middot; default tier: {TIER_LABELS[agent.defaultTier]}
          </p>
        </div>
      </div>

      {/* Model picker */}
      <div className="col-span-8 md:col-span-5">
        <ModelSelect
          value={usingDefault ? "__default__" : (model?.id ?? "__default__")}
          onChange={(id) => onModelChange(id === "__default__" ? null : id)}
          disabled={!enabled}
        />
        {model && !usingDefault && (
          <p className="text-[10px] text-text-subtle mt-1 truncate">
            via {model.providerLabel}{model.blurb ? ` — ${model.blurb}` : ""}
          </p>
        )}
        {usingDefault && (
          <p className="text-[10px] text-text-subtle mt-1">
            Using practice default
          </p>
        )}
      </div>

      {/* Cost */}
      <div className="col-span-4 md:col-span-2 text-right">
        <p className="text-sm font-medium text-text tabular-nums">${leafjourney.toFixed(2)}/mo</p>
      </div>
    </div>
  );
}

function Toggle({ enabled, onToggle }: { enabled: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={enabled}
      onClick={onToggle}
      className={cn(
        "relative inline-flex h-5 w-9 shrink-0 rounded-full transition-colors mt-0.5",
        enabled ? "bg-accent" : "bg-surface-muted border border-border-strong",
      )}
    >
      <span
        className={cn(
          "inline-block h-4 w-4 rounded-full bg-white shadow transition-transform",
          enabled ? "translate-x-[18px]" : "translate-x-0.5",
        )}
        style={{ marginTop: 1 }}
      />
    </button>
  );
}

function ModelSelect({
  value,
  onChange,
  disabled,
}: {
  value: string;
  onChange: (modelId: string) => void;
  disabled?: boolean;
}) {
  // Build grouped option list: default → per-provider by tier.
  const models = allModels();
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled}
      className={cn(
        "w-full h-10 rounded-lg border border-border bg-surface-raised px-3 text-sm text-text",
        "focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent/20",
        disabled && "cursor-not-allowed",
      )}
    >
      <option value="__default__">Use practice default</option>
      {PROVIDERS.map((provider) => {
        const providerModels = models.filter((m) => m.provider === provider.provider);
        if (providerModels.length === 0) return null;
        return TIER_ORDER.map((tier) => {
          const tierModels = providerModels.filter((m) => m.tier === tier);
          if (tierModels.length === 0) return null;
          return (
            <optgroup
              key={`${provider.provider}-${tier}`}
              label={`${provider.label} — ${TIER_LABELS[tier]}`}
            >
              {tierModels.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name} {m.recommended ? "★" : ""} (${m.costPer1kTokens}/1k)
                </option>
              ))}
            </optgroup>
          );
        });
      })}
    </select>
  );
}
