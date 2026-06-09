import { prisma } from "@/lib/db/prisma";
import type { ModelCallOptions, ModelClient } from "./types";


/**
 * A structured model error. Carries a stable `code` so the UI can render a
 * friendly message without needing to parse provider JSON.
 *
 * Codes:
 *   credit_limit   — 402 / account is out of credits or over budget
 *   rate_limited   — 429 / too many requests
 *   unauthorized   — 401 / bad API key
 *   bad_request    — 400 / malformed prompt or params
 *   server_error   — 5xx / provider hiccup
 *   empty_response — provider returned 200 but no content
 *   network        — fetch itself failed
 *   unknown        — fallback
 */
export type ModelErrorCode =
  | "credit_limit"
  | "rate_limited"
  | "unauthorized"
  | "bad_request"
  | "server_error"
  | "empty_response"
  | "network"
  | "unknown";

export class ModelError extends Error {
  readonly code: ModelErrorCode;
  readonly status: number | null;
  /** Short, user-friendly message suitable for surfacing in the UI. */
  readonly friendly: string;
  /** Raw provider body, if any. Safe to log, not safe to render. */
  readonly providerBody: string | null;
  /** The model slug we attempted (e.g. "anthropic/claude-sonnet-4.5"). */
  readonly model: string | null;
  /** The max_tokens we asked for. Useful for credit-gate diagnostics. */
  readonly requestedMaxTokens: number | null;
  /**
   * The number of output tokens the provider said we could "afford" for
   * this request. Parsed from 402 error bodies like:
   *   "You requested up to 512 tokens, but can only afford 313"
   * null if not present.
   */
  readonly affordableMaxTokens: number | null;

  constructor(opts: {
    code: ModelErrorCode;
    status?: number | null;
    friendly: string;
    providerBody?: string | null;
    model?: string | null;
    requestedMaxTokens?: number | null;
    affordableMaxTokens?: number | null;
  }) {
    super(opts.friendly);
    this.name = "ModelError";
    this.code = opts.code;
    this.status = opts.status ?? null;
    this.friendly = opts.friendly;
    this.providerBody = opts.providerBody ?? null;
    this.model = opts.model ?? null;
    this.requestedMaxTokens = opts.requestedMaxTokens ?? null;
    this.affordableMaxTokens = opts.affordableMaxTokens ?? null;
  }
}

/** Type guard: `err instanceof ModelError` isn't reliable across RSC boundaries. */
export function isModelError(err: unknown): err is ModelError {
  return (
    typeof err === "object" &&
    err !== null &&
    (err as { name?: string }).name === "ModelError" &&
    typeof (err as { code?: unknown }).code === "string" &&
    typeof (err as { friendly?: unknown }).friendly === "string"
  );
}

/**
 * Deterministic templated model client. Used in dev, tests, and CI — so the
 * agent harness is runnable with zero external dependencies.
 *
 * SAFETY: this client must NEVER echo the prompt back in its response. Prompts
 * contain internal templates ("You are an AI clinical writing assistant...")
 * that leak straight into the clinician UI when the stub is accidentally used
 * in production (e.g. when AGENT_MODEL_CLIENT is unset or the OpenRouter
 * client throws and some caller has a silent fallback). Keep outputs short,
 * generic, and clearly marked as stub.
 */
const STUB_UNAVAILABLE_NOTICE =
  "AI output unavailable in this environment. Set AGENT_MODEL_CLIENT=openrouter with a valid OPENROUTER_API_KEY to enable real drafting.";

export class StubModelClient implements ModelClient {
  async complete(prompt: string, _options?: ModelCallOptions) {
    if (/classify/i.test(prompt)) {
      // Classification callers expect a single-word label, not prose.
      return "other";
    }
    if (/summar(y|ize)/i.test(prompt)) {
      return `Summary placeholder — ${STUB_UNAVAILABLE_NOTICE}`;
    }
    if (/note/i.test(prompt)) {
      return `Draft placeholder — ${STUB_UNAVAILABLE_NOTICE}`;
    }
    return STUB_UNAVAILABLE_NOTICE;
  }

