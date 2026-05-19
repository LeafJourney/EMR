import { NextResponse } from "next/server";
import { logger } from "@/lib/observability/log";

// Mock RAG index for Cannabis and Cancer book
const CANNABIS_CANCER_BOOK_EXCERPTS = [
  "In multiple case studies, high-dose RSO (Rick Simpson Oil) has been correlated with reduced tumor size in certain basal cell carcinomas.",
  "THC and CBD have both shown apoptotic (cell death) properties in vitro against various cancer cell lines.",
  "Dosing protocols in the book often recommend titrating up to 60 grams of RSO over a 90-day period for severe cases.",
  "While the book documents many successful cases, clinical trials remain limited and dosing isn't uniformly characterized across all oncology subsets."
];

export async function POST(req: Request) {
  try {
    const { message } = await req.json();
    
    // Check if OpenRouter key exists
    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) {
      // Fallback response if no key
      return NextResponse.json({
        content: `I'm currently in offline mode. However, referring to Justin Kander's Cannabis and Cancer book: ${CANNABIS_CANCER_BOOK_EXCERPTS[0]}`,
        sources: ["Justin Kander: Cannabis and Cancer (Offline DB)"]
      });
    }

    const prompt = `You are ChatCB, a clinical research synthesizer.
The user is asking: "${message}"

Use the following excerpts from Justin Kander's "Cannabis and Cancer" book to help formulate your answer:
${CANNABIS_CANCER_BOOK_EXCERPTS.join("\n")}

Synthesize a helpful, clinical response. Mention the source. Keep it under 3 sentences.`;

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
      throw new Error(`OpenRouter error: ${response.status}`);
    }

    const data = await response.json();
    const content = data.choices[0]?.message?.content?.trim() || "No response generated.";

    return NextResponse.json({
      content,
      sources: ["Justin Kander: Cannabis and Cancer", "DeepSeek Clinical Synthesis"]
    });

  } catch (error) {
    logger.error({ event: "chat_cb.failed", error });
    return NextResponse.json({ error: "Failed to synthesize data." }, { status: 500 });
  }
}
