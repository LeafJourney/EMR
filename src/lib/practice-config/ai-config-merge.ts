// Pure merge for a practice's aiConfig edit (EMR-757 regression guard).
//
// The AI-config save action used to rebuild aiConfig as `{ defaultModel, fleet }`,
// which silently dropped any key the editor didn't touch — most critically
// `fleetDefaultEnabled`, the ship-inert flag. The result: the first model/API-key
// save on a brand-new (inert) practice erased the flag, and resolveFleetEnabled's
// `?? true` then turned the ENTIRE agent fleet live. This merge spreads the
// existing config first so untouched keys survive every edit.

const MASKED_API_KEY = "••••••••";

export interface AiConfigInput {
  defaultModel?: {
    provider: string;
    modelId: string;
    apiKey?: string;
    maxTokens?: number;
    temperature?: number;
  };
  fleet?: Record<string, { enabled?: boolean; modelId?: string | null }>;
}

export function mergeAiConfig(
  existingAiConfig: Record<string, any>,
  data: AiConfigInput,
): Record<string, any> {
  let defaultModel = existingAiConfig.defaultModel ?? {};
  if (data.defaultModel) {
    // A masked placeholder means "leave the stored key untouched".
    const apiKey =
      data.defaultModel.apiKey === MASKED_API_KEY
        ? defaultModel.apiKey
        : data.defaultModel.apiKey;
    defaultModel = {
      provider: data.defaultModel.provider,
      modelId: data.defaultModel.modelId,
      apiKey: apiKey ?? "",
      maxTokens: data.defaultModel.maxTokens,
      temperature: data.defaultModel.temperature,
    };
  }

  const fleet = {
    ...(existingAiConfig.fleet ?? {}),
    ...(data.fleet ?? {}),
  };

  // Spread existing FIRST so fleetDefaultEnabled (and any future keys) survive.
  return { ...existingAiConfig, defaultModel, fleet };
}