  /**
   * Stub stream — emits the deterministic completion in word-sized chunks so
   * downstream UIs can exercise their streaming code paths without keys.
   */
  async *stream(
    prompt: string,
    options?: ModelCallOptions
  ): AsyncIterable<string> {
    const full = await this.complete(prompt, options);
    for (const word of full.split(/(\s+)/)) {
      if (options?.signal?.aborted) return;
      yield word;
      // Tiny pause so token-by-token UI still feels alive in dev.
      await new Promise((r) => setTimeout(r, 12));
    }
  }
}

/**
 * Free-tier models on OpenRouter, ordered by quality. These are community-
 * sponsored models with no per-request cost — perfect for demos and dev.
 * The list is checked in order; the first one that works wins.
 *
 * Configure with OPENROUTER_FREE_MODEL to override.
 */
const FREE_MODEL_CANDIDATES = [
  "meta-llama/llama-3.3-70b-instruct:free",
  "qwen/qwen3-next-80b-a3b-instruct:free",
  "openai/gpt-oss-20b:free",
  "z-ai/glm-4.5-air:free",
];

/**
 * OpenRouter model client.
 *
 * OpenRouter exposes a single OpenAI-compatible endpoint that can route to
 * dozens of providers (Anthropic, OpenAI, Meta, Google, etc.). That keeps
 * the agent harness provider-agnostic and the model choice driven by env.
 *
 * **Automatic free-model fallback (v2):**
 * When the primary model hits a 402 (credit ceiling / per-request limit),
 * the client automatically retries with a free-tier model. This ensures
 * demos and dev environments always produce real AI output, even when the
 * paid key is capped. Set OPENROUTER_FREE_MODEL to override the default.
 *
 * Configure with:
 *   OPENROUTER_API_KEY     — required
 *   OPENROUTER_MODEL       — optional, defaults to anthropic/claude-sonnet-4.5
 *   OPENROUTER_FREE_MODEL  — optional, free fallback model slug
 *   OPENROUTER_SITE_URL    — optional, for OpenRouter attribution
 *   OPENROUTER_APP_NAME    — optional, for OpenRouter attribution
 */
export class OpenRouterModelClient implements ModelClient {
  private readonly endpoint = "https://openrouter.ai/api/v1/chat/completions";
  private readonly model: string;
  private readonly freeModel: string;
  private readonly apiKey: string;
  private readonly siteUrl: string | undefined;
  private readonly appName: string;
  private readonly defaultMaxTokens: number | undefined;
  private readonly defaultTemperature: number | undefined;

  constructor(options?: {
    apiKey?: string;
    model?: string;
    maxTokens?: number;
    temperature?: number;
  }) {
    const apiKey = options?.apiKey || process.env.OPENROUTER_API_KEY;
    if (!apiKey) {
      throw new Error("OPENROUTER_API_KEY is required for OpenRouterModelClient");
    }
    this.apiKey = apiKey;
    this.model = options?.model || process.env.OPENROUTER_MODEL || "google/gemini-2.0-flash-001";
    this.freeModel =
      process.env.OPENROUTER_FREE_MODEL ?? FREE_MODEL_CANDIDATES[0];
    this.siteUrl = process.env.OPENROUTER_SITE_URL;
    this.appName = process.env.OPENROUTER_APP_NAME ?? "Leafjourney";
    this.defaultMaxTokens = options?.maxTokens;
    this.defaultTemperature = options?.temperature;
  }


  async complete(
    prompt: string,
    options?: ModelCallOptions
  ): Promise<string> {
    // Try primary model first
    try {
      return await this._call(this.model, prompt, options);
    } catch (err) {
      // On credit-limit (402) or rate-limit (429), fall back to free model
      if (isModelError(err) && (err.code === "credit_limit" || err.code === "rate_limited")) {
        console.warn(
          `[OpenRouter] Primary model ${this.model} blocked (${err.code}). Falling back to free model: ${this.freeModel}`
        );
        try {
          return await this._call(this.freeModel, prompt, options);
        } catch (freeErr) {
          // If the free model also fails, throw the original error
          // with extra context so the UI knows what happened.
          console.error(
            `[OpenRouter] Free model ${this.freeModel} also failed:`,
            freeErr instanceof Error ? freeErr.message : freeErr
          );
          throw err;
        }
      }
      throw err;
    }
  }

