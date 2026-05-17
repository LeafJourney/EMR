import { logger } from "@/lib/observability/log";

/**
 * DeepSeek AI client for clinical text translation.
 * Uses OpenRouter as the AI provider.
 */
export async function translateEffectsToTherapeuticTags(recreationalEffects: string[]): Promise<string[]> {
  if (!recreationalEffects.length) return [];

  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    logger.warn({ event: "deepseek.translation.skipped", message: "OPENROUTER_API_KEY is not set. Returning empty tags." });
    return [];
  }

  try {
    const prompt = `Translate the following recreational cannabis effects into clinical therapeutic tags (symptoms/conditions).
For example, if effects include "Sleepy", "Relaxed", translate to ["Insomnia", "Anxiety"]. 
Return ONLY a JSON array of strings. No markdown formatting, no explanations.

Effects: ${recreationalEffects.join(", ")}`;

    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "deepseek/deepseek-chat",
        messages: [{ role: "user", content: prompt }],
      }),
    });

    if (!response.ok) {
      throw new Error(`OpenRouter API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    const content = data.choices[0]?.message?.content?.trim() || "[]";
    
    // Attempt to parse JSON safely
    const parsed = JSON.parse(content);
    if (Array.isArray(parsed)) {
      return parsed;
    }
    return [];
  } catch (error) {
    logger.error({ event: "deepseek.translation.failed", error });
    return []; // fallback
  }
}
