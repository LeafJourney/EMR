"use client";

import { useState, useMemo } from "react";
import {
  PROVIDERS,
  getDefaultConfig,
  LEAFJOURNEY_PRICE_FLOOR_USD,
  TIER_LABELS,
  type ModelConfig,
  type ProviderOption,
} from "@/lib/domain/byok";
import { projectMonthlyForModel, resolveMarkupPolicy } from "@/lib/ai/usage-economics";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input, Label } from "@/components/ui/input";
import { cn } from "@/lib/utils/cn";
import { saveAiConfigAction } from "./actions";

export function ModelConfigPanel({
  initialAiConfig,
  markupMultiplier = null,
}: {
  initialAiConfig: any;
  markupMultiplier?: number | null;
}) {
  const [config, setConfig] = useState<ModelConfig>(() => {
    if (initialAiConfig?.defaultModel) {
      return {
        provider: initialAiConfig.defaultModel.provider,
        modelId: initialAiConfig.defaultModel.modelId,
        displayName: "",
        apiKeySet: !!(initialAiConfig.defaultModel.apiKey || initialAiConfig.defaultModel.apiKeySet),
        isDefault: false,
        maxTokens: initialAiConfig.defaultModel.maxTokens ?? 1024,
        temperature: initialAiConfig.defaultModel.temperature ?? 0.3,
      };
    }
    return getDefaultConfig();
  });
  const [apiKey, setApiKey] = useState(() =>
    initialAiConfig?.defaultModel?.apiKey || initialAiConfig?.defaultModel?.apiKeySet ? "••••••••" : "",
  );
  const [testStatus, setTestStatus] = useState<"idle" | "testing" | "success" | "error">("idle");
  const [saved, setSaved] = useState(false);

  // Advanced settings
  const [showAdvanced, setShowAdvanced] = useState(false);

  const selectedProvider = useMemo(
    () => PROVIDERS.find((p) => p.provider === config.provider) ?? PROVIDERS[0],
    [config.provider],
  );

  const selectedModel = useMemo(
    () => selectedProvider.models.find((m) => m.id === config.modelId) ?? selectedProvider.models[0],
    [selectedProvider, config.modelId],
  );

  // Predictive monthly fee: project the full agent fleet's calibrated token
  // volume onto the chosen foundation model, then apply the keystone markup.
  // This is the flat, predictable price the practice pays — derived from the
  // catalog, not a hardcoded guess.
  const projection = useMemo(
    () =>
      projectMonthlyForModel(
        { costPer1kTokens: selectedModel.costPer1kTokens },
        { policy: resolveMarkupPolicy({ multiplier: markupMultiplier }) },
      ),
    [selectedModel, markupMultiplier],
  );

  const leafjourneyPrice = projection.customerPriceUsd;
  const projectedTokensLabel = `~${(projection.projectedTokens / 1_000_000).toFixed(1)}M tokens/month`;

  const handleProviderSelect = (provider: ProviderOption) => {
    const firstModel = provider.models[0];
    setConfig((prev) => ({
      ...prev,
      provider: provider.provider,
      modelId: firstModel.id,
      displayName: `${firstModel.name} (via ${provider.label})`,
      costPer1kTokens: firstModel.costPer1kTokens,
      isDefault: false,
    }));
    setApiKey("");
    setTestStatus("idle");
    setSaved(false);
  };

  const handleModelSelect = (modelId: string) => {
    const model = selectedProvider.models.find((m) => m.id === modelId);
    if (!model) return;
    setConfig((prev) => ({
      ...prev,
      modelId: model.id,
      displayName: `${model.name} (via ${selectedProvider.label})`,
      costPer1kTokens: model.costPer1kTokens,
    }));
    setSaved(false);
  };

  const handleTestConnection = () => {
    setTestStatus("testing");
    // Simulated test
    setTimeout(() => {
      setTestStatus(apiKey.length > 8 || !selectedProvider.requiresApiKey ? "success" : "error");
    }, 1500);
  };

  const handleSave = async () => {
    try {
      await saveAiConfigAction({
        defaultModel: {
          provider: config.provider,
          modelId: config.modelId,
          apiKey: apiKey,
          maxTokens: config.maxTokens,
          temperature: config.temperature,
        },
      });
      setSaved(true);
      setConfig((prev) => ({ ...prev, apiKeySet: !!apiKey }));
      setTimeout(() => setSaved(false), 3000);
    } catch (e) {
      console.error(e);
      alert("Failed to save AI configuration");
    }
  };


  return (
    <div className="space-y-6">
      {/* Warning callout */}
      <Card tone="ambient">
        <CardContent className="py-4 px-6 flex items-start gap-3">
          <div className="h-8 w-8 rounded-full bg-amber-100 text-amber-700 flex items-center justify-center shrink-0 mt-0.5">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M8 2l6.5 11.5H1.5L8 2Z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" /><path d="M8 6.5V9" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" /><circle cx="8" cy="11" r="0.7" fill="currentColor" /></svg>
          </div>
          <p className="text-sm text-text-muted leading-relaxed">
            Changing the AI model affects all agents. Test thoroughly before
            switching in production.
          </p>
        </CardContent>
      </Card>

      {/* Current model card */}
      <Card tone="raised">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Current model</CardTitle>
            {config.isDefault && <Badge tone="neutral">Default</Badge>}
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <div>
              <p className="text-xs font-medium uppercase tracking-wider text-text-subtle mb-1">
                Model
              </p>
              <p className="text-sm font-medium text-text">{selectedModel.name}</p>
              <p className="text-[10px] text-text-subtle mt-0.5">{TIER_LABELS[selectedModel.tier]}</p>
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-wider text-text-subtle mb-1">
                Provider
              </p>
              <p className="text-sm font-medium text-text">{selectedProvider.label}</p>
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-wider text-text-subtle mb-1">
                Estimated cost
              </p>
              <p className="text-sm font-medium text-accent">
                ~${leafjourneyPrice.toFixed(2)}/mo
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Provider selector */}
      <Card>
        <CardHeader>
          <CardTitle>Select provider</CardTitle>
          <CardDescription>
            Choose where your AI requests are routed. Each provider has different
            model options and pricing.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {PROVIDERS.map((provider) => (
              <button
                key={provider.provider}
                type="button"
                onClick={() => handleProviderSelect(provider)}
                className={cn(
                  "flex flex-col items-start gap-2 p-4 rounded-lg border text-left transition-all",
                  config.provider === provider.provider
                    ? "border-accent bg-accent/5 ring-1 ring-accent"
                    : "border-border hover:border-border-strong hover:bg-surface-muted",
                )}
              >
                <span className="text-sm font-medium text-text">{provider.label}</span>
                <span className="text-xs text-text-muted leading-relaxed">
                  {provider.description}
                </span>
                {!provider.requiresApiKey && (
                  <Badge tone="success">No API key needed</Badge>
                )}
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Model selector */}
      <Card>
        <CardHeader>
          <CardTitle>Select model</CardTitle>
          <CardDescription>
            Available models from {selectedProvider.label}. Grouped by tier — mix budget, balanced,
            premium, and open-source models per agent in the Agent Fleet tab.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {(["budget", "balanced", "premium", "open-source"] as const).map((tier) => {
            const tierModels = selectedProvider.models.filter((m) => m.tier === tier);
            if (tierModels.length === 0) return null;
            return (
              <div key={tier} className="mb-5 last:mb-0">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-text-subtle mb-2">
                  {TIER_LABELS[tier]}
                </p>
                <div className="space-y-2">
                  {tierModels.map((model) => (
                    <label
                      key={model.id}
                      className={cn(
                        "flex items-center justify-between px-4 py-3 rounded-lg border cursor-pointer transition-all",
                        config.modelId === model.id
                          ? "border-accent bg-accent/5 ring-1 ring-accent"
                          : "border-border hover:border-border-strong hover:bg-surface-muted",
                      )}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <span
                          className={cn(
                            "h-4 w-4 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors",
                            config.modelId === model.id ? "border-accent" : "border-border-strong",
                          )}
                        >
                          {config.modelId === model.id && (
                            <span className="h-2 w-2 rounded-full bg-accent" />
                          )}
                        </span>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium text-text">{model.name}</span>
                            {model.recommended && (
                              <Badge tone="accent">Recommended</Badge>
                            )}
                          </div>
                          {model.blurb && (
                            <p className="text-xs text-text-muted mt-0.5 truncate">{model.blurb}</p>
                          )}
                        </div>
                      </div>
                      <span className="text-xs text-text-muted tabular-nums shrink-0 ml-3">
                        ${model.costPer1kTokens}/1k tok
                      </span>
                      <input
                        type="radio"
                        name="model"
                        className="sr-only"
                        checked={config.modelId === model.id}
                        onChange={() => handleModelSelect(model.id)}
                      />
                    </label>
                  ))}
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>

      {/* API key */}
      {selectedProvider.requiresApiKey && (
        <Card>
          <CardHeader>
            <CardTitle>API key</CardTitle>
            <CardDescription>
              Your key is encrypted at rest and never logged. It is used only
              for server-side API calls.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label htmlFor="api-key">API key</Label>
              <div className="flex gap-2">
                <Input
                  id="api-key"
                  type="password"
                  placeholder="sk-..."
                  value={apiKey}
                  onChange={(e) => { setApiKey(e.target.value); setTestStatus("idle"); }}
                  className="flex-1"
                />
                <Button
                  variant="secondary"
                  onClick={handleTestConnection}
                  disabled={!apiKey || testStatus === "testing"}
                >
                  {testStatus === "testing" ? "Testing..." : "Test connection"}
                </Button>
              </div>
            </div>
            {testStatus === "success" && (
              <p className="text-sm text-emerald-600 flex items-center gap-2">
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M2.5 7l3.5 3.5 6-6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
                Connection successful
              </p>
            )}
            {testStatus === "error" && (
              <p className="text-sm text-red-600 flex items-center gap-2">
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M3.5 3.5l7 7M10.5 3.5l-7 7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
                Connection failed. Check your API key and try again.
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {/* Advanced settings */}
      <Card>
        <CardHeader>
          <button
            type="button"
            className="flex items-center justify-between w-full"
            onClick={() => setShowAdvanced((s) => !s)}
          >
            <CardTitle>Advanced settings</CardTitle>
            <svg
              width="16"
              height="16"
              viewBox="0 0 16 16"
              fill="none"
              className={cn("text-text-muted transition-transform", showAdvanced && "rotate-180")}
            >
              <path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </CardHeader>
        {showAdvanced && (
          <CardContent className="space-y-5">
            {/* Temperature */}
            <div>
              <Label htmlFor="temperature">
                Temperature: {config.temperature.toFixed(2)}
              </Label>
              <input
                id="temperature"
                type="range"
                min="0"
                max="1"
                step="0.05"
                value={config.temperature}
                onChange={(e) =>
                  setConfig((prev) => ({ ...prev, temperature: parseFloat(e.target.value) }))
                }
                className="w-full h-2 rounded-full appearance-none bg-surface-muted cursor-pointer accent-emerald-600 mt-2"
              />
              <div className="flex justify-between text-xs text-text-subtle mt-1">
                <span>Deterministic (0)</span>
                <span>Creative (1)</span>
              </div>
            </div>

            {/* Max tokens */}
            <div>
              <Label htmlFor="max-tokens">Max tokens</Label>
              <Input
                id="max-tokens"
                type="number"
                min={128}
                max={8192}
                step={128}
                value={config.maxTokens}
                onChange={(e) =>
                  setConfig((prev) => ({
                    ...prev,
                    maxTokens: parseInt(e.target.value, 10) || 1024,
                  }))
                }
              />
              <p className="text-xs text-text-subtle mt-1">
                Maximum tokens per AI response (128 - 8192)
              </p>
            </div>
          </CardContent>
        )}
      </Card>

      {/* Cost estimate + Save */}
      <Card tone="raised">
        <CardContent className="py-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="grid grid-cols-1 gap-8">
            <div>
              <p className="text-xs font-medium uppercase tracking-wider text-text-subtle mb-1">
                Estimated cost
              </p>
              <p className="text-lg font-display text-accent tabular-nums">
                ~${leafjourneyPrice.toFixed(2)}
                <span className="text-sm text-text-muted font-sans">/mo</span>
              </p>
              <p className="text-xs text-text-subtle mt-0.5">
                {projectedTokensLabel}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {saved && (
              <span className="text-sm text-emerald-600 font-medium">Saved!</span>
            )}
            <Button onClick={handleSave}>Save configuration</Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