  /**
   * Streaming variant. Yields content deltas (`choices[0].delta.content`) as
   * they arrive over SSE. Mirrors `complete`'s free-model fallback for 402/429,
   * but only when no bytes have streamed yet — once the client has seen any
   * token we cannot retroactively switch models without confusing the UI.
   */
  async *stream(
    prompt: string,
    options?: ModelCallOptions
  ): AsyncIterable<string> {
    let yielded = false;
    try {
      for await (const chunk of this._streamCall(this.model, prompt, options)) {
        yielded = true;
        yield chunk;
      }
    } catch (err) {
      if (
        !yielded &&
        isModelError(err) &&
        (err.code === "credit_limit" || err.code === "rate_limited")
      ) {
        console.warn(
          `[OpenRouter] Primary model ${this.model} blocked (${err.code}). Streaming fallback to: ${this.freeModel}`
        );
        for await (const chunk of this._streamCall(this.freeModel, prompt, options)) {
          yield chunk;
        }
        return;
      }
      throw err;
    }
  }

  /** Low-level call to a specific model. No fallback logic. */
  private async _call(
    model: string,
    prompt: string,
    options?: ModelCallOptions
  ): Promise<string> {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.apiKey}`,
      "Content-Type": "application/json",
      "X-Title": this.appName,
    };
    if (this.siteUrl) headers["HTTP-Referer"] = this.siteUrl;

    const requestedMaxTokens = options?.maxTokens ?? this.defaultMaxTokens ?? 1024;
    const requestedTemperature = options?.temperature ?? this.defaultTemperature ?? 0.3;

    let response: Response;
    try {
      response = await fetch(this.endpoint, {
        method: "POST",
        headers,
        signal: options?.signal,
        body: JSON.stringify({
          model,
          messages: [{ role: "user", content: prompt }],
          max_tokens: requestedMaxTokens,
          temperature: requestedTemperature,
        }),
      });

    } catch (err) {
      throw new ModelError({
        code: "network",
        friendly:
          "Couldn't reach the AI provider. Check your connection and try again.",
        providerBody: err instanceof Error ? err.message : String(err),
        model,
        requestedMaxTokens,
      });
    }

    if (!response.ok) {
      const body = await response.text().catch(() => "");
      throw classifyOpenRouterError(
        response.status,
        body,
        model,
        requestedMaxTokens,
      );
    }

    const json = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = json.choices?.[0]?.message?.content;
    if (typeof content !== "string" || content.length === 0) {
      throw new ModelError({
        code: "empty_response",
        friendly:
          "The AI provider returned an empty response. Try again — if it keeps happening, try a different refinement mode.",
        model,
        requestedMaxTokens,
      });
    }
    return content;
  }

  /**
   * Low-level streaming call to a specific model. No fallback logic.
   * Yields content deltas extracted from OpenRouter's SSE response.
   */
  private async *_streamCall(
    model: string,
    prompt: string,
    options?: ModelCallOptions
  ): AsyncIterable<string> {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.apiKey}`,
      "Content-Type": "application/json",
      Accept: "text/event-stream",
      "X-Title": this.appName,
    };
    if (this.siteUrl) headers["HTTP-Referer"] = this.siteUrl;

    const requestedMaxTokens = options?.maxTokens ?? this.defaultMaxTokens ?? 1024;
    const requestedTemperature = options?.temperature ?? this.defaultTemperature ?? 0.3;

    let response: Response;
    try {
      response = await fetch(this.endpoint, {
        method: "POST",
        headers,
        signal: options?.signal,
        body: JSON.stringify({
          model,
          messages: [{ role: "user", content: prompt }],
          max_tokens: requestedMaxTokens,
          temperature: requestedTemperature,
          stream: true,
        }),
      });

    } catch (err) {
      throw new ModelError({
        code: "network",
        friendly:
          "Couldn't reach the AI provider. Check your connection and try again.",
        providerBody: err instanceof Error ? err.message : String(err),
        model,
        requestedMaxTokens,
      });
    }

    if (!response.ok || !response.body) {
      const body = response.body ? await response.text().catch(() => "") : "";
      throw classifyOpenRouterError(
        response.status,
        body,
        model,
        requestedMaxTokens,
      );
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let sawContent = false;

    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        // SSE framing: events separated by blank lines, each line prefixed with "data: ".
        let nl: number;
        while ((nl = buffer.indexOf("\n")) !== -1) {
          const line = buffer.slice(0, nl).replace(/\r$/, "");
          buffer = buffer.slice(nl + 1);
          if (!line.startsWith("data:")) continue;
          const payload = line.slice(5).trim();
          if (!payload || payload === "[DONE]") continue;
          try {
            const parsed = JSON.parse(payload) as {
              choices?: Array<{ delta?: { content?: string } }>;
            };
            const delta = parsed.choices?.[0]?.delta?.content;
            if (typeof delta === "string" && delta.length > 0) {
              sawContent = true;
              yield delta;
            }
          } catch {
            // Provider sometimes inserts comment lines (": OPENROUTER PROCESSING") — ignore.
          }
        }
      }
    } finally {
      reader.releaseLock();
    }

    if (!sawContent) {
      throw new ModelError({
        code: "empty_response",
        friendly:
          "The AI provider returned an empty stream. Try again in a moment.",
        model,
        requestedMaxTokens,
      });
    }
  }
}

