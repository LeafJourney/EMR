import type { LeaflyStrainData } from "../integrations/leafly-client";

export interface ClinicalTranslation {
  chemotype: number;
  therapeuticTags: string[];
}

export async function translateStrainToClinical(strain: LeaflyStrainData): Promise<ClinicalTranslation> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  
  if (!apiKey) {
    // Fallback logic for testing/missing keys
    return {
      chemotype: strain.thcLevel > strain.cbdLevel ? 1 : 3,
      therapeuticTags: strain.effects.map(e => e === "Happy" ? "Antidepressant" : "Anxiolytic / Muscle Relaxation")
    };
  }

  const prompt = `You are a clinical cannabis expert. Translate the following recreational strain data into clinical data.
Strain: ${strain.name}
THC: ${strain.thcLevel}% | CBD: ${strain.cbdLevel}%
Effects: ${strain.effects.join(", ")}

Respond ONLY with a JSON object containing:
- chemotype (number): 1 for THC dominant, 2 for Mixed, 3 for CBD dominant.
- therapeuticTags (array of strings): Map effects to clinical terms like "Insomnia", "Anxiolytic / Muscle Relaxation", "Antidepressant", "Appetite Stimulation", "ADHD / Cognitive Focus".`;

  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: "deepseek/deepseek-chat",
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_object" }
    })
  });

  if (!res.ok) throw new Error("OpenRouter API failed");
  const json = await res.json();
  const content = json.choices[0].message.content;
  return JSON.parse(content) as ClinicalTranslation;
}