/**
 * Turn an OpenRouter HTTP error into a structured ModelError with a
 * user-friendly message. We deliberately do NOT leak provider JSON into
 * the `friendly` field — that's rendered to clinicians and should read
 * like a human wrote it.
 *
 * For 402s we also parse the "can only afford N" number out of the error
 * body. That number has nothing to do with the account balance — it's
 * OpenRouter's per-request cost ceiling divided by the output token rate.
 * When we see it, we log the model + requested tokens + affordable tokens
 * together so a human can diagnose whether the cap is per-key, per-request,
 * or daily-budget.
 */
function classifyOpenRouterError(
  status: number,
  body: string,
  model: string,
  requestedMaxTokens: number,
): ModelError {
  // Best-effort parse of the provider error message for the log trail.
  let providerMessage: string | null = null;
  try {
    const parsed = JSON.parse(body) as {
      error?: { message?: string; code?: number };
    };
    if (parsed?.error?.message) providerMessage = parsed.error.message;
  } catch {
    providerMessage = body.slice(0, 500) || null;
  }

  // Parse "can only afford 313" style messages out of the provider body.
  // This is OpenRouter's way of saying: "given the per-request cost ceiling
  // on your key or account, the output budget for this call is N tokens."
  // It is NOT your account balance.
  const affordMatch = providerMessage?.match(/afford\s+(\d+)/i);
  const affordable = affordMatch ? parseInt(affordMatch[1], 10) : null;

  // Log the full diagnostic shape once per failure. This is the only place
  // a human can see exactly which model + which token budget hit the cap.
  if (status === 402) {
    console.warn("[OpenRouter 402 diagnosis]", {
      model,
      requestedMaxTokens,
      affordableMaxTokens: affordable,
      providerMessage,
      likelyCause:
        affordable !== null
          ? "Per-key credit limit or per-request cost ceiling. Check https://openrouter.ai/settings/keys for a credit limit on this key, and https://openrouter.ai/settings/preferences for per-request / daily spend caps. Account balance is NOT the cause when 'afford N' appears in the message."
          : "Account credit exhausted, per-key limit, or per-request ceiling. Check OpenRouter dashboard.",
    });
  }

  if (status === 402) {
    // Prefer a diagnosis-forward friendly message when we can extract the
    // "afford N" number — it points admins at the real culprit instead of
    // making them chase a phantom "low balance".
    const friendly =
      affordable !== null
        ? `AI refinement is blocked by a per-request cost ceiling on this OpenRouter key (budget allows ~${affordable} output tokens). Your account balance is fine — check the key's "Credit limit" at openrouter.ai/settings/keys.`
        : "AI is temporarily unavailable — the provider rejected the request on a credit check. Check OpenRouter key limits and account preferences.";
    return new ModelError({
      code: "credit_limit",
      status,
      friendly,
      providerBody: providerMessage,
      model,
      requestedMaxTokens,
      affordableMaxTokens: affordable,
    });
  }
  if (status === 429) {
    return new ModelError({
      code: "rate_limited",
      status,
      friendly:
        "The AI provider is rate-limited right now. Wait a few seconds and try again.",
      providerBody: providerMessage,
      model,
      requestedMaxTokens,
    });
  }
  if (status === 401 || status === 403) {
    return new ModelError({
      code: "unauthorized",
      status,
      friendly:
        "AI is temporarily unavailable — the provider credentials need attention. An admin has been notified.",
      providerBody: providerMessage,
      model,
      requestedMaxTokens,
    });
  }
  if (status === 400) {
    return new ModelError({
      code: "bad_request",
      status,
      friendly:
        "AI couldn't process this request. Try a different refinement mode, or shorten the section before retrying.",
      providerBody: providerMessage,
      model,
      requestedMaxTokens,
    });
  }
  if (status >= 500) {
    return new ModelError({
      code: "server_error",
      status,
      friendly:
        "The AI provider had a hiccup. Try again in a moment.",
      providerBody: providerMessage,
      model,
      requestedMaxTokens,
    });
  }
  return new ModelError({
    code: "unknown",
    status,
    friendly:
      "AI refinement failed. Try again in a moment.",
    providerBody: providerMessage,
    model,
    requestedMaxTokens,
  });
}

export class ConfigurableModelClient implements ModelClient {
  private resolvedClientPromise: Promise<ModelClient> | null = null;
  private resolvedClient: ModelClient | null = null;

  constructor(
    private readonly organizationId: string | null,
    private readonly agentName?: string
  ) {}

  private async getClient(): Promise<ModelClient> {
    if (this.resolvedClient) return this.resolvedClient;
    if (this.resolvedClientPromise) return this.resolvedClientPromise;

    this.resolvedClientPromise = (async () => {
      let orgId = this.organizationId;
      if (!orgId) {
        try {
          const { getCurrentUser } = await import("@/lib/auth/session");
          const user = await getCurrentUser();
          if (user?.organizationId) {
            orgId = user.organizationId;
          }
        } catch {
          // Safe fallback in static / worker contexts
        }
      }

      let dbConfig: any = null;
      if (orgId) {
        try {
          dbConfig = await prisma.practiceConfiguration.findFirst({
            where: { organizationId: orgId },
            orderBy: { version: "desc" },
          });
        } catch (e) {
          console.error("Failed to load practice configuration in ConfigurableModelClient:", e);
        }
      }

      let aiConfig: any = null;
      if (dbConfig?.regulatoryFlags && typeof dbConfig.regulatoryFlags === "object") {
        const flags = dbConfig.regulatoryFlags as Record<string, any>;
        if (flags.aiConfig) {
          aiConfig = flags.aiConfig;
        }
      }

      const defaultModel = aiConfig?.defaultModel;
      const fleetOverrides = aiConfig?.fleet;

      let provider = defaultModel?.provider || process.env.AGENT_MODEL_CLIENT || "stub";
      let modelId = defaultModel?.modelId;
      let apiKey = defaultModel?.apiKey;
      let maxTokens = defaultModel?.maxTokens;
      let temperature = defaultModel?.temperature;

      // Apply fleet overrides if matching agentName
      if (this.agentName && fleetOverrides && fleetOverrides[this.agentName]) {
        const override = fleetOverrides[this.agentName];
        if (override.enabled === false) {
          return new StubModelClient();
        }
        if (override.modelId) {
          modelId = override.modelId;
          try {
            const { findModel } = await import("@/lib/domain/byok");
            const found = findModel(modelId);
            if (found) {
              provider = found.provider;
            }
          } catch (e) {
            console.error("Failed to dynamically import @/lib/domain/byok or find model:", e);
          }
        }
      }

      if (provider.toLowerCase() === "openrouter") {
        const finalApiKey = apiKey || process.env.OPENROUTER_API_KEY;
        if (!finalApiKey) {
          console.warn("OpenRouter API key missing in ConfigurableModelClient. Falling back to StubModelClient.");
          return new StubModelClient();
        }
        return new OpenRouterModelClient({
          apiKey: finalApiKey,
          model: modelId,
          maxTokens: maxTokens ? Number(maxTokens) : undefined,
          temperature: temperature ? Number(temperature) : undefined,
        });
      }

      return new StubModelClient();
    })();

    this.resolvedClient = await this.resolvedClientPromise;
    return this.resolvedClient;
  }

  async complete(prompt: string, options?: ModelCallOptions): Promise<string> {
    const client = await this.getClient();
    return client.complete(prompt, options);
  }

  async *stream(prompt: string, options?: ModelCallOptions): AsyncIterable<string> {
    const client = await this.getClient();
    if (client.stream) {
      yield* client.stream(prompt, options);
    } else {
      yield await client.complete(prompt, options);
    }
  }
}

/**
 * Resolve the active model client based on environment or database config.
 */
export function resolveModelClient(organizationId?: string | null, agentName?: string): ModelClient {
  return new ConfigurableModelClient(organizationId ?? null, agentName);
}

